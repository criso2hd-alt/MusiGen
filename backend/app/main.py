"""MusiGen FastAPI application: REST + WebSocket + media serving."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from .gpu import ModelBusy

from .api import router as api_router
from .config import settings
from .jobs import jobs
from .telemetry import telemetry
from .media_tasks import media_tasks
from .media_api import router as media_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    jobs.start()
    telemetry.start()
    media_tasks.start()
    yield
    from .media_install import media_installer
    await asyncio.to_thread(media_installer.stop)
    await media_tasks.stop()
    await jobs.stop()
    await telemetry.stop()


app = FastAPI(title="MusiGen", version="0.0.3", lifespan=lifespan)


@app.exception_handler(ModelBusy)
async def model_busy_handler(request, exc):
    return JSONResponse(status_code=409, content={"detail": str(exc)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(media_router)


async def _stream(ws: WebSocket, channel: str) -> None:
    await ws.accept()
    q = jobs.subscribe(channel)
    try:
        # send a snapshot of current jobs on connect
        for job in sorted(jobs.jobs.values(), key=lambda j: j.created_at):
            await ws.send_json({"type": "job", "job": job.model_dump()})
        while True:
            event = await q.get()
            await ws.send_json(event)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:  # pragma: no cover
        pass
    finally:
        jobs.unsubscribe(channel, q)


@app.websocket("/ws/jobs")
async def ws_jobs(ws: WebSocket) -> None:
    await _stream(ws, "*")


@app.websocket("/ws/jobs/{job_id}")
async def ws_job(ws: WebSocket, job_id: str) -> None:
    await _stream(ws, job_id)


# Serve generated audio (/media/audio → MUSIC dir) and covers (/media/covers).
# These may live in separate portable folders, so mount each explicitly.
settings.ensure_dirs()
app.mount("/media/audio", StaticFiles(directory=str(settings.AUDIO_DIR)), name="audio")
app.mount("/media/covers", StaticFiles(directory=str(settings.COVERS_DIR)), name="covers")

# Serve the built React app in production (native-window / packaged mode). Mounted
# last so /api, /ws and /media are matched first. In dev (no dist) this is skipped
# and the Vite dev server serves the UI instead.
if settings.FRONTEND_DIST.is_dir():
    app.mount(
        "/", StaticFiles(directory=str(settings.FRONTEND_DIST), html=True), name="spa"
    )
else:

    @app.get("/")
    async def root() -> dict:
        return {"app": "MusiGen", "docs": "/docs", "health": "/api/health"}
