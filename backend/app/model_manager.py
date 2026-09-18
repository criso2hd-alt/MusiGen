"""Downloads local model weights with live progress + a disk-space check.

Progress is derived by polling the on-disk size against the repo's total size.
The lyric LLM downloads in copy mode (local_dir) to avoid the Windows symlink
privilege error that classic (non-Xet) HF repos hit; YuE2 is Xet-backed and uses
the normal cache.
"""
from __future__ import annotations

import fnmatch
import os
import shutil
import threading
import time
from pathlib import Path
from typing import Callable

from .config import settings

_MUSIC = {"yue2"}
_IGNORE = ["assets/*", "examples/*", "figures/*"]
# Per-key allow-lists: fetch ONLY these globs. Keeps SD-Turbo to its fp16
# weights + configs (~2.6 GB) instead of the full 13 GB (fp32 + single-file).
# fnmatch's ``*`` spans ``/`` too, so these match nested paths.
_ALLOW: dict[str, list[str]] = {
    "cover": ["*.json", "*.txt", "*.fp16.safetensors"],
}
_total_cache: dict[str, int] = {}

# (fraction 0..1, speed_mbps, eta_seconds, done_bytes, total_bytes)
ProgressFn = Callable[[float, float, float, int, int], None]


def _repos(key: str) -> list[str]:
    if key == "yue2":
        return ["m-a-p/YuE2-3B", "m-a-p/YuE2-Vae"]
    if key == "llm":
        from . import app_settings

        return [app_settings.get_llm_model()]
    if key == "cover":
        return ["stabilityai/sd-turbo"]
    return []


# Keys downloaded in copy mode (local_dir) — classic HF repos that would hit the
# Windows symlink-privilege error if cached the normal way.
_COPY_MODE = {"llm", "cover"}


def is_downloadable(key: str) -> bool:
    return bool(_repos(key))


def needs_model(engine: str) -> bool:
    """True only for MUSIC engines with local weights (used by the job runner)."""
    return engine in _MUSIC


def llm_dir(model: str | None = None) -> Path:
    """Per-model copy-mode dir the lyric model is downloaded to / loaded from.

    One subfolder per repo so switching sizes doesn't clobber a prior download
    and each size reports its own readiness.
    """
    if model is None:
        from . import app_settings

        model = app_settings.get_llm_model()
    return settings.HF_CACHE_DIR / "lyric-model" / model.replace("/", "--")


def llm_ready(model: str) -> bool:
    d = llm_dir(model)
    return d.exists() and (d / "config.json").exists() and any(d.glob("*.safetensors"))


def cover_dir() -> Path:
    """Copy-mode dir the SD-Turbo cover model is downloaded to / loaded from."""
    return settings.HF_CACHE_DIR / "cover-model"


def clear_total_cache() -> None:
    _total_cache.clear()


def _targets(key: str) -> list[Path]:
    """Dirs whose total size equals bytes-on-disk, for progress polling."""
    if key == "llm":
        return [llm_dir()]
    if key == "cover":
        return [cover_dir()]
    return [settings.HF_CACHE_DIR / f"models--{r.replace('/', '--')}" for r in _repos(key)]


def is_ready(key: str) -> bool:
    repos = _repos(key)
    if not repos:
        return True
    if key == "llm":
        from . import app_settings

        return llm_ready(app_settings.get_llm_model())
    if key == "cover":
        d = cover_dir()
        if not (d / "model_index.json").exists():
            return False
        # Require the actual fp16 weights — not just the config folders — so a
        # partial/interrupted download isn't mistaken for "installed".
        return all(
            any((d / sub).glob("*.fp16.safetensors"))
            for sub in ("unet", "vae", "text_encoder")
        )
    for d in _targets(key):
        snap = d / "snapshots"
        if not (snap.exists() and any(snap.iterdir())):
            return False
    return True


def _dir_size(p: Path) -> int:
    if not p.exists():
        return 0
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


def _dir_size_all(dirs: list[Path]) -> int:
    return sum(_dir_size(d) for d in dirs)


def total_bytes(key: str) -> int:
    # Key by the resolved repo set so a changed LLM selection isn't stale.
    sig = key + "|" + ",".join(_repos(key))
    if sig in _total_cache:
        return _total_cache[sig]
    from huggingface_hub import HfApi

    api = HfApi()
    allow = _ALLOW.get(key)
    tot = 0
    for r in _repos(key):
        info = api.repo_info(r, files_metadata=True)
        for s in info.siblings:
            if any(fnmatch.fnmatch(s.rfilename, pat) for pat in _IGNORE):
                continue
            if allow and not any(fnmatch.fnmatch(s.rfilename, pat) for pat in allow):
                continue
            tot += s.size or 0
    _total_cache[sig] = tot
    return tot


def ensure_downloaded(key: str, on_progress: ProgressFn, is_cancelled) -> None:
    repos = _repos(key)
    if not repos or is_ready(key):
        return

    settings.ensure_dirs()
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    total = 0
    try:
        total = total_bytes(key)
    except Exception:
        total = 0

    free = shutil.disk_usage(str(settings.HF_CACHE_DIR)).free
    if total and free < total * 1.08:
        raise RuntimeError(
            f"Not enough disk space for the model: need ~{total / 1e9:.1f} GB, "
            f"only {free / 1e9:.1f} GB free on the MusiGen drive."
        )

    targets = _targets(key)
    stop = threading.Event()

    def poll() -> None:
        prev = _dir_size_all(targets)
        prevt = time.time()
        while not stop.wait(0.6):
            cur = _dir_size_all(targets)
            now = time.time()
            speed = (cur - prev) / max(now - prevt, 0.001)
            prev, prevt = cur, now
            frac = (cur / total) if total else 0.0
            eta = (total - cur) / speed if total and speed > 0 else 0.0
            on_progress(min(frac, 0.999), speed / 1e6, eta, cur, total)

    watcher = threading.Thread(target=poll, daemon=True)
    watcher.start()
    try:
        from huggingface_hub import snapshot_download

        for r in repos:
            if is_cancelled():
                from .engines.base import EngineCancelled

                raise EngineCancelled()
            if key in _COPY_MODE:
                local = llm_dir() if key == "llm" else cover_dir()
                snapshot_download(
                    r,
                    local_dir=str(local),
                    ignore_patterns=_IGNORE,
                    allow_patterns=_ALLOW.get(key),
                )
            else:
                snapshot_download(
                    r, cache_dir=str(settings.HF_CACHE_DIR), ignore_patterns=_IGNORE
                )
    finally:
        stop.set()
        watcher.join(timeout=1)
    on_progress(1.0, 0.0, 0.0, total, total)
