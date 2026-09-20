"""MusiGen portable bootstrapper — the packaged MusiGen.exe entry point.

On first run it builds a local Python runtime and installs the heavy deps
(CUDA PyTorch + backend), then launches the app in its own window. Later runs
detect the ready runtime and launch straight away. Model weights (~8 GB) are
fetched on the first song, not at install time.

Layout at runtime:
  %LOCALAPPDATA%\\MusiGen\\runtime   local venv (uv-managed Python 3.12)
  %LOCALAPPDATA%\\MusiGen\\data      SQLite, audio, HF model cache
Resources (backend/, frontend/dist/, uv.exe, launcher.py) are bundled in the exe.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from runtime_config import ENGINE_REQUIREMENT, RUNTIME_TAG, TORCH_VERSION

APP_NAME = "MusiGen"


def res_dir() -> Path:
    """Directory holding bundled resources (PyInstaller _MEIPASS, else repo)."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parents[1]


def app_dir() -> Path:
    base = os.environ.get("MUSIGEN_HOME") or os.path.join(
        os.environ.get("LOCALAPPDATA", str(Path.home())), APP_NAME
    )
    d = Path(base)
    (d / "data").mkdir(parents=True, exist_ok=True)
    return d


def log(msg: str) -> None:
    print(f"[MusiGen setup] {msg}", flush=True)


def _run(cmd: list[str]) -> None:
    log(" ".join(str(c) for c in cmd))
    subprocess.run(cmd, check=True)


def ensure_runtime(res: Path, home: Path) -> Path:
    runtime = home / "runtime"
    marker = runtime / f".ready-{RUNTIME_TAG}"
    py = runtime / "Scripts" / "python.exe"
    if marker.exists() and py.exists():
        return py

    uv = res / "uv.exe"
    if not uv.exists():
        raise RuntimeError(f"bundled uv.exe missing at {uv}")

    # Use the OS certificate store so downloads work behind antivirus/proxy TLS
    # interception (same reason the backend uses truststore).
    os.environ["UV_SYSTEM_CERTS"] = "1"
    # Prefer an installed CPython: uv's managed standalone build statically links
    # an OpenSSL that lacks the Windows applink shim and crashes on TLS. A normal
    # python.org interpreter works. Falls back to managed only if none is found.
    os.environ["UV_PYTHON_PREFERENCE"] = "system"

    log("First run: setting up the MusiGen runtime (this happens once).")
    log("Creating Python 3.12 environment…")
    _run([str(uv), "venv", str(runtime), "--python", "3.12"])

    log("Installing CUDA PyTorch (~2.5 GB, one time)…")
    _run([
        str(uv), "pip", "install", "--python", str(py),
        f"torch=={TORCH_VERSION}", "--index-url", "https://download.pytorch.org/whl/cu128",
    ])

    log("Installing MusiGen backend dependencies…")
    reqs = res / "backend" / "requirements.txt"
    _run([str(uv), "pip", "install", "--python", str(py), "-r", str(reqs),
          "pywebview", "hf_xet"])

    log("Installing the YuE2 engine…")
    _run([str(uv), "pip", "install", "--python", str(py),
          ENGINE_REQUIREMENT, "--no-deps"])

    marker.write_text(RUNTIME_TAG, encoding="utf-8")
    log("Runtime ready.")
    return py


def launch(py: Path, res: Path, home: Path) -> int:
    env = dict(os.environ)
    env["MUSIGEN_FRONTEND_DIST"] = str(res / "frontend" / "dist")
    env["MUSIGEN_DATA_DIR"] = str(home / "data")
    env.setdefault("MUSIGEN_ENGINE", "yue2")
    env.setdefault("MUSIGEN_YUE2_BACKEND", "torch-eager")
    env["PYTHONPATH"] = str(res / "backend")
    launcher = res / "launcher.py"
    log("Launching MusiGen…")
    # Runs the app window in the runtime venv; returns when the window is closed.
    return subprocess.call([str(py), str(launcher)], env=env)


def main() -> int:
    res = res_dir()
    home = app_dir()
    try:
        py = ensure_runtime(res, home)
    except subprocess.CalledProcessError as exc:
        log(f"Setup failed: {exc}")
        try:
            input("Setup failed. Press Enter to close…")
        except EOFError:
            pass
        return 1
    return launch(py, res, home)


if __name__ == "__main__":
    raise SystemExit(main())
