"""In-process job queue: one GPU means one job at a time, with live progress.

Engine work is blocking (torch), so it runs in a thread-pool executor. Progress
callbacks fire from that worker thread and are marshalled back onto the event
loop via ``call_soon_threadsafe`` to update state and fan out over WebSockets.
"""
from __future__ import annotations

import asyncio
import threading
import time
from pathlib import Path
from typing import Optional

from .config import settings
from .engines import build_engine
from .engines.base import EngineCancelled, EngineProgress, EngineRequest, MusicEngine
from .prompt_composer import compose_style
from .schemas import GenerateRequest, Job, JobStatus, Track


class JobManager:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self._queue: "asyncio.Queue[str]" = asyncio.Queue()
        self._cancel_events: dict[str, threading.Event] = {}
        self._requests: dict[str, GenerateRequest] = {}
        self._engines: dict[str, MusicEngine] = {}
        self._subscribers: dict[str, set[asyncio.Queue]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._worker: Optional[asyncio.Task] = None
        self._model_dl: dict[str, dict] = {}  # engine -> download status

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._worker = asyncio.create_task(self._run_worker())

    async def stop(self) -> None:
        if self._worker:
            self._worker.cancel()

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

    def _emit(self, job: Job) -> None:
        """Thread-safe: push a job snapshot to its channel and the global feed."""
        job.updated_at = time.time()
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
        style = req.style or compose_style(req.pills)
        engine_name = (req.engine or settings.ENGINE).lower()
        job = Job(
            title=req.title or (style[:40] if style else "Untitled"),
            style=style,
            engine=engine_name,
        )
        # stash the resolved style back onto the request for the worker
        req.style = style
        self.jobs[job.id] = job
        self._requests[job.id] = req
        self._cancel_events[job.id] = threading.Event()
        await self._queue.put(job.id)
        self._emit(job)
        return job

    def cancel(self, job_id: str) -> bool:
        job = self.jobs.get(job_id)
        if not job:
            return False
        ev = self._cancel_events.get(job_id)
        if ev:
            ev.set()
        if job.status == JobStatus.queued:
            job.status = JobStatus.cancelled
            job.stage = "cancelled"
            self._emit(job)
        return True

    # -- worker ------------------------------------------------------------

    async def _run_worker(self) -> None:
        while True:
            job_id = await self._queue.get()
            job = self.jobs.get(job_id)
            if not job:
                continue
            if job.status == JobStatus.cancelled:
                continue
            try:
                await self._run_job(job_id)
            except Exception as exc:  # noqa: BLE001 - keep the worker alive
                job = self.jobs.get(job_id)
                if job:
                    job.status = JobStatus.error
                    job.error = str(exc)
                    job.message = f"Error: {exc}"
                    self._emit(job)

    async def _run_job(self, job_id: str) -> None:
        job = self.jobs[job_id]
        req = self._requests[job_id]
        cancel_event = self._cancel_events[job_id]
        engine = self._engine(job.engine)

        out_path = settings.AUDIO_DIR / f"{job.id}.flac"
        eng_req = EngineRequest(
            style=req.style or "",
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

            def on_dl(frac, speed_mbps, eta, done, total) -> None:
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
                self._emit(job)
                self._cleanup(job_id)
                return

        job.status = JobStatus.planning
        job.stage = "planning"
        job.progress = 0.0
        job.message = "Starting"
        self._emit(job)

        def on_progress(p: EngineProgress) -> None:
            j = self.jobs.get(job_id)
            if not j:
                return
            try:
                j.status = JobStatus(p.stage)
            except ValueError:
                pass
            j.stage = p.stage
            j.progress = p.progress
            j.message = p.message
            self._emit(j)

        try:
            result = await loop.run_in_executor(
                None, engine.generate, eng_req, on_progress, is_cancelled
            )
        except EngineCancelled:
            job.status = JobStatus.cancelled
            job.stage = "cancelled"
            job.message = "Cancelled"
            self._emit(job)
            out_path.unlink(missing_ok=True)
            self._cleanup(job_id)
            return

        track = Track(
            title=job.title,
            style=req.style or "",
            lyrics=req.lyrics,
            pills=req.pills,
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
        job.message = "Complete"
        job.track_id = track.id
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


jobs = JobManager()
