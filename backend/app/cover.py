"""Local album-cover image generation with SD-Turbo (diffusers).

GPU-shared with YuE2/LLM (one big model at a time). The pipeline is kept WARM in
VRAM after the first render so subsequent covers are fast (~0.5-1s instead of a
fresh multi-second load each time). It is unloaded automatically when the music
engine or lyric model needs the GPU (see llm._load / yue2_engine.generate).
"""
from __future__ import annotations

import threading
from .gpu import model_operation
from pathlib import Path

_lock = threading.RLock()
_pipe = None
_device: str | None = None


def available() -> bool:
    from . import model_manager

    return model_manager.is_ready("cover")


def is_loaded() -> bool:
    return _pipe is not None


@model_operation()
def unload() -> None:
    """Drop the resident SD-Turbo pipeline and free its VRAM."""
    global _pipe, _device
    with _lock:
        if _pipe is None:
            return
        _pipe = None
        _device = None
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def _ensure_pipe():
    global _pipe, _device
    if _pipe is not None:
        return
    # Free the GPU from any resident music engine + lyric model first.
    try:
        from .engines import unload_all

        unload_all()
    except Exception:
        pass
    try:
        from . import llm

        llm.unload()
    except Exception:
        pass

    import torch
    from diffusers import AutoPipelineForText2Image

    from . import model_manager

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    if dev == "cuda":
        try:  # Ada/Ampere fast paths
            torch.backends.cudnn.benchmark = True
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
        except Exception:
            pass
    dtype = torch.float16 if dev == "cuda" else torch.float32
    # Only the fp16 safetensors are downloaded (see model_manager _ALLOW), so
    # always load that variant + force safetensors (never look for a .bin, which
    # produces a confusing error when the download is fp16-only).
    pipe = AutoPipelineForText2Image.from_pretrained(
        str(model_manager.cover_dir()),
        local_files_only=True,
        torch_dtype=dtype,
        use_safetensors=True,
        variant="fp16",
    ).to(dev)
    try:
        pipe.set_progress_bar_config(disable=True)
    except Exception:
        pass
    _pipe = pipe
    _device = dev


@model_operation(wait=False, name="Cover art generation")
def generate(
    prompt: str,
    out_path: Path,
    seed: int | None = None,
    steps: int = 3,
    size: int = 512,
) -> Path:
    """Render one cover to out_path (PNG). Raises if the model isn't installed.

    Keeps the pipeline warm — the first call loads it, later calls reuse it.
    """
    if not available():
        raise RuntimeError("Cover model not downloaded")

    import torch

    with _lock:
        _ensure_pipe()
        gen = None
        if seed is not None:
            gen = torch.Generator(device=_device).manual_seed(int(seed) & 0x7FFFFFFF)
        with torch.inference_mode():
            image = _pipe(
                prompt=prompt,
                num_inference_steps=max(1, steps),
                guidance_scale=0.0,  # SD-Turbo is trained for cfg-free 1-4 step gen
                height=size,
                width=size,
                generator=gen,
            ).images[0]
        out_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(str(out_path))
    return out_path
