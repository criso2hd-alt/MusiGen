"""The real YuE2 engine, driving the native `yue2` package staged pipeline.

Mapping (see yue2/pipeline.py, verified against the installed source):
    plan()             -> "planning"     (ABC score; emits on_token per token)
    generate_semantic()-> "generating"   (the main LM pass; emits on_token)
    synthesize()       -> "synthesizing" (NAR flow-matching -> latents)
    decode()           -> "decoding"     (VAE -> 48 kHz audio)

Heavy imports (torch/yue2) are deferred so the app can run in stub mode without
loading the ML stack. The pipeline is loaded once and reused across jobs.
"""
from __future__ import annotations

import threading

from ..config import settings
from .base import (
    EngineCancelled,
    EngineProgress,
    EngineRequest,
    EngineResult,
    MusicEngine,
)


class YuE2Engine(MusicEngine):
    name = "yue2"
    requires_warmup = True

    def __init__(self) -> None:
        self._pipe = None
        self._lock = threading.Lock()  # one GPU: serialise access

    # -- lifecycle ---------------------------------------------------------

    def warmup(self) -> None:
        self._ensure_pipe()

    def close(self) -> None:
        """Release the model + VRAM (called before the LLM loads, or on shutdown)."""
        with self._lock:
            pipe = self._pipe
            self._pipe = None
        if pipe is not None:
            try:
                pipe.close()
            except Exception:
                pass
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass

    def _ensure_pipe(self):
        if self._pipe is not None:
            return self._pipe
        with self._lock:
            if self._pipe is None:
                settings.ensure_dirs()
                from yue2.pipeline import YuE2Pipeline  # deferred heavy import

                self._pipe = YuE2Pipeline.from_pretrained(
                    settings.YUE2_MODEL,
                    vae=settings.YUE2_VAE,
                    cache_dir=str(settings.HF_CACHE_DIR),
                    device=settings.YUE2_DEVICE,
                    memory_budget_gib=settings.YUE2_MEMORY_BUDGET_GIB,
                    quantization=settings.YUE2_QUANTIZATION,
                    offload_ar=settings.YUE2_OFFLOAD_AR,
                    backend=settings.YUE2_BACKEND,
                    local_files_only=True,  # weights already downloaded
                    progress=False,  # we surface progress ourselves
                )
                # The pipeline caps PyTorch at (budget-2) GiB, which OOMs long
                # songs early and blocks the driver's shared-memory fallback.
                # Lift the cap so it can use all VRAM (and spill to shared RAM,
                # slowly, rather than fail) on long generations.
                try:
                    import torch

                    if torch.cuda.is_available():
                        torch.cuda.set_per_process_memory_fraction(1.0, 0)
                except Exception:
                    pass
        return self._pipe

    # -- generation --------------------------------------------------------

    def generate(self, req, on_progress, is_cancelled) -> EngineResult:  # type: ignore[override]
        from yue2.protocol import Sampling, SongRequest

        # The GPU holds one big model at a time — free the lyric LLM + cover
        # pipeline first.
        try:
            from ..llm import unload as unload_llm

            unload_llm()
        except Exception:
            pass
        try:
            from .. import cover

            cover.unload()
        except Exception:
            pass

        pipe = self._ensure_pipe()

        song_request = SongRequest(
            style=req.style,
            lyrics=req.lyrics or "[verse]\n",
            cot=req.cot,
            seed=req.seed,
            abc=req.abc,
            cfg_scale=req.cfg_scale,
        )
        # rough token budget from the requested duration; measured on this build
        # at ~26 semantic tokens per second of audio. Keeps songs bounded.
        est_tokens = max(400, min(9000, int(req.max_duration * 27)))
        # Sampling is a frozen dataclass, so set max_tokens at construction.
        semantic_sampling = Sampling(
            temperature=req.temperature,
            top_p=req.top_p,
            top_k=req.top_k,
            repetition_penalty=req.repetition_penalty,
            max_tokens=est_tokens,
        )

        def cancelled() -> bool:
            return is_cancelled()

        # --- staged run, translating token callbacks into a progress bar ---
        with self._lock:
            plan_tokens = {"n": 0}

            def on_plan_token(phase, token):
                plan_tokens["n"] += 1
                frac = min(0.14, 0.02 + plan_tokens["n"] / 6000)
                on_progress(EngineProgress("planning", frac, "Planning the score"))
                if is_cancelled():
                    raise EngineCancelled()

            sem_tokens = {"n": 0}

            def on_sem_token(phase, token):
                sem_tokens["n"] += 1
                frac = 0.15 + 0.50 * min(1.0, sem_tokens["n"] / est_tokens)
                on_progress(EngineProgress("generating", frac, "Composing the song"))
                if is_cancelled():
                    raise EngineCancelled()

            try:
                on_progress(EngineProgress("planning", 0.02, "Planning the score"))
                plan = pipe.plan(
                    request=song_request, cancelled=cancelled, on_token=on_plan_token
                )

                on_progress(EngineProgress("generating", 0.16, "Composing the song"))
                semantic = pipe.generate_semantic(
                    plan,
                    sampling=semantic_sampling,
                    cancelled=cancelled,
                    on_token=on_sem_token,
                )

                on_progress(EngineProgress("synthesizing", 0.68, "Synthesizing audio"))
                latents = pipe.synthesize(semantic, cancelled=cancelled)

                if is_cancelled():
                    raise EngineCancelled()

                on_progress(EngineProgress("decoding", 0.90, "Decoding to 48 kHz"))
                audio = pipe.decode(latents)
            except InterruptedError as exc:  # raised by the pipeline on cancel
                raise EngineCancelled() from exc

        sample_rate = 48000
        req.out_path.parent.mkdir(parents=True, exist_ok=True)

        # Reuse the package's writer (FLAC PCM_24) via a SongResult-like save.
        import soundfile as sf

        sf.write(str(req.out_path), audio, sample_rate, subtype="PCM_24")
        on_progress(EngineProgress("decoding", 1.0, "Done"))

        duration = float(len(audio) / sample_rate)
        return EngineResult(
            audio_path=req.out_path,
            duration=duration,
            sample_rate=sample_rate,
            meta={
                "engine": "yue2",
                "abc": plan.abc,
                "timing": getattr(semantic, "timing", {}),
            },
        )
