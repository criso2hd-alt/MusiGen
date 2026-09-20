"""One ownership lock for all model operations, always acquired before model locks."""
from functools import wraps
from contextlib import contextmanager
import threading
import time

_lock = threading.RLock()
_state_lock = threading.Lock()
_owner: dict | None = None


class ModelBusy(RuntimeError):
    pass


def activity() -> dict | None:
    with _state_lock:
        return dict(_owner) if _owner else None


@contextmanager
def model_session(name: str, *, wait=True, cancelled=None, on_wait=None):
    global _owner
    waiting = False
    while not _lock.acquire(blocking=False):
        if not wait:
            owner = activity()
            raise ModelBusy(f"{owner['name'] if owner else 'Another AI task'} is using the models. Try again when it finishes.")
        if cancelled and cancelled():
            from .engines.base import EngineCancelled
            raise EngineCancelled()
        if not waiting and on_wait:
            on_wait()
        waiting = True
        time.sleep(0.1)
    with _state_lock:
        outer = _owner is None
        if outer:
            _owner = {"name": name, "started_at": time.time()}
    try:
        yield
    finally:
        with _state_lock:
            if outer:
                _owner = None
        _lock.release()


def model_operation(*, wait: bool = True, name: str | None = None):
    def decorate(fn):
        @wraps(fn)
        def run(*args, **kwargs):
            with model_session(name or fn.__qualname__, wait=wait):
                return fn(*args, **kwargs)
        return run
    return decorate
