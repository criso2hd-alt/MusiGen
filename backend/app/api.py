"""REST API routes for MusiGen."""
from __future__ import annotations

import asyncio
import json
import re
import shutil
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .config import settings
from .jobs import jobs
from .ollama_client import ollama
from .pills import PILL_CATALOG
from .prompt_composer import refine_style, write_lyrics
from .schemas import (
    ComposeRequest,
    ComposeResponse,
    ExportRequest,
    ExportResponse,
    GenerateRequest,
    SaveRequest,
    Job,
    LyricsRequest,
    LyricFitRequest,
    LyricsResponse,
    Playlist,
    PlaylistCreate,
    PlaylistReorder,
    PlaylistUpdate,
    Track,
    TrackUpdate,
)
from .storage import storage


def _safe_filename(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name).strip().strip(".")
    name = re.sub(r"\s+", " ", name)
    return name[:120] or "untitled"


def _media_path(url: str) -> Path | None:
    """Map a /media/... URL to its on-disk file (audio + covers live in their
    own portable folders)."""
    rel = (url or "").split("?")[0]
    if rel.startswith("/media/audio/"):
        return settings.AUDIO_DIR / rel[len("/media/audio/") :]
    if rel.startswith("/media/covers/"):
        return settings.COVERS_DIR / rel[len("/media/covers/") :]
    return None


def _source_path(track: Track) -> Path:
    p = _media_path(track.audio_url)
    if p is None:
        raise HTTPException(400, "Track has no local audio file")
    return p


def _cover_file(track: Track) -> Path | None:
    """Local path to the track's cover image, if any."""
    p = _media_path(track.cover_url or "")
    return p if p and p.exists() else None


def _tag_flac(dest: Path, track: Track) -> None:
    """Embed title / style / lyrics (unsynced) + cover art into a FLAC file."""
    try:
        from mutagen.flac import FLAC, Picture

        audio = FLAC(str(dest))
        audio["musigen_seed"] = str(track.seed)
        audio["musigen_recipe"] = json.dumps({
            "engine": track.engine, "seed": track.seed, "style": track.style,
            "extra": track.extra, "pills": [p.model_dump() for p in track.pills],
            "options": track.options.model_dump() if track.options else None,
            "abc": track.abc, "generation_meta": track.generation_meta,
            "reference": track.reference,
            "lyric_timing": track.lyric_timing.model_dump() if track.lyric_timing else None,
        }, ensure_ascii=False)
        if track.title:
            audio["title"] = track.title
        if track.style:
            audio["comment"] = track.style
            audio["description"] = track.style
        if track.lyrics and track.lyrics.strip():
            audio["lyrics"] = track.lyrics
            audio["unsyncedlyrics"] = track.lyrics
        cov = _cover_file(track)
        if cov:
            pic = Picture()
            pic.type = 3  # front cover
            pic.mime = "image/png" if cov.suffix.lower() == ".png" else "image/jpeg"
            pic.desc = "cover"
            pic.data = cov.read_bytes()
            audio.clear_pictures()
            audio.add_picture(pic)
        audio.save()
    except Exception:
        # tagging is best-effort — never fail an export because of metadata
        pass

router = APIRouter(prefix="/api")


@router.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "engine": settings.ENGINE,
        "ollama": await ollama.available(),
        "ollama_model": settings.OLLAMA_MODEL,
    }


@router.get("/pills")
async def get_pills() -> dict[str, list[str]]:
    return PILL_CATALOG


@router.get("/engines")
async def get_engines() -> list[dict]:
    from .engines import engine_catalog

    return engine_catalog()


@router.get("/models")
async def get_models() -> dict:
    return jobs.model_status()


@router.post("/models/{engine}/download")
async def download_model(engine: str) -> dict:
    return jobs.start_model_download(engine)


