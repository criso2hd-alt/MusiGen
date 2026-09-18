"""A GPU-free engine that synthesises pleasant placeholder audio.

It lets the whole app (player, visualizer, playlists, job queue, progress) be
built and demoed without downloading YuE2 or owning a GPU. The output is
procedurally derived from the style + seed so different prompts sound different.
"""
from __future__ import annotations

import hashlib
import time

import numpy as np
import soundfile as sf

from .base import (
    EngineCancelled,
    EngineProgress,
    EngineRequest,
    EngineResult,
    MusicEngine,
)

# Pentatonic-ish scales keyed loosely by mood words found in the style string.
_SCALES = {
    "minor": [0, 3, 5, 7, 10],
    "major": [0, 2, 4, 7, 9],
    "dark": [0, 2, 3, 7, 8],
    "dreamy": [0, 2, 5, 7, 9],
}


def _pick(style: str, seed: int) -> dict:
    h = hashlib.sha256(f"{style}|{seed}".encode()).digest()
    s = style.lower()
    if any(w in s for w in ("sad", "dark", "melancholic", "minor", "moody")):
        scale = "dark"
    elif any(w in s for w in ("dream", "ambient", "ethereal", "chill", "lofi")):
        scale = "dreamy"
    elif any(w in s for w in ("happy", "upbeat", "bright", "pop", "major")):
        scale = "major"
    else:
        scale = "minor"
    bpm = 70 + (h[0] % 90)  # 70..160
    root = 196.0 * (2 ** ((h[1] % 12) / 12.0))  # around G3, transposed
    return {"scale": _SCALES[scale], "bpm": bpm, "root": root, "h": h}


def _adsr(n: int, sr: int) -> np.ndarray:
    a = int(0.01 * sr)
    r = int(0.15 * sr)
    env = np.ones(n)
    env[:a] = np.linspace(0, 1, a)
    env[-r:] = np.linspace(1, 0, r)
    return env


class StubEngine(MusicEngine):
    name = "stub"
    requires_warmup = False

    def generate(self, req, on_progress, is_cancelled) -> EngineResult:  # type: ignore[override]
        sr = 44100
        duration = max(6, min(req.max_duration, 30))  # keep the stub snappy
        params = _pick(req.style, req.seed)
        rng = np.random.default_rng(req.seed & 0xFFFFFFFF)

        stages = [
            ("planning", 0.15, "Sketching structure"),
            ("generating", 0.55, "Laying down the melody"),
            ("synthesizing", 0.80, "Arranging the mix"),
            ("decoding", 0.98, "Rendering audio"),
        ]

        beat = 60.0 / params["bpm"]
        step = beat / 2  # eighth notes
        total_samples = int(duration * sr)
        audio = np.zeros(total_samples, dtype=np.float64)

        # progress helper that also checks cancellation
        def tick(stage: str, frac: float, msg: str) -> None:
            if is_cancelled():
                raise EngineCancelled()
            on_progress(EngineProgress(stage=stage, progress=frac, message=msg))

        tick(*(stages[0][0], stages[0][1], stages[0][2]))
        time.sleep(0.4)

        # --- melody (generating) ---
        tick(stages[1][0], stages[1][1], stages[1][2])
        n_steps = int(duration / step)
        scale = params["scale"]
        for i in range(n_steps):
            if i % 8 == 0:
                tick(
                    "generating",
                    0.20 + 0.40 * (i / max(1, n_steps)),
                    "Laying down the melody",
                )
                time.sleep(0.02)
            degree = scale[rng.integers(0, len(scale))]
            octave = rng.integers(0, 2)
            freq = params["root"] * (2 ** ((degree + 12 * octave) / 12.0))
            start = int(i * step * sr)
            length = int(step * sr)
            end = min(start + length, total_samples)
            if end <= start:
                break
            t = np.arange(end - start) / sr
            note = np.sin(2 * np.pi * freq * t) * 0.28
            note += np.sin(2 * np.pi * freq * 2 * t) * 0.08  # a touch of harmonic
            audio[start:end] += note * _adsr(end - start, sr)

        # --- bass + kick (synthesizing) ---
        tick(stages[2][0], stages[2][1], stages[2][2])
        for i in range(int(duration / beat)):
            start = int(i * beat * sr)
            length = int(beat * sr)
            end = min(start + length, total_samples)
            if end <= start:
                break
            t = np.arange(end - start) / sr
            bass = np.sin(2 * np.pi * (params["root"] / 2) * t) * 0.22
            audio[start:end] += bass * _adsr(end - start, sr)
            # kick: quick pitch-dropping sine
            kn = min(int(0.12 * sr), end - start)
            kt = np.arange(kn) / sr
            kfreq = np.linspace(120, 45, kn)
            kick = np.sin(2 * np.pi * kfreq * kt) * np.linspace(0.6, 0, kn)
            audio[start : start + kn] += kick
        time.sleep(0.3)

        # --- normalise + stereo + write (decoding) ---
        tick(stages[3][0], stages[3][1], stages[3][2])
        peak = np.max(np.abs(audio)) or 1.0
        audio = (audio / peak) * 0.9
        # gentle stereo widening
        stereo = np.stack([audio, np.roll(audio, 300)], axis=1).astype(np.float32)

        req.out_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(req.out_path), stereo, sr, format="FLAC")
        time.sleep(0.2)

        return EngineResult(
            audio_path=req.out_path,
            duration=float(duration),
            sample_rate=sr,
            meta={"engine": "stub", "bpm": params["bpm"]},
        )
