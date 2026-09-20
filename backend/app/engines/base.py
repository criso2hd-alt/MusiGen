"""The MusicEngine interface plus the small value types engines exchange.

These deliberately avoid pydantic / FastAPI so engines can be used and tested in
isolation (and run in a worker thread without touching the event loop).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional


@dataclass
class EngineRequest:
    style: str
    lyrics: str
    out_path: Path
    cot: str = "full"
    seed: int = 831001
    cfg_scale: Optional[float] = None
    abc: Optional[str] = None
    max_duration: int = 120
    temperature: float = 1.0
    top_p: float = 0.95
    top_k: int = 100
    repetition_penalty: float = 1.2
    checkpoint_dir: Optional[Path] = None
    is_pause_requested: Optional[Callable[[], bool]] = None
    reference_mode: str = "original"
    reference_fit_duration: bool = True
    arrangement_bpm: Optional[int] = None
    memory_mode: str = "balanced"


@dataclass
class EngineProgress:
    # One of: "planning", "generating", "synthesizing", "decoding"
    stage: str
    progress: float  # 0..1 within the whole job
    message: str = ""
    completed: Optional[int] = None
    total: Optional[int] = None
    unit: Optional[str] = None


@dataclass
class EngineResult:
    audio_path: Path
    duration: float
    sample_rate: int
    meta: dict = field(default_factory=dict)


# Callbacks the job runner passes in.
ProgressFn = Callable[[EngineProgress], None]
CancelledFn = Callable[[], bool]


class EngineCancelled(Exception):
    """Raised inside an engine when the job runner signals cancellation."""


class EnginePaused(Exception):
    """A completed stage was saved; the GPU can now serve another request."""


class MusicEngine(ABC):
    name: str = "base"
    #: whether this engine needs a (slow) model load before first use
    requires_warmup: bool = False

    def warmup(self) -> None:
        """Optionally preload weights. Safe to call multiple times."""

    @abstractmethod
    def generate(
        self,
        req: EngineRequest,
        on_progress: ProgressFn,
        is_cancelled: CancelledFn,
    ) -> EngineResult:
        """Generate audio to ``req.out_path`` (blocking; runs in a worker thread).

        Implementations should call ``on_progress`` as they move through stages
        and periodically check ``is_cancelled()`` (raising ``EngineCancelled`` to
        abort cleanly).
        """
        raise NotImplementedError
