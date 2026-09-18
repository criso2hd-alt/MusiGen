"""Tiny persisted key/value store for user-chosen app settings.

Kept separate from `config.Settings` (which is env-derived defaults). Persists to
`DATA_DIR/settings.json` so choices like the lyric-model size survive restarts.
"""
from __future__ import annotations

import json
import threading

from .config import settings

_lock = threading.Lock()
_cache: dict | None = None


def _path():
    return settings.DATA_DIR / "settings.json"


def _load() -> dict:
    global _cache
    if _cache is not None:
        return _cache
    try:
        _cache = json.loads(_path().read_text("utf-8"))
        if not isinstance(_cache, dict):
            _cache = {}
    except Exception:
        _cache = {}
    return _cache


def get(key: str, default=None):
    return _load().get(key, default)


def set(key: str, value) -> None:  # noqa: A001 - deliberate simple API
    with _lock:
        d = _load()
        d[key] = value
        try:
            settings.ensure_dirs()
            _path().write_text(json.dumps(d, indent=2), "utf-8")
        except Exception:
            pass


def get_llm_model() -> str:
    """The lyric model repo the user selected, or the configured default."""
    return get("llm_model") or settings.LLM_MODEL


def set_llm_model(repo: str) -> None:
    set("llm_model", repo)
