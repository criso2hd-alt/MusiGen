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

from dataclasses import replace
import threading
import hashlib
import json
import os

from ..config import settings
from ..gpu import model_operation, model_session
from ..checkpoints import read_json, write_json
from .yue_progress import PipelineStatus
from .base import (
    EngineCancelled,
    EnginePaused,
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

    @model_operation()
    def warmup(self) -> None:
        self._ensure_pipe()

    @model_operation()
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
                # Allow the physical VRAM budget instead of the pipeline's
                # smaller allocator cap. Windows can still page allocations;
                # bounded synthesis below reduces that memory pressure.
                try:
                    import torch

                    if torch.cuda.is_available():
                        torch.cuda.set_per_process_memory_fraction(1.0, 0)
                except Exception:
                    pass
        return self._pipe

    # -- generation --------------------------------------------------------

    def generate(self, req, on_progress, is_cancelled) -> EngineResult:  # type: ignore[override]
        with model_session("Music generation", cancelled=is_cancelled,
                           on_wait=lambda: on_progress(EngineProgress("waiting", 0, "Waiting for another AI task"))):
            if is_cancelled():
                raise EngineCancelled()
            try:
                return self._generate_core(req, on_progress, is_cancelled)
            finally:
                if self._pipe is not None:
                    self._pipe.__dict__.pop("_status", None)
                    self._pipe.progress = False

    def _generate_core(self, req, on_progress, is_cancelled):
        from yue2.protocol import Sampling, SongRequest
        from yue2.pipeline import SymbolicPlan, SemanticResult
        import numpy as np

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

        on_progress(EngineProgress("planning", .01, "Preparing music model"))
        pipe = self._ensure_pipe()
        pipe.offload_ar = settings.YUE2_OFFLOAD_AR or req.memory_mode == "low"
        # Windows lacks the flash kernel on the validated build. Full math-SDPA
        # attention spilled >4 GB into shared memory on a 16 GB RTX 4080.
        query_chunk_size = 256 if os.name == "nt" or req.memory_mode == "low" else None
        pipe._status = lambda label, **kwargs: PipelineStatus(on_progress, label, **kwargs)
        pipe.progress = True

        checkpoint = req.checkpoint_dir
        if checkpoint:
            checkpoint.mkdir(parents=True, exist_ok=True)
            signature = {"request": {k: v for k, v in vars(req).items()
                         if k not in {"out_path", "checkpoint_dir", "is_pause_requested"}},
                         "weights": pipe.weights, "runtime": pipe.runtime_sha256}
            if req.reference_mode == "original":
                for name in ("reference_mode", "reference_fit_duration"):
                    signature["request"].pop(name, None)
                if req.arrangement_bpm is None:
                    signature["request"].pop("arrangement_bpm", None)
                else:
                    signature["tempo_adapter_version"] = 1
            else:
                signature["arrangement_version"] = 1
            fingerprint = hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest()
            identity = checkpoint / "identity.json"
            if identity.exists() and read_json(identity) != fingerprint:
                raise ValueError("Saved stage belongs to different settings or model files. Start a new generation.")
            write_json(identity, fingerprint)

        def boundary():
            if is_cancelled():
                raise EngineCancelled()
            if checkpoint and req.is_pause_requested and req.is_pause_requested():
                raise EnginePaused()

        boundary()

        from ..reference_arrangement import retime_score
        song_request = SongRequest(
            style=req.style,
            lyrics=req.lyrics or "[verse]\n",
            cot=req.cot,
            seed=req.seed,
            abc=retime_score(req.abc, req.arrangement_bpm),
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
                on_progress(EngineProgress("planning", frac, f"Planning the score · {plan_tokens['n']} tokens", plan_tokens["n"], None, "tokens"))
                if is_cancelled():
                    raise EngineCancelled()

            sem_tokens = {"n": 0}

            def on_sem_token(phase, token):
                sem_tokens["n"] += 1
                frac = 0.15 + 0.50 * min(1.0, sem_tokens["n"] / est_tokens)
                on_progress(EngineProgress("generating", frac, f"Composing · {sem_tokens['n']} tokens (limit {est_tokens})", sem_tokens["n"], None, "tokens"))
                if is_cancelled():
                    raise EngineCancelled()

            arrangement_meta = read_json(checkpoint / "arrangement.json") if checkpoint and (checkpoint / "arrangement.json").exists() else None
            try:
                on_progress(EngineProgress("planning", 0.02, "Planning the score"))
                if checkpoint and (checkpoint / "plan" / "plan_manifest.json").exists():
                    plan = SymbolicPlan.load(checkpoint / "plan")
                else:
                    if req.abc and req.reference_mode != "original":
                        from ..reference_arrangement import arrange, parse_score
                        vocal_abc = None
                        if req.reference_mode == "backing":
                            source = parse_score(req.abc)
                            vocal_request = replace(song_request, abc=None, cot="melody",
                                style=f"{req.style}, lead singing voice, {req.arrangement_bpm or source.bpm:g} BPM, {source.meter} meter, key {source.key_name}")
                            on_progress(EngineProgress("planning", .02, "Planning a new vocal melody"))
                            vocal_plan = pipe.plan(request=vocal_request, cancelled=cancelled, on_token=on_plan_token)
                            if vocal_plan.truncated:
                                raise ValueError("Vocal planning stopped early. Try fewer lyric sections.")
                            vocal_abc = vocal_plan.abc
                        adapted, arrangement_meta = arrange(req.abc, req.lyrics, req.reference_mode,
                            req.max_duration, req.reference_fit_duration, req.arrangement_bpm, vocal_abc)
                        song_request = replace(song_request, abc=adapted, cot="melody")
                        if checkpoint:
                            write_json(checkpoint / "arrangement.json", arrangement_meta)
                    plan = pipe.plan(request=song_request, cancelled=cancelled, on_token=on_plan_token)
                    if checkpoint:
                        plan.save(checkpoint / "plan")
                boundary()

                on_progress(EngineProgress("generating", 0.16, "Composing the song"))
                if checkpoint and (checkpoint / "semantic.json").exists():
                    data = read_json(checkpoint / "semantic.json")
                    semantic = SemanticResult(plan, data["tokens"], data["timing"], data["truncated"])
                else:
                    semantic = pipe.generate_semantic(plan, sampling=semantic_sampling,
                        cancelled=cancelled, on_token=on_sem_token)
                    if checkpoint:
                        write_json(checkpoint / "semantic.json", {"tokens": semantic.tokens,
                            "timing": semantic.timing, "truncated": semantic.truncated})
                boundary()

                on_progress(EngineProgress("synthesizing", 0.68, "Synthesizing audio"))
                if checkpoint and (checkpoint / "latents.npy").exists():
                    latents = np.load(checkpoint / "latents.npy", allow_pickle=False)
                else:
                    if query_chunk_size:
                        from .yue_synthesis import synthesize_bounded
                        latents = synthesize_bounded(pipe, semantic, on_progress, cancelled, query_chunk_size)
                    else:
                        latents = pipe.synthesize(semantic, cancelled=cancelled)
                    if checkpoint:
                        temporary = checkpoint / "latents.tmp.npy"
                        np.save(temporary, latents, allow_pickle=False)
                        temporary.replace(checkpoint / "latents.npy")
                boundary()

                if is_cancelled():
                    raise EngineCancelled()

                on_progress(EngineProgress("decoding", 0.90, "Decoding to 48 kHz"))
                audio = pipe.decode(latents)
                if is_cancelled():
                    raise EngineCancelled()
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
                "reference_arrangement": arrangement_meta,
                "timing": getattr(semantic, "timing", {}),
                "truncated": bool(semantic.truncated or plan.truncated),
                "semantic_token_limit": est_tokens,
                "requested_duration": req.max_duration,
                "memory_mode": req.memory_mode,
                "attention_query_chunk_size": query_chunk_size,
                "weights": pipe.weights,
                "runtime_sha256": pipe.runtime_sha256,
            },
        )
