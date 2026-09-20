"""Instance-local adapter for the installed YuE2 0.1.6 status callback protocol.

Synthesis reports submitted steps (CUDA may still be completing them). No
monkey-patching of global package functions and no change to model math/RNG.
"""
from .base import EngineProgress


class PipelineStatus:
    def __init__(self, report, label, total=None, unit=None):
        self.report, self.label, self.total, self.unit = report, label, total, unit
        self.completed = 0

    def __enter__(self):
        self.update(0)
        return self

    def __exit__(self, *_):
        return False

    def update(self, completed, total=None):
        self.completed = completed
        if total is not None:
            self.total = total
        if self.label == "Synthesizing audio":
            fraction = min(1, completed / self.total) if self.total else 0
            self.report(EngineProgress("synthesizing", .68 + .20 * fraction,
                f"Synthesis: {completed}/{self.total or '?'} steps submitted" +
                ("; completing GPU work" if self.total and completed == self.total else ""),
                completed, self.total, "steps submitted"))
        elif self.label == "Decoding audio":
            fraction = min(1, completed / self.total) if self.total else 0
            self.report(EngineProgress("decoding", .90 + .09 * fraction,
                f"Decoding: {completed}/{self.total or '?'} chunks", completed, self.total, "chunks"))

    def advance(self, count=1):
        self.update(self.completed + count)

    def finish(self, status="completed"):
        pass
