"""In-process job queue: one GPU means one job at a time, with live progress.

Engine work is blocking (torch), so it runs in a thread-pool executor. Progress
callbacks fire from that worker thread and are marshalled back onto the event
loop via ``call_soon_threadsafe`` to update state and fan out over WebSockets.
"""
from __future__ import annotations

import asyncio
import threading
import time
import logging
import re
from pathlib import Path
from typing import Optional

from .config import settings
from .engines import build_engine
from .engines.base import EngineCancelled, EnginePaused, EngineProgress, EngineRequest, MusicEngine
from .checkpoints import read_json, write_json
from .prompt_composer import compose_style, suggest_title
from .schemas import GenerateRequest, Job, JobStatus, Track


class JobManager:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self._queue: "asyncio.Queue[str]" = asyncio.Queue()
        self._cancel_events: dict[str, threading.Event] = {}
        self._pause_events: dict[str, threading.Event] = {}
        self._persisted_stage: dict[str, str] = {}
        self._last_emit: dict[str, float] = {}
        self._requests: dict[str, GenerateRequest] = {}
        self._engines: dict[str, MusicEngine] = {}
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._worker: Optional[asyncio.Task] = None
        self._model_dl: dict[str, dict] = {}  # engine -> download status

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._restore()
        self._worker = asyncio.create_task(self._run_worker())

    async def stop(self) -> None:
        for event in self._cancel_events.values():
            event.set()
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass

    def _persist(self, job):
        request = self._requests.get(job.id)
        write_json(settings.DATA_DIR / "jobs" / f"{job.id}.json", {
            "job": job.model_dump(), "request": request.model_dump() if request else None})

    def _restore(self):
        for path in (settings.DATA_DIR / "jobs").glob("job_*.json"):
            try:
                data = read_json(path)
                job = Job.model_validate(data["job"])
                if not re.fullmatch(r"job_[a-f0-9]{12}", job.id) or path.stem != job.id:
                    continue
                if job.status not in {JobStatus.done, JobStatus.cancelled, JobStatus.error}:
                    req = GenerateRequest.model_validate(data["request"])
                    if job.run_started_at is not None:
                        job.elapsed_seconds += max(0, job.updated_at - job.run_started_at)
                    job.run_started_at = None
                    if job.cancel_requested:
                        job.status = JobStatus.cancelled
                        job.stage = "cancelled"
                        job.message = "Cancelled before restart"
                        job.finished_at = job.updated_at
                    else:
                        job.status = JobStatus.paused
                        job.stage = "paused"
                        job.message = "Interrupted by restart. Resume from the last saved stage."
                        job.pause_requested = False
                        self._requests[job.id] = req
                        self._cancel_events[job.id] = threading.Event()
                        self._pause_events[job.id] = threading.Event()
                self.jobs[job.id] = job
            except Exception:
                logging.getLogger(__name__).exception("Cannot restore job journal %s", path.name)

    def _finish_run(self, job):
        if job.run_started_at is not None:
            job.elapsed_seconds += max(0, time.time() - job.run_started_at)
            job.run_started_at = None
        if job.status != JobStatus.paused:
            job.finished_at = time.time()

    def _engine(self, name: str) -> MusicEngine:
        if name not in self._engines:
            self._engines[name] = build_engine(name)
        return self._engines[name]

    # -- pub/sub -----------------------------------------------------------

    def subscribe(self, channel: str) -> "asyncio.Queue":
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.setdefault(channel, set()).add(q)
        return q

    def unsubscribe(self, channel: str, q: "asyncio.Queue") -> None:
        subs = self._subscribers.get(channel)
        if subs:
            subs.discard(q)

    def _publish(self, channel: str, event: dict) -> None:
        for q in list(self._subscribers.get(channel, ())):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:  # pragma: no cover
                pass

    def _emit(self, job: Job, *, force=False) -> None:
        """Called on the event loop; publish a snapshot to the job and global feed."""
        job.updated_at = time.time()
        changed = self._persisted_stage.get(job.id) != job.stage
        if changed or force:
            self._persist(job)
            self._persisted_stage[job.id] = job.stage
        # At most four socket updates/second per job, except stage transitions.
        now = time.monotonic()
        if not changed and not force and now - self._last_emit.get(job.id, 0) < .25:
            return
        self._last_emit[job.id] = now
        event = {"type": "job", "job": job.model_dump()}
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._publish, job.id, event)
        self._loop.call_soon_threadsafe(self._publish, "*", event)

    # -- model downloads (from Setup) --------------------------------------

    def model_status(self) -> dict:
        from . import model_manager

        out: dict = {}
        for eng in ("yue2", "llm", "cover"):  # local-weight models
            st = self._model_dl.get(eng, {})
            out[eng] = {
                "engine": eng,
                "ready": model_manager.is_ready(eng),
                "downloading": st.get("downloading", False),
                "percent": st.get("percent", 0.0),
                "speed_mbps": st.get("speed_mbps", 0.0),
                "eta_sec": st.get("eta_sec", 0.0),
                "message": st.get("message", ""),
                "error": st.get("error", ""),
            }
        return out

    def _emit_model(self, engine: str) -> None:
        if self._loop is None:
            return
        st = self.model_status().get(engine)
        self._loop.call_soon_threadsafe(
            self._publish, "*", {"type": "model", "model": st}
        )

    def start_model_download(self, engine: str) -> dict:
        from . import model_manager

        if not model_manager.is_downloadable(engine):
            return {"engine": engine, "error": "no local model for this engine"}
        if model_manager.is_ready(engine):
            return self.model_status()[engine]
        if self._model_dl.get(engine, {}).get("downloading"):
            return self.model_status()[engine]

        self._model_dl[engine] = {
            "downloading": True,
            "percent": 0.0,
            "speed_mbps": 0.0,
            "eta_sec": 0.0,
            "message": "Starting…",
            "error": "",
        }
        self._emit_model(engine)

        def work() -> None:
            def on_dl(frac, speed, eta, done, total) -> None:
                self._model_dl[engine].update(
                    percent=frac * 100,
                    speed_mbps=speed,
                    eta_sec=eta,
                    message=f"{done / 1e9:.1f}/{total / 1e9:.1f} GB",
                )
                self._emit_model(engine)

            try:
                model_manager.ensure_downloaded(engine, on_dl, lambda: False)
                self._model_dl[engine].update(
                    downloading=False, percent=100.0, message="Installed"
                )
            except Exception as exc:  # noqa: BLE001
                self._model_dl[engine].update(
                    downloading=False, error=str(exc), message="Download failed"
                )
            self._emit_model(engine)

        if self._loop:
            self._loop.run_in_executor(None, work)
        return self.model_status()[engine]

    # -- submission --------------------------------------------------------

    async def submit(self, req: GenerateRequest) -> Job:
        req = req.model_copy(deep=True)
        if req.reference_id:
            from .media_tasks import media_tasks
            reference = media_tasks.reference(req.reference_id)
            req.abc = reference["abc"]
            req.options.cot = "melody"
        if req.abc and req.options.reference_mode != "original":
            from .reference_arrangement import arrange
            # Validate source/lyrics/length before occupying the GPU. Backing
            # mode replaces this provisional vocal line with a planned one.
            arrange(req.abc, req.lyrics, "sing", req.options.max_duration,
                    req.options.reference_fit_duration, req.options.bpm)
        if req.engine and req.engine not in {"stub", "yue2"}:
            raise ValueError("Unknown generation engine")
        base = compose_style(req.pills)
        if req.extra.strip():
            base = f"{base}, {req.extra.strip()}" if base else req.extra.strip()
        style = req.style or base
        # Keep the editable prompt separate from the derived model input so
        # restoring a recipe and changing its BPM cannot accumulate tempo hints.
        req.style = style
        if req.options.bpm:
            style = f"{style}, {req.options.bpm} BPM"
        engine_name = (req.engine or settings.ENGINE).lower()
        job = Job(
            title=(req.title or "").strip() or suggest_title(req.lyrics, style),
            style=style,
            engine=engine_name,
        )
        self.jobs[job.id] = job
        self._requests[job.id] = req
        self._cancel_events[job.id] = threading.Event()
        self._pause_events[job.id] = threading.Event()
        await self._queue.put(job.id)
        self._emit(job)
        return job

    def cancel(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job:
            return False
        if job.status in {JobStatus.done, JobStatus.error, JobStatus.cancelled}:
            return False
        ev = self._cancel_events.get(job_id)
        if ev:
            ev.set()
        job.cancel_requested = True
        if job.status in {JobStatus.queued, JobStatus.paused}:
            job.status = JobStatus.cancelled
            job.stage = "cancelled"
            self._finish_run(job)
            self._emit(job)
            self._cleanup(job_id)
        else:
            job.message = "Cancellation requested; waiting for a safe interruption point"
            self._emit(job, force=True)
        return True

    def pause(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job or job.engine != "yue2" or job.status in {JobStatus.done, JobStatus.error, JobStatus.cancelled, JobStatus.paused} or job.cancel_requested:
            return False
        self._pause_events[job_id].set()
        job.pause_requested = True
        if job.status == JobStatus.queued:
            job.status = JobStatus.paused
            job.stage = "paused"
            job.pause_requested = False
        job.message = "Paused" if job.status == JobStatus.paused else "Pause requested; will stop after the current stage"
        self._emit(job, force=True)
        return True

    async def resume(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job or job.status != JobStatus.paused or job_id not in self._requests:
            return False
        self._pause_events[job_id].clear()
        self._cancel_events[job_id].clear()
        job.status = JobStatus.queued
        job.stage = "queued"
        job.pause_requested = False
        job.message = "Queued to resume from saved stages"
        await self._queue.put(job_id)
        self._emit(job)
        return True

    # -- worker ------------------------------------------------------------

    async def _run_worker(self) -> None:
        while True:
            job_id = await self._queue.get()
            job = self.jobs.get(job_id)
            if not job or job.status != JobStatus.queued:
                self._queue.task_done()
                continue
            try:
                await self._run_job(job_id)
            except Exception as exc:  # noqa: BLE001 - keep the worker alive
                job = self.jobs.get(job_id)
                if job:
                    job.status = JobStatus.error
                    job.stage = "error"
                    job.error = str(exc)
                    job.message = f"Error: {exc}"
                    self._finish_run(job)
                    self._emit(job)
                    self._cleanup(job_id)
            finally:
                self._queue.task_done()

    async def _run_job(self, job_id: str) -> None:
        job = self.jobs[job_id]
        req = self._requests[job_id]
        cancel_event = self._cancel_events[job_id]
        pause_event = self._pause_events.get(job_id, threading.Event())
        job.started_at = job.started_at or time.time()
        job.run_started_at = time.time()
        engine = self._engine(job.engine)

        out_path = settings.AUDIO_DIR / f"{job.id}.flac"
        eng_req = EngineRequest(
            style=job.style,
            lyrics=req.lyrics,
            out_path=out_path,
            cot=req.options.cot,
            seed=req.options.seed,
            cfg_scale=req.options.cfg_scale,
            abc=req.abc,
            max_duration=req.options.max_duration,
            temperature=req.options.sampling.temperature,
            top_p=req.options.sampling.top_p,
            top_k=req.options.sampling.top_k,
            repetition_penalty=req.options.sampling.repetition_penalty,
            checkpoint_dir=settings.DATA_DIR / "checkpoints" / job_id,
            is_pause_requested=pause_event.is_set,
            reference_mode=req.options.reference_mode,
            reference_fit_duration=req.options.reference_fit_duration,
            arrangement_bpm=req.options.bpm,
            memory_mode=req.options.memory_mode,
        )

        def is_cancelled() -> bool:
            return cancel_event.is_set()

        loop = asyncio.get_running_loop()

        # First-run model download (with live progress) if weights are missing.
        from . import model_manager

        if model_manager.needs_model(job.engine) and not model_manager.is_ready(
            job.engine
        ):
            job.status = JobStatus.downloading
            job.stage = "downloading"
            job.progress = 0.0
            job.message = "Preparing model download…"
            self._emit(job)

            def apply_download(frac, speed_mbps, eta, done, total) -> None:
                j = self.jobs.get(job_id)
                if not j:
                    return
                eta_txt = ""
                if eta and eta > 0:
                    m = int(eta // 60)
                    eta_txt = f" · {m}m {int(eta % 60)}s left" if m else f" · {int(eta)}s left"
                j.progress = frac
                j.message = (
                    f"Downloading model — {done / 1e9:.1f}/{total / 1e9:.1f} GB"
                    f" · {speed_mbps:.1f} MB/s{eta_txt}"
                )
                self._emit(j)

            def on_dl(frac, speed_mbps, eta, done, total) -> None:
                loop.call_soon_threadsafe(apply_download, frac, speed_mbps, eta, done, total)

            try:
                await loop.run_in_executor(
                    None,
                    model_manager.ensure_downloaded,
                    job.engine,
                    on_dl,
                    is_cancelled,
                )
            except EngineCancelled:
                job.status = JobStatus.cancelled
                job.stage = "cancelled"
                job.message = "Cancelled"
                self._finish_run(job)
                self._emit(job)
                self._cleanup(job_id)
                return

        job.status = JobStatus.planning
        job.stage = "planning"
        job.progress = 0.0
        job.message = "Starting"
        self._emit(job)

        def apply_progress(p: EngineProgress) -> None:
            j = self.jobs.get(job_id)
            if not j:
                return
            try:
                j.status = JobStatus(p.stage)
            except ValueError:
                pass
            j.stage = p.stage
            j.progress = p.progress
            j.message = p.message + (" · pause pending" if j.pause_requested else "")
            j.completed_units, j.total_units, j.progress_unit = p.completed, p.total, p.unit
            self._emit(j)

        def on_progress(p: EngineProgress) -> None:
            loop.call_soon_threadsafe(apply_progress, p)

        try:
            result = await loop.run_in_executor(
                None, engine.generate, eng_req, on_progress, is_cancelled
            )
        except EnginePaused:
            job.status = JobStatus.paused
            job.stage = "paused"
            job.pause_requested = False
            job.message = "Paused at a saved stage; other songs can now generate"
            self._finish_run(job)
            self._emit(job)
            return
        except EngineCancelled:
            job.status = JobStatus.cancelled
            job.stage = "cancelled"
            job.message = "Cancelled"
            self._finish_run(job)
            self._emit(job)
            out_path.unlink(missing_ok=True)
            self._cleanup(job_id)
            return

        if cancel_event.is_set():
            job.status = JobStatus.cancelled
            job.stage = "cancelled"
            job.message = "Cancelled"
            self._finish_run(job)
            out_path.unlink(missing_ok=True)
            self._emit(job)
            self._cleanup(job_id)
            return

        track = Track(
            title=job.title,
            style=req.style or "",
            lyrics=req.lyrics,
            pills=req.pills,
            extra=req.extra,
            options=req.options.model_copy(deep=True),
            abc=req.abc,
            generation_meta={**result.meta, "resolved_style": job.style},
            reference=self._reference_metadata(req),
            audio_url=f"/media/audio/{result.audio_path.name}",
            duration=result.duration,
            sample_rate=result.sample_rate,
            seed=req.options.seed,
            engine=job.engine,
        )
        from .storage import storage

        storage.add_track(track)

        job.status = JobStatus.done
        job.stage = "done"
        job.progress = 1.0
        job.message = "Complete — generation limit reached; ending may be cut short" if result.meta.get("truncated") else "Complete"
        job.track_id = track.id
        self._finish_run(job)
        self._emit(job)
        # let listeners know a new track exists
        if self._loop:
            self._loop.call_soon_threadsafe(
                self._publish, "*", {"type": "track", "track": track.model_dump()}
            )
        self._cleanup(job_id)

    def _cleanup(self, job_id: str) -> None:
        self._requests.pop(job_id, None)
        self._cancel_events.pop(job_id, None)
        self._pause_events.pop(job_id, None)

    @staticmethod
    def _reference_metadata(req):
        if not req.reference_id:
            return None
        from .media_tasks import media_tasks
        return {k: v for k, v in media_tasks.reference(req.reference_id).items() if k != "abc"}


jobs = JobManager()
