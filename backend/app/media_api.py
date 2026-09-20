import uuid
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import APIRouter, HTTPException, Request
from .config import settings
from .media_tasks import media_tasks, task_folder
from .media_tools import EXTENSIONS, MAX_UPLOAD, capabilities
from .storage import storage

router = APIRouter(prefix="/api")

@router.get("/media-tools/install")
async def installation_status():
    from .media_install import media_installer
    return media_installer.status()

@router.post("/media-tools/repair")
def repair_media_tools():
    from .media_install import repair
    return repair()

@router.post("/media-tools/install/{kind}", status_code=202)
async def install_media_tools(kind: str):
    from .media_install import media_installer
    try:
        return media_installer.start(kind)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc

@router.post("/media-tools/install-cancel")
async def cancel_installation():
    from .media_install import media_installer
    media_installer.cancel()
    return {"ok": True}

@router.get("/media-tools")
async def media_capabilities():
    return capabilities()

@router.post("/references", status_code=202)
async def import_reference(request: Request, filename: str):
    name = Path(filename).name
    extension = Path(name).suffix.lower()
    if extension not in EXTENSIONS:
        raise HTTPException(415, "Unsupported reference format")
    tools = capabilities()
    needed = tools["reference_missing"] + (tools["midi_missing"] if extension in {".mid", ".midi"} else [])
    if needed:
        raise HTTPException(503, "Reference import needs setup: " + ", ".join(needed))
    try:
        media_tasks.check_capacity()
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    task_id = "media_" + uuid.uuid4().hex[:12]
    folder = task_folder(task_id)
    folder.mkdir(parents=True)
    source = folder / ("source" + extension)
    try:
        size = 0
        with source.open("wb") as stream:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise HTTPException(413, "Reference files must be 128 MB or smaller")
                stream.write(chunk)
        if not size:
            raise HTTPException(400, "The reference file is empty")
        try:
            return media_tasks.submit("reference", source, task_id=task_id, name=name)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
    except BaseException:
        source.unlink(missing_ok=True)
        raise

@router.get("/media-tasks/{task_id}")
async def get_media_task(task_id: str):
    task = media_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "Media task not found")
    return task

@router.post("/media-tasks/{task_id}/cancel")
async def cancel_media_task(task_id: str):
    if not media_tasks.cancel(task_id):
        raise HTTPException(409, "This media task is already finished or unavailable")
    return {"ok": True}

@router.post("/tracks/{track_id}/lyric-timing", status_code=202)
async def time_lyrics(track_id: str):
    track = storage.get_track(track_id)
    if not track:
        raise HTTPException(404, "Song not found")
    needed = capabilities()["alignment_missing"]
    if needed:
        raise HTTPException(503, "Lyric timing needs setup: " + ", ".join(needed))
    source = settings.AUDIO_DIR / Path(urlsplit(track.audio_url).path).name
    if not source.is_file():
        raise HTTPException(404, "Song audio is missing")
    with media_tasks.lock:
        for task in media_tasks.tasks.values():
            if task["track_id"] == track_id and task["status"] not in {"done", "error", "cancelled"}:
                return dict(task)
    try:
        return media_tasks.submit("alignment", source, track_id=track_id, name=track.title)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
