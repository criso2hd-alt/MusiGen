"""MusiGen native-window launcher.

Runs the FastAPI backend (which also serves the built React UI) in-process and
opens it in a real OS window via pywebview. Closing the window exits the process,
which releases all GPU memory held by the model.

Usage (dev):  .venv/Scripts/python launcher.py
Packaged as MusiGen.exe, this is the entry point (see build/musigen.spec).
"""
from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.request
from pathlib import Path


def _root() -> Path:
    # When frozen by PyInstaller, resources sit next to the exe (sys._MEIPASS for
    # bundled files); in dev, this file's directory is the repo root.
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent


ROOT = _root()

# Backend defaults for the packaged/native app.
os.environ.setdefault("MUSIGEN_ENGINE", "yue2")
os.environ.setdefault("MUSIGEN_YUE2_BACKEND", "torch-eager")
# Serve the bundled built UI and keep data next to the executable in packaged mode.
os.environ.setdefault("MUSIGEN_FRONTEND_DIST", str(ROOT / "frontend" / "dist"))

# Make the backend package importable.
sys.path.insert(0, str(ROOT / "backend"))


def _free_port(preferred: int = 8000) -> int:
    for port in (preferred, 8010, 8020, 0):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", port))
                return s.getsockname()[1]
        except OSError:
            continue
    return preferred


def _wait_ready(host: str, port: int, timeout: float = 60.0) -> bool:
    # TCP connect check — proxy-immune, unlike urllib/HTTP on this machine.
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=2):
                return True
        except Exception as exc:  # noqa: BLE001
            last = repr(exc)
            time.sleep(0.3)
    print(f"[launcher] backend port never opened: {last}", file=sys.stderr, flush=True)
    return False


def main() -> int:
    import uvicorn
    from app.main import app  # noqa: WPS433 (import after sys.path set)

    host = "127.0.0.1"
    port = _free_port(8000)
    print(f"[launcher] starting backend on {host}:{port}", flush=True)
    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    # uvicorn installs signal handlers which only work on the main thread; disable
    # them so the server can run in this background thread.
    server.install_signal_handlers = lambda: None  # type: ignore[method-assign]

    def _serve() -> None:
        try:
            server.run()
        except Exception as exc:  # noqa: BLE001
            import traceback

            print(f"[launcher] uvicorn crashed: {exc}", file=sys.stderr, flush=True)
            traceback.print_exc()

    threading.Thread(target=_serve, daemon=True).start()

    base = f"http://{host}:{port}"
    if not _wait_ready(host, port):
        print("Backend failed to start", file=sys.stderr)
        return 1
    print("[launcher] backend ready; opening window", flush=True)

    import webview

    class _Api:
        def save_dialog(self, suggested_name: str = "song.flac"):
            wins = webview.windows
            if not wins:
                return None
            r = wins[0].create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename=suggested_name or "song.flac",
                file_types=("Audio files (*.flac;*.wav)", "All files (*.*)"),
            )
            if not r:
                return None
            return r if isinstance(r, str) else (r[0] if r else None)

        def pick_folder(self):
            wins = webview.windows
            if not wins:
                return None
            r = wins[0].create_file_dialog(webview.FOLDER_DIALOG)
            if not r:
                return None
            return r[0] if isinstance(r, (list, tuple)) else r

        def open_external(self, url: str):
            try:
                import webbrowser

                webbrowser.open(url)
                return True
            except Exception:
                return False

        def open_path(self, path: str):
            try:
                import os

                os.startfile(path)
                return True
            except Exception:
                return False

    webview.create_window(
        "MusiGen",
        base,
        width=1440,
        height=920,
        min_size=(960, 640),
        background_color="#07080d",
        js_api=_Api(),
    )
    webview.start()  # blocks until the window is closed
    # Hard-exit so the torch CUDA allocator is torn down and VRAM is released.
    os._exit(0)


if __name__ == "__main__":
    raise SystemExit(main())
