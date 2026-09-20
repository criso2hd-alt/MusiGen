"""Serialized, persistent optional reference/transcription jobs.

The inference subprocess holds the same model slot as native generation. Model
packages live in separate Python environments, never in the YuE2 environment.
"""
import asyncio
import hashlib
from pathlib import Path
import re
import threading
import time
import uuid

from .checkpoints import read_json, write_json
from .config import settings
from .engines.base import EngineCancelled
from .gpu import model_session
from .media_tools import configuration, missing, prepare_audio, reference_missing, run_process
from .schemas import LyricTiming


def task_folder(task_id):
    if not re.fullmatch(r"media_[a-f0-9]{12}", task_id):
        raise ValueError("Invalid media task ID")
    return settings.DATA_DIR / "media-tasks" / task_id


def validate_timing(raw, duration):
    timing = LyricTiming.model_validate(raw)
    if not timing.words:
        raise ValueError("No timed words were recognized; this may be instrumental audio.")
    previous = -1
    for word in timing.words:
        if word.start < previous or word.end > duration + .25:
            raise ValueError("The aligner returned unordered or out-of-range timestamps.")
        previous = word.start
    return timing


class MediaTasks:
    def __init__(self):
        self.tasks = {}
        self.events = {}
        self.queue = asyncio.Queue(maxsize=8)
        self.worker = None
        self.lock = threading.RLock()

    def start(self):
        for path in (settings.DATA_DIR / "media-tasks").glob("media_*/task.json"):
            try:
                task = read_json(path)
                if task_folder(task["id"]).resolve() != path.parent.resolve():
                    continue
                if task["status"] not in {"done", "error", "cancelled"}:
                    task.update(status="error", message="Interrupted by restart. Please retry the import or timing analysis.")
                    write_json(path, task)
                self.tasks[task["id"]] = task
            except (ValueError, KeyError, OSError):
                continue
        self.worker = asyncio.create_task(self._run())

    async def stop(self):
        for event in self.events.values():
            event.set()
        if self.worker:
            # Allow subprocess termination/reaping before the event loop exits.
            await self.queue.join()
            self.worker.cancel()
            try:
                await self.worker
            except asyncio.CancelledError:
                pass

    def get(self, task_id):
        with self.lock:
            task = self.tasks.get(task_id)
            return dict(task) if task else None

    def update(self, task_id, **patch):
        with self.lock:
            self.tasks[task_id].update(patch, updated_at=time.time())
            write_json(task_folder(task_id) / "task.json", self.tasks[task_id])

    def check_capacity(self):
        if self.queue.full():
            raise ValueError("The media queue is full. Wait for an import or analysis to finish.")

    def submit(self, kind, source, *, task_id=None, name="", track_id=None):
        self.check_capacity()
        task_id = task_id or "media_" + uuid.uuid4().hex[:12]
        folder = task_folder(task_id)
        folder.mkdir(parents=True, exist_ok=True)
        with self.lock:
            self.tasks[task_id] = {"id": task_id, "kind": kind, "status": "queued",
                "name": name, "track_id": track_id, "created_at": time.time(),
                "message": "Queued", "result": None}
            self.events[task_id] = threading.Event()
        self.update(task_id)
        self.queue.put_nowait((task_id, Path(source)))
        return self.get(task_id)

    def cancel(self, task_id):
        task = self.get(task_id)
        if not task or task["status"] in {"done", "error", "cancelled"}:
            return False
        self.events[task_id].set()
        self.update(task_id, message="Cancellation requested")
        return True

    def reference(self, task_id):
        task = self.get(task_id)
        if not task or task["kind"] != "reference" or task["status"] != "done":
            raise ValueError("Reference is not ready. Wait for preparation to finish.")
        return task["result"]

    async def _run(self):
        while True:
            task_id, source = await self.queue.get()
            try:
                result = await asyncio.to_thread(self._process, task_id, source)
                if self.events[task_id].is_set():
                    raise EngineCancelled()
                task = self.get(task_id)
                if task["kind"] == "alignment":
                    from .storage import storage
                    if not storage.set_lyric_timing(task["track_id"], result):
                        raise ValueError("The song was deleted while analysis was running.")
                self.update(task_id, status="done", message="Ready", result=result)
            except EngineCancelled:
                self.update(task_id, status="cancelled", message="Cancelled")
            except Exception as exc:
                self.update(task_id, status="error", message=str(exc))
            finally:
                self.events.pop(task_id, None)
                self.queue.task_done()

    def _process(self, task_id, source):
        import soundfile as sf
        task = self.get(task_id)
        folder = task_folder(task_id)
        cancelled = self.events[task_id].is_set
        if cancelled():
            raise EngineCancelled()
        config = configuration()
        reference = task["kind"] == "reference"
        required = reference_missing(config) if reference else missing(config, ["alignment_python", "asr_model", "aligner_model"])
        if required:
            raise ValueError("Optional media tools need setup: " + ", ".join(required))
        report = lambda message: self.update(task_id, status="preparing", message=message)
        if reference:
            audio, duration = prepare_audio(source, folder, config, cancelled, report)
        else:
            audio, duration = source, sf.info(source).duration
        self.update(task_id, status="waiting", message="Waiting for the AI model slot")
        with model_session("Reference melody extraction" if reference else "Lyric timing analysis", cancelled=cancelled):
            if cancelled():
                raise EngineCancelled()
            from .engines import unload_all
            from . import llm, cover
            unload_all()
            llm.unload()
            cover.unload()
            self.update(task_id, status="running", message="Extracting melody" if reference else "Recognizing sung words and timestamps")
            output = folder / "output.json"
            output.unlink(missing_ok=True)
            request = {"kind": task["kind"], "audio": str(audio.resolve()), "output": str(output.resolve()),
                "model": config["sheetsage_model" if reference else "asr_model"], "aligner": config.get("aligner_model"),
                "parent": config.get("sheetsage_parent")}
            request_path = folder / "request.json"
            write_json(request_path, request)
            run_process([config["sheetsage_python" if reference else "alignment_python"],
                str(Path(__file__).with_name("media_worker.py")), str(request_path.resolve())], folder, cancelled)
            if not output.exists() or output.stat().st_size > 2 * 1024**2:
                raise ValueError("The media worker returned no usable result")
            raw = read_json(output)
        if reference:
            abc = raw.get("abc")
            if not isinstance(abc, str) or not abc.strip() or len(abc) > 200000 or not re.search(r"(?m)^K:", abc):
                raise ValueError("No usable ABC melody was extracted")
            digest = hashlib.sha256()
            with source.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024**2), b""):
                    digest.update(chunk)
            return {"id": task_id, "name": task["name"], "sha256": digest.hexdigest(),
                    "duration": duration, "abc": abc, "model": "SheetSage2", "cot": "melody"}
        return validate_timing(raw, duration).model_dump()


media_tasks = MediaTasks()
