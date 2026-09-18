"""Runtime configuration, sourced from environment variables with sane defaults.

Everything lives under a single DATA_DIR so the app stays self-contained and the
large model cache can be kept off the C: drive.
"""
from __future__ import annotations

import os
from pathlib import Path

# Trust the OS certificate store so HTTPS (Hugging Face downloads) works behind
# antivirus/proxy SSL interception, which certifi's bundle alone does not cover.
try:  # pragma: no cover - environment dependent
    import truststore

    truststore.inject_into_ssl()
except Exception:
    pass

# Reduce CUDA fragmentation OOMs on long generations (set before torch loads).
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

# Repo root = two levels up from this file (backend/app/config.py -> repo root).
REPO_ROOT = Path(__file__).resolve().parents[2]


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name, str(default)))


class Settings:
    # Which engine backs generation: "stub" (no GPU) or "yue2" (real model).
    ENGINE: str = _env("MUSIGEN_ENGINE", "stub")

    # Storage. In the portable app these are pointed at folders next to the EXE
    # (models/, music/, data/) via env vars; the defaults keep dev self-contained.
    DATA_DIR: Path = _env_path("MUSIGEN_DATA_DIR", REPO_ROOT / "data")

    @property
    def AUDIO_DIR(self) -> Path:
        # Generated songs live here (the portable "/music" folder).
        return _env_path("MUSIGEN_MUSIC_DIR", self.DATA_DIR / "audio")

    @property
    def COVERS_DIR(self) -> Path:
        return self.DATA_DIR / "covers"

    @property
    def DB_PATH(self) -> Path:
        return self.DATA_DIR / "musigen.db"

    @property
    def HF_CACHE_DIR(self) -> Path:
        # All downloaded model weights (the portable "/models" folder).
        return _env_path("MUSIGEN_HF_CACHE", self.DATA_DIR / "hf-cache")

    @property
    def FRONTEND_DIST(self) -> Path:
        # Built React app to serve in production (packaged/native window mode).
        return _env_path("MUSIGEN_FRONTEND_DIST", REPO_ROOT / "frontend" / "dist")

    # YuE2 engine options
    YUE2_MODEL: str = _env("MUSIGEN_YUE2_MODEL", "m-a-p/YuE2-3B")
    YUE2_VAE: str = _env("MUSIGEN_YUE2_VAE", "m-a-p/YuE2-Vae")
    YUE2_DEVICE: str = _env("MUSIGEN_YUE2_DEVICE", "auto")
    YUE2_MEMORY_BUDGET_GIB: int = int(_env("MUSIGEN_YUE2_MEM_GIB", "15"))
    YUE2_QUANTIZATION: str = _env("MUSIGEN_YUE2_QUANT", "none")  # none | fp8
    YUE2_OFFLOAD_AR: bool = _env("MUSIGEN_YUE2_OFFLOAD", "0") in ("1", "true", "True")
    # Windows PyTorch wheels lack Flash Attention, which the default cuda-graph
    # backend requires; "torch-eager" (SDPA) is the working + faster path here.
    YUE2_BACKEND: str = _env("MUSIGEN_YUE2_BACKEND", "torch-eager")

    # Ollama (lyrics + prompt refinement). Optional; app degrades gracefully.
    OLLAMA_URL: str = _env("MUSIGEN_OLLAMA_URL", "http://127.0.0.1:11434")
    OLLAMA_MODEL: str = _env("MUSIGEN_OLLAMA_MODEL", "qwen2.5:3b")

    # Local lyric/prompt writer (transformers). Runs on GPU when available; the
    # GPU is shared with YuE2 one model at a time (see engines/llm unload hooks).
    LLM_MODEL: str = _env("MUSIGEN_LLM_MODEL", "Qwen/Qwen2.5-7B-Instruct")
    LLM_DEVICE: str = _env("MUSIGEN_LLM_DEVICE", "auto")  # auto|cuda|cpu
    # Selectable lyric-model sizes (Setup → picker). key -> (repo, label, size).
    LLM_CHOICES: list[dict] = [
        {"key": "0.5B", "repo": "Qwen/Qwen2.5-0.5B-Instruct",
         "label": "0.5B — tiny & fast", "size": "~1 GB",
         "note": "Runs anywhere, even CPU. Basic lyrics/prompts."},
        {"key": "3B", "repo": "Qwen/Qwen2.5-3B-Instruct",
         "label": "3B — balanced", "size": "~6 GB",
         "note": "Good quality, much smaller download than 7B."},
        {"key": "7B", "repo": "Qwen/Qwen2.5-7B-Instruct",
         "label": "7B — best quality", "size": "~15 GB",
         "note": "Strongest lyrics & structure adherence. Large download."},
    ]

    # CORS origins for the Vite dev server.
    CORS_ORIGINS: list[str] = [
        o.strip()
        for o in _env(
            "MUSIGEN_CORS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if o.strip()
    ]

    def ensure_dirs(self) -> None:
        for d in (
            self.DATA_DIR,
            self.AUDIO_DIR,
            self.COVERS_DIR,
            self.HF_CACHE_DIR,
        ):
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