@router.get("/storage")
async def storage_info() -> dict:
    """Sizes of the portable folders (models / music / data) + free disk."""
    def dsize(p: Path) -> int:
        if not p.exists():
            return 0
        return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())

    models = settings.HF_CACHE_DIR
    music = settings.AUDIO_DIR
    data = settings.DATA_DIR
    ref = data if data.exists() else data.parent
    try:
        free = shutil.disk_usage(str(ref)).free
    except Exception:
        free = 0
    return {
        "models": {"path": str(models), "bytes": dsize(models)},
        "music": {"path": str(music), "bytes": dsize(music)},
        "data": {"path": str(data), "bytes": dsize(data)},
        "free_bytes": free,
    }


@router.get("/llm/options")
async def llm_options() -> dict:
    """Selectable lyric-model sizes + which one is active / already downloaded."""
    from . import app_settings, model_manager

    selected = app_settings.get_llm_model()
    options = [
        {**c, "ready": model_manager.llm_ready(c["repo"])}
        for c in settings.LLM_CHOICES
    ]
    return {"selected": selected, "options": options}


@router.post("/tracks/{track_id}/cover", response_model=Track)
async def make_cover(track_id: str, req: dict | None = None) -> Track:
    """Generate an album cover for a track (AI writes the image prompt from the
    title + style + lyrics unless a custom prompt is supplied)."""
    from . import cover as cover_mod, model_manager
    from .prompt_composer import write_cover_prompt

    t = storage.get_track(track_id)
    if not t:
        raise HTTPException(404, "Track not found")
    if not model_manager.is_ready("cover"):
        raise HTTPException(
            400, "Cover model isn't downloaded yet — get it in Setup → Models & Engines."
        )

    body = req or {}
    prompt = (body.get("prompt") or "").strip()
    if not prompt:
        prompt, _ = await write_cover_prompt(t.title, t.style, t.lyrics)
    seed = body.get("seed")

    settings.ensure_dirs()
    out = settings.COVERS_DIR / f"{t.id}.png"
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(None, lambda: cover_mod.generate(prompt, out, seed))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Cover generation failed: {exc}")

    # cache-bust so the UI re-fetches the new image at the same path
    t.cover_url = f"/media/covers/{out.name}?v={int(time.time())}"
    storage.add_track(t)
    return t


@router.post("/llm/select")
async def llm_select(req: dict) -> dict:
    """Switch the active lyric model. Frees the loaded one; download is separate."""
    from . import app_settings, llm, model_manager

    model = (req or {}).get("model", "").strip()
    valid = {c["repo"] for c in settings.LLM_CHOICES}
    if model not in valid:
        raise HTTPException(400, "Unknown lyric model")
    from .gpu import model_session
    def select():
        with model_session("Switching lyric model", wait=False):
            llm.unload()
            app_settings.set_llm_model(model)
            model_manager.clear_total_cache()
    await asyncio.to_thread(select)
    return await llm_options()


@router.post("/shutdown")
async def shutdown() -> dict:
    """Quit the app: exit the backend process, which releases all GPU memory."""
    import os
    import threading
    import time

    def stop() -> None:
        time.sleep(0.3)  # let the HTTP response flush first
        os._exit(0)  # hard exit -> frees VRAM held by the torch allocator

    threading.Thread(target=stop, daemon=True).start()
    return {"ok": True}


@router.post("/mixer/compose", response_model=ComposeResponse)
async def compose(req: ComposeRequest) -> ComposeResponse:
    if req.ai:
        style, used = await refine_style(req.pills, req.extra)
        return ComposeResponse(style=style, used_llm=used, warning=None if used else
            "AI writing did not return a prompt. Your original mix has been kept. Check the installed lyric model and backend log.")
    # instant, deterministic path for the live preview
    from .prompt_composer import compose_style

    base = compose_style(req.pills)
    if req.extra.strip():
        base = f"{base}, {req.extra.strip()}" if base else req.extra.strip()
    return ComposeResponse(style=base, used_llm=False)


