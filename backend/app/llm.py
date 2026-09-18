"""Local text LLM (Qwen2.5-Instruct) for the lyric writer and prompt refiner.

Runs via transformers on the GPU when available. The GPU only holds one big
model at a time, so loading the LLM first unloads any music engine, and the
music engine unloads the LLM before it loads (see yue2_engine).
"""
from __future__ import annotations

import threading

from .config import settings

_lock = threading.Lock()
_model = None
_tok = None
_device = None


def available() -> bool:
    """The lyric model is usable once its weights are cached locally."""
    from . import model_manager

    return model_manager.is_ready("llm")


def is_loaded() -> bool:
    return _model is not None


def unload() -> None:
    global _model, _tok
    with _lock:
        if _model is None:
            return
        _model = None
        _tok = None
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass


def _load() -> None:
    global _model, _tok, _device
    if _model is not None:
        return
    # Free the GPU from any resident music model + cover pipeline first.
    try:
        from .engines import unload_all as unload_music

        unload_music()
    except Exception:
        pass
    try:
        from . import cover

        cover.unload()
    except Exception:
        pass

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    from . import model_manager

    path = str(model_manager.llm_dir())  # copy-mode local dir (symlink-safe)
    dev = settings.LLM_DEVICE
    if dev == "auto":
        dev = "cuda" if torch.cuda.is_available() else "cpu"
    _device = dev
    dtype = torch.bfloat16 if dev == "cuda" else torch.float32
    _tok = AutoTokenizer.from_pretrained(path, local_files_only=True)
    _model = AutoModelForCausalLM.from_pretrained(
        path, torch_dtype=dtype, local_files_only=True
    ).to(dev)
    _model.eval()


def generate(system: str, user: str, max_new_tokens: int = 700,
             temperature: float = 0.9) -> str | None:
    """Chat-style generation. Returns None if the model isn't available."""
    if not available():
        return None
    import torch

    with _lock:
        try:
            _load()
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ]
            text = _tok.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            inputs = _tok(text, return_tensors="pt").to(_device)
            with torch.inference_mode():
                out = _model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    do_sample=True,
                    temperature=temperature,
                    top_p=0.95,
                    pad_token_id=_tok.eos_token_id,
                )
            gen = out[0][inputs["input_ids"].shape[1]:]
            return _tok.decode(gen, skip_special_tokens=True).strip()
        except Exception:
            return None
