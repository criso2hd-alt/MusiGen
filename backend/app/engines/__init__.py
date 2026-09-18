"""Pluggable music-generation engines.

The rest of the app depends only on the `MusicEngine` interface in `base`, so
the underlying model (stub, YuE2, or anything future) is fully swappable.
"""
from __future__ import annotations

from ..config import settings
from .base import MusicEngine

# Live engine instances, so we can free their GPU memory when the LLM needs it.
_INSTANCES: dict[str, MusicEngine] = {}


def build_engine(name: str | None = None) -> MusicEngine:
    name = (name or settings.ENGINE).lower()
    if name in _INSTANCES:
        return _INSTANCES[name]
    if name == "stub":
        from .stub import StubEngine

        eng: MusicEngine = StubEngine()
    elif name == "yue2":
        from .yue2_engine import YuE2Engine

        eng = YuE2Engine()
    else:
        raise ValueError(f"Unknown engine: {name!r}")
    _INSTANCES[name] = eng
    return eng


def unload_all() -> None:
    """Release GPU memory held by any loaded music engine (frees VRAM for the LLM)."""
    for eng in _INSTANCES.values():
        close = getattr(eng, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                pass


def engine_catalog() -> list[dict]:
    """Metadata + readiness for the UI engine selector."""
    yue2_ready = (settings.HF_CACHE_DIR / "models--m-a-p--YuE2-3B").exists()
    return [
        {
            "id": "yue2",
            "label": "YuE2",
            "ready": yue2_ready,
            "note": "" if yue2_ready else "Model not downloaded",
            "desc": "3B · fast · 48 kHz. Style + lyrics.",
        },
        {
            "id": "stub",
            "label": "Stub (no GPU)",
            "ready": True,
            "note": "",
            "desc": "Instant placeholder audio for testing the UI.",
        },
    ]