@router.post("/lyrics", response_model=LyricsResponse)
async def lyrics(req: LyricsRequest) -> LyricsResponse:
    from .lyric_fit import estimate
    text, used = await write_lyrics(req.theme, req.pills, req.structure, duration=req.duration,
        bpm=req.bpm, fit_duration=req.fit_duration, style=req.style)
    fit = estimate(text, req.duration, req.pills, req.bpm, req.style)
    return LyricsResponse(lyrics=text, used_llm=used, fit=fit,
        warning=fit["warning"] if used else "AI writer unavailable; a template was inserted. " + (fit["warning"] or ""))


@router.post("/lyrics/fit")
async def lyric_fit(req: LyricFitRequest) -> dict:
    from .lyric_fit import estimate
    return estimate(req.lyrics, req.duration, req.pills, req.bpm, req.style)


# -- generation / jobs ------------------------------------------------------


@router.get("/system")
async def system_status() -> dict:
    from .telemetry import telemetry
    return telemetry.snapshot()


@router.post("/generate", response_model=Job)
async def generate(req: GenerateRequest) -> Job:
    try:
        return await jobs.submit(req)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/jobs", response_model=list[Job])
async def list_jobs() -> list[Job]:
    return sorted(jobs.jobs.values(), key=lambda j: j.created_at, reverse=True)


@router.get("/jobs/{job_id}", response_model=Job)
async def get_job(job_id: str) -> Job:
    job = jobs.jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict:
    if not jobs.cancel(job_id):
        raise HTTPException(404, "Job not found")
    return {"ok": True}


@router.post("/jobs/{job_id}/pause")
async def pause_job(job_id: str) -> dict:
    if not jobs.pause(job_id):
        raise HTTPException(409, "This job cannot be paused")
    return {"ok": True}


@router.post("/jobs/{job_id}/resume")
async def resume_job(job_id: str) -> dict:
    if not await jobs.resume(job_id):
        raise HTTPException(409, "This job cannot be resumed")
    return {"ok": True}


# -- tracks -----------------------------------------------------------------


@router.get("/tracks", response_model=list[Track])
async def list_tracks() -> list[Track]:
    return storage.list_tracks()


@router.get("/tracks/{track_id}", response_model=Track)
async def get_track(track_id: str) -> Track:
    t = storage.get_track(track_id)
    if not t:
        raise HTTPException(404, "Track not found")
    return t


@router.patch("/tracks/{track_id}", response_model=Track)
async def update_track(track_id: str, req: TrackUpdate) -> Track:
    t = storage.get_track(track_id)
    if not t:
        raise HTTPException(404, "Track not found")
    if req.title is not None and req.title.strip():
        t.title = req.title.strip()
    if req.rating is not None:
        t.rating = req.rating
    storage.add_track(t)
    return t


@router.get("/tracks/{track_id}/download")
async def download_track(track_id: str) -> FileResponse:
    """Stream the track for a browser download with a friendly filename."""
    t = storage.get_track(track_id)
    if not t:
        raise HTTPException(404, "Track not found")
    src = _source_path(t)
    if not src.exists():
        raise HTTPException(404, "Audio file missing")
    return FileResponse(
        str(src),
        media_type="audio/flac",
        filename=f"{_safe_filename(t.title)}.flac",
    )


@router.post("/tracks/{track_id}/export", response_model=ExportResponse)
async def export_track(track_id: str, req: ExportRequest) -> ExportResponse:
    """Save a copy of the track into any folder on the local machine."""
    t = storage.get_track(track_id)
    if not t:
        raise HTTPException(404, "Track not found")
    src = _source_path(t)
    if not src.exists():
        raise HTTPException(404, "Audio file missing")

    folder = Path(req.folder).expanduser()
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(400, f"Cannot use folder: {exc}")
    if not folder.is_dir():
        raise HTTPException(400, "Destination is not a folder")

    stem = _safe_filename(req.filename or t.title)
    dest = folder / f"{stem}.{req.format}"
    # avoid clobbering an existing file
    n = 1
    while dest.exists():
        dest = folder / f"{stem} ({n}).{req.format}"
        n += 1

    try:
        if req.format == "flac":
            shutil.copyfile(src, dest)
            _tag_flac(dest, t)  # embed lyrics + cover art
        else:  # wav
            import soundfile as sf

            data, sr = sf.read(str(src))
            sf.write(str(dest), data, sr, subtype="PCM_16")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Export failed: {exc}")

    return ExportResponse(path=str(dest), folder=str(folder), filename=dest.name)


@router.post("/tracks/{track_id}/save")
async def save_track(track_id: str, req: SaveRequest) -> dict:
    """Write the track to an exact file path chosen via the native Save dialog."""
    t = storage.get_track(track_id)
    if not t:
        raise HTTPException(404, "Track not found")
    src = _source_path(t)
    if not src.exists():
        raise HTTPException(404, "Audio file missing")

    dest = Path(req.path).expanduser()
    if not dest.suffix:
        dest = dest.with_suffix(".flac")
    fmt = dest.suffix.lower()
    if fmt not in (".flac", ".wav"):
        dest = dest.with_suffix(".flac")
        fmt = ".flac"
    try:
        dest.parent.mkdir(parents=True, exist_ok=True)
        if fmt == ".flac":
            shutil.copyfile(src, dest)
            _tag_flac(dest, t)  # embed lyrics + cover art
        else:
            import soundfile as sf

            data, sr = sf.read(str(src))
            sf.write(str(dest), data, sr, subtype="PCM_16")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Save failed: {exc}")
    return {"path": str(dest)}


@router.delete("/tracks/{track_id}")
async def delete_track(track_id: str) -> dict:
    t = storage.get_track(track_id)
    if not t:
        raise HTTPException(404, "Track not found")
    # remove the audio file (and cover) too
    fpath = _media_path(t.audio_url)
    if fpath:
        fpath.unlink(missing_ok=True)
    cov = _cover_file(t)
    if cov:
        cov.unlink(missing_ok=True)
    storage.delete_track(track_id)
    return {"ok": True}


# -- playlists --------------------------------------------------------------


@router.get("/playlists", response_model=list[Playlist])
async def list_playlists() -> list[Playlist]:
    return storage.list_playlists()


@router.post("/playlists", response_model=Playlist)
async def create_playlist(req: PlaylistCreate) -> Playlist:
    pl = Playlist(name=req.name)
    return storage.add_playlist(pl)


@router.post("/playlists/reorder", response_model=list[Playlist])
async def reorder_playlists(req: PlaylistReorder) -> list[Playlist]:
    for i, pl_id in enumerate(req.order):
        pl = storage.get_playlist(pl_id)
        if pl:
            pl.order = float(i)
            storage.add_playlist(pl)
    return storage.list_playlists()


@router.patch("/playlists/{pl_id}", response_model=Playlist)
async def update_playlist(pl_id: str, req: PlaylistUpdate) -> Playlist:
    pl = storage.get_playlist(pl_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    if req.name is not None:
        pl.name = req.name
    if req.track_ids is not None:
        pl.track_ids = req.track_ids
    return storage.add_playlist(pl)


@router.delete("/playlists/{pl_id}")
async def delete_playlist(pl_id: str) -> dict:
    if not storage.delete_playlist(pl_id):
        raise HTTPException(404, "Playlist not found")
    return {"ok": True}


@router.post("/playlists/{pl_id}/tracks/{track_id}", response_model=Playlist)
async def add_to_playlist(pl_id: str, track_id: str) -> Playlist:
    pl = storage.get_playlist(pl_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    if track_id not in pl.track_ids:
        pl.track_ids.append(track_id)
    return storage.add_playlist(pl)


@router.delete("/playlists/{pl_id}/tracks/{track_id}", response_model=Playlist)
async def remove_from_playlist(pl_id: str, track_id: str) -> Playlist:
    pl = storage.get_playlist(pl_id)
    if not pl:
        raise HTTPException(404, "Playlist not found")
    pl.track_ids = [t for t in pl.track_ids if t != track_id]
    return storage.add_playlist(pl)
