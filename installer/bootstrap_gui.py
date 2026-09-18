"""MusiGen windowed launcher + in-app first-run installer (no console).

Opens a single native window. On first run it shows a setup screen INSIDE that
window with a free-disk-space check and live download progress (speed + ETA + %),
installs everything into a dedicated folder, then loads the app in the same
window. On later runs it goes straight to the app. Closing the window terminates
the backend, releasing GPU memory.

Frozen as MusiGen.exe (PyInstaller --windowed).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    import truststore

    truststore.inject_into_ssl()  # OS cert store (works behind proxy TLS interception)
except Exception:
    pass

APP_NAME = "MusiGen"
RUNTIME_TAG = "r2"  # bump when backend deps change → forces a one-time re-setup
                     # (r2: added diffusers + mutagen for cover art & lyric tagging)
_job_handle = None


def _enable_kill_on_close() -> None:
    """Put this process in a Windows Job Object with KILL_ON_JOB_CLOSE so ALL
    child processes (uv, the backend, its uvicorn) are terminated when MusiGen
    exits for any reason — clean close, crash, or force-kill. Guarantees nothing
    is left running/using resources when the app isn't open."""
    global _job_handle
    if os.name != "nt":
        return
    try:
        import ctypes
        from ctypes import wintypes

        class BASIC(ctypes.Structure):
            _fields_ = [
                ("PerProcessUserTimeLimit", wintypes.LARGE_INTEGER),
                ("PerJobUserTimeLimit", wintypes.LARGE_INTEGER),
                ("LimitFlags", wintypes.DWORD),
                ("MinimumWorkingSetSize", ctypes.c_size_t),
                ("MaximumWorkingSetSize", ctypes.c_size_t),
                ("ActiveProcessLimit", wintypes.DWORD),
                ("Affinity", ctypes.c_size_t),
                ("PriorityClass", wintypes.DWORD),
                ("SchedulingClass", wintypes.DWORD),
            ]

        class IOC(ctypes.Structure):
            _fields_ = [(n, ctypes.c_ulonglong) for n in
                        ("r", "w", "o", "rt", "wt", "ot")]

        class EXT(ctypes.Structure):
            _fields_ = [
                ("BasicLimitInformation", BASIC),
                ("IoInfo", IOC),
                ("ProcessMemoryLimit", ctypes.c_size_t),
                ("JobMemoryLimit", ctypes.c_size_t),
                ("PeakProcessMemoryUsed", ctypes.c_size_t),
                ("PeakJobMemoryUsed", ctypes.c_size_t),
            ]

        k = ctypes.windll.kernel32
        job = k.CreateJobObjectW(None, None)
        if not job:
            return
        info = EXT()
        info.BasicLimitInformation.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE
        k.SetInformationJobObject(job, 9, ctypes.byref(info), ctypes.sizeof(info))
        k.AssignProcessToJobObject(job, k.GetCurrentProcess())
        _job_handle = job  # keep handle alive; closing it triggers the kill
    except Exception:
        pass
TORCH_INDEX = "https://download.pytorch.org/whl/cu128"
# Rough space needed for runtime + deps (models download later, checked then).
REQUIRED_GB = 8.0
CREATE_NO_WINDOW = 0x08000000  # keep child processes from flashing consoles


def res_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parents[1]


def app_dir() -> Path:
    """Portable home: everything (runtime, models, music, data) lives HERE, in the
    app's own folder next to the EXE — never scattered into AppData. Delete the
    folder and it's all gone. Override with MUSIGEN_HOME if ever needed."""
    override = os.environ.get("MUSIGEN_HOME")
    if override:
        return Path(override)
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent  # next to MusiGen.exe
    return Path(__file__).resolve().parents[1] / "portable"  # dev sandbox


SUBDIRS = ("runtime", "downloads", "models", "music", "data")


def ensure_home(home: Path) -> None:
    """Create the portable subfolders and verify the location is writable."""
    for sub in SUBDIRS:
        (home / sub).mkdir(parents=True, exist_ok=True)
    probe = home / ".write-test"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink()


# ---- shared setup state (read by the web UI) ------------------------------

STATE: dict = {
    "phase": "starting",
    "message": "Starting…",
    "percent": 0.0,
    "speed_mbps": 0.0,
    "eta_sec": 0.0,
    "disk_free_gb": 0.0,
    "disk_need_gb": REQUIRED_GB,
    "error": "",
    "ready": False,
    "app_url": "",
    "folder": "",
}
_lock = threading.Lock()


def set_state(**kw) -> None:
    with _lock:
        STATE.update(kw)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _tcp_ready(port: int, timeout: float = 90) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=2):
                return True
        except Exception:
            time.sleep(0.3)
    return False


# ---- setup web server -----------------------------------------------------

SETUP_HTML = """<!doctype html><html><head><meta charset=utf-8>
<title>MusiGen setup</title><style>
:root{--bg:#07080d;--panel:#12141f;--muted:#8b8fa6;--text:#e8eaf2;--accent:#22d3ee;--accent2:#a855f7;--rose:#f43f5e}
*{box-sizing:border-box}body{margin:0;height:100vh;display:grid;place-items:center;background:
radial-gradient(60% 50% at 15% 0%,rgba(168,85,247,.18),transparent 60%),
radial-gradient(50% 50% at 100% 10%,rgba(34,211,238,.14),transparent 55%),
linear-gradient(180deg,#07080d,#0c0e18);color:var(--text);font-family:Inter,Segoe UI,system-ui,sans-serif}
.card{width:min(560px,90vw);background:rgba(20,23,38,.6);border:1px solid rgba(255,255,255,.08);
backdrop-filter:blur(18px);border-radius:20px;padding:34px}
.logo{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.badge{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));
display:grid;place-items:center;font-size:20px}
h1{font-size:20px;margin:0}.sub{color:var(--muted);font-size:13px;margin:2px 0 22px}
.phase{font-size:14px;margin-bottom:8px}.msg{color:var(--muted);font-size:12px;min-height:16px;
white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{height:10px;border-radius:8px;background:rgba(255,255,255,.08);overflow:hidden;margin:10px 0 6px}
.fill{height:100%;width:0;border-radius:8px;background:linear-gradient(90deg,var(--accent),var(--accent2));
transition:width .3s ease}
.stats{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
.disk{margin-top:18px;font-size:12px;color:var(--muted)}
.err{margin-top:16px;color:var(--rose);font-size:13px;display:none;line-height:1.5}
.spin{display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,.2);
border-top-color:var(--accent);border-radius:50%;animation:s 1s linear infinite;vertical-align:-1px;margin-right:6px}
@keyframes s{to{transform:rotate(360deg)}}
</style></head><body><div class=card>
<div class=logo><div class=badge>🎵</div><div><h1>MusiGen</h1><div class=sub>local AI music studio</div></div></div>
<div class=phase id=phase><span class=spin></span><span id=phaseText>Preparing…</span></div>
<div class=bar><div class=fill id=fill></div></div>
<div class=stats><span id=pct>0%</span><span id=rate></span></div>
<div class=msg id=msg></div>
<div class=disk id=disk></div>
<div class=err id=err></div>
</div><script>
function fmtEta(s){if(!s||!isFinite(s))return'';s=Math.round(s);let m=Math.floor(s/60);return m>0?m+'m '+(s%60)+'s left':s+'s left'}
async function tick(){try{const r=await fetch('/status');const d=await r.json();
if(d.error){document.getElementById('err').style.display='block';
document.getElementById('err').textContent=d.error;
document.getElementById('phase').innerHTML='<span style=color:var(--rose)>Setup cannot continue</span>';return}
if(d.ready&&d.app_url){document.getElementById('phaseText').textContent='Opening MusiGen…';
location.href=d.app_url;return}
document.getElementById('phaseText').textContent=d.message||d.phase;
document.getElementById('fill').style.width=(d.percent||0)+'%';
document.getElementById('pct').textContent=Math.round(d.percent||0)+'%';
document.getElementById('rate').textContent=d.speed_mbps>0?(d.speed_mbps.toFixed(1)+' MB/s · '+fmtEta(d.eta_sec)):'';
document.getElementById('disk').textContent=d.disk_free_gb?('Disk: '+d.disk_free_gb.toFixed(1)+' GB free · needs ~'+d.disk_need_gb.toFixed(0)+' GB · '+(d.folder||'')):''
}catch(e){}setTimeout(tick,500)}tick();
</script></body></html>"""


def start_setup_server() -> int:
    port = _free_port()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a):  # silence
            pass

        def do_GET(self):
            if self.path.startswith("/status"):
                body = json.dumps(STATE).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                body = SETUP_HTML.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return port


# ---- setup steps ----------------------------------------------------------


def _run(cmd: list[str]) -> None:
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        creationflags=CREATE_NO_WINDOW,
    )
    for line in proc.stdout:  # type: ignore[union-attr]
        line = line.strip()
        if line:
            set_state(message=line[:120])
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"command failed ({proc.returncode}): {' '.join(cmd[:2])}")


def _resolve_torch_wheel() -> str:
    from urllib.parse import urljoin

    index_url = f"{TORCH_INDEX}/torch/"
    html = urllib.request.urlopen(index_url, timeout=30).read().decode()
    hrefs = re.findall(r'href="([^"]+cp312-cp312-win_amd64\.whl[^"]*)"', html)
    if not hrefs:
        raise RuntimeError("no matching torch wheel found")

    def ver(h: str) -> tuple[int, int, int]:
        m = re.search(r"torch-(\d+)\.(\d+)\.(\d+)", h)
        return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else (0, 0, 0)

    best = max(hrefs, key=ver)
    return urljoin(index_url, best)


def _download(url: str, dest: Path, base_pct: float, span_pct: float) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "MusiGen"})
    with urllib.request.urlopen(req, timeout=60) as r:
        total = int(r.headers.get("Content-Length", 0))
        done = 0
        t0 = time.time()
        with open(dest, "wb") as f:
            while True:
                chunk = r.read(1 << 20)  # 1 MiB
                if not chunk:
                    break
                f.write(chunk)
                done += len(chunk)
                dt = max(time.time() - t0, 0.001)
                speed = done / dt  # bytes/s
                pct = base_pct + (span_pct * done / total if total else 0)
                eta = (total - done) / speed if total and speed else 0
                set_state(
                    percent=round(pct, 1),
                    speed_mbps=speed / 1e6,
                    eta_sec=eta,
                    message=f"Downloading PyTorch — {done/1e9:.2f} / {total/1e9:.2f} GB",
                )


def run_setup(res: Path, home: Path) -> None:
    set_state(folder=str(home))
    # 1) disk check
    set_state(phase="checking", message="Checking free disk space…")
    free_gb = shutil.disk_usage(str(home)).free / 1e9
    set_state(disk_free_gb=free_gb)
    if free_gb < REQUIRED_GB:
        set_state(
            error=f"Only {free_gb:.1f} GB free on the MusiGen drive, but ~{REQUIRED_GB:.0f} GB "
            f"is needed to install. Free up space and reopen MusiGen. Folder: {home}"
        )
        return

    uv = res / "uv.exe"
    if not uv.exists():  # dev (non-frozen) layout
        uv = res / "installer" / "vendor" / "uv.exe"
    os.environ["UV_SYSTEM_CERTS"] = "1"
    os.environ["UV_PYTHON_PREFERENCE"] = "system"
    runtime = home / "runtime"
    py = runtime / "Scripts" / "python.exe"

    # 2) python env. --clear recreates cleanly if a partial/older runtime exists
    #    (a re-setup after a version bump would otherwise fail on the existing venv).
    set_state(phase="runtime", message="Creating the Python runtime…", percent=3)
    _run([str(uv), "venv", str(runtime), "--python", "3.12", "--clear"])

    # 3) torch — download the wheel ourselves for real speed/ETA, then install it
    set_state(phase="torch", message="Resolving PyTorch…", percent=5)
    from urllib.parse import unquote

    wheel_url = _resolve_torch_wheel()
    fname = unquote(wheel_url.split("/")[-1].split("?")[0].split("#")[0])
    wheel = home / "downloads" / fname
    if not wheel.exists():  # reuse a previously downloaded wheel on re-setup
        _download(wheel_url, wheel, base_pct=6, span_pct=64)  # 6% → 70%
    set_state(phase="torch", message="Installing PyTorch…", percent=70, speed_mbps=0, eta_sec=0)
    _run([str(uv), "pip", "install", "--python", str(py), str(wheel)])

    # 4) backend deps
    set_state(phase="deps", message="Installing MusiGen dependencies…", percent=78)
    _run([str(uv), "pip", "install", "--python", str(py),
          "-r", str(res / "backend" / "requirements.txt"), "pywebview", "hf_xet"])

    # 5) engine
    set_state(phase="engine", message="Installing the YuE2 engine…", percent=90)
    _run([str(uv), "pip", "install", "--python", str(py),
          "git+https://github.com/multimodal-art-projection/YuE.git", "--no-deps"])

    (runtime / f".ready-{RUNTIME_TAG}").write_text(RUNTIME_TAG, encoding="utf-8")
    set_state(percent=96, message="Runtime ready.")


# ---- app backend ----------------------------------------------------------

_backend: subprocess.Popen | None = None


def start_backend(res: Path, home: Path) -> str:
    global _backend
    runtime_py = home / "runtime" / "Scripts" / "python.exe"
    port = _free_port()
    env = dict(os.environ)
    env["MUSIGEN_FRONTEND_DIST"] = str(res / "frontend" / "dist")
    # Portable storage: models/, music/, data/ all inside the app folder.
    env["MUSIGEN_DATA_DIR"] = str(home / "data")
    env["MUSIGEN_HF_CACHE"] = str(home / "models")
    env["MUSIGEN_MUSIC_DIR"] = str(home / "music")
    env["MUSIGEN_APP_PORT"] = str(port)
    env["MUSIGEN_PARENT_PID"] = str(os.getpid())  # backend exits if we die
    env.setdefault("MUSIGEN_ENGINE", "yue2")
    env.setdefault("MUSIGEN_YUE2_BACKEND", "torch-eager")
    env["PYTHONPATH"] = str(res / "backend")
    _backend = subprocess.Popen(
        [str(runtime_py), str(res / "run_backend.py")],
        env=env,
        creationflags=CREATE_NO_WINDOW,
    )
    if not _tcp_ready(port):
        raise RuntimeError("backend did not start")
    return f"http://127.0.0.1:{port}"


def _terminate_backend() -> None:
    global _backend
    if _backend and _backend.poll() is None:
        try:
            _backend.terminate()
            _backend.wait(timeout=4)
        except Exception:
            pass
        if _backend.poll() is None:  # force-kill the tree
            try:
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(_backend.pid)],
                    creationflags=CREATE_NO_WINDOW,
                    timeout=5,
                )
            except Exception:
                pass


def main() -> int:
    _enable_kill_on_close()
    res = res_dir()
    home = app_dir()
    set_state(folder=str(home))
    runtime_ready = (home / "runtime" / f".ready-{RUNTIME_TAG}").exists()

    def worker():
        try:
            try:
                ensure_home(home)
            except Exception:
                set_state(
                    error=(
                        "MusiGen can't write to its own folder here:\n"
                        f"{home}\n\n"
                        "Move the MusiGen folder somewhere you can write to "
                        "(e.g. your Desktop, Documents, or another drive) and reopen it."
                    )
                )
                return
            if not runtime_ready:
                run_setup(res, home)
                if STATE["error"]:
                    return
            set_state(phase="launching", message="Starting MusiGen…", percent=98)
            url = start_backend(res, home)
            set_state(app_url=url, ready=True, percent=100, message="Ready")
        except Exception as exc:  # noqa: BLE001
            set_state(error=f"{exc}")

    threading.Thread(target=worker, daemon=True).start()

    import webview

    class _Api:
        """Native OS dialogs exposed to the web UI as window.pywebview.api.*"""

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
            """Open a URL in the user's real browser (not inside the app window)."""
            try:
                import webbrowser

                webbrowser.open(url)
                return True
            except Exception:
                return False

        def open_path(self, path: str):
            """Reveal a folder/file in Windows Explorer."""
            try:
                os.startfile(path)  # noqa: S606 - user-initiated, local path
                return True
            except Exception:
                return False

    setup_port = start_setup_server()
    print(f"[setup] http://127.0.0.1:{setup_port}/", flush=True)
    webview.create_window(
        "MusiGen",
        f"http://127.0.0.1:{setup_port}/",
        width=1440,
        height=920,
        min_size=(960, 640),
        background_color="#07080d",
        js_api=_Api(),
    )
    # Window/taskbar icon comes from the EXE icon (set in the PyInstaller spec) —
    # the WinForms window inherits the process icon. Do NOT pass icon= to
    # webview.start(): on Windows it uses System.Drawing.Icon on a .NET thread,
    # and any load hiccup there is an uncatchable crash.
    webview.start()
    # window closed → tear down backend so VRAM/RAM is released
    _terminate_backend()
    os._exit(0)


if __name__ == "__main__":
    raise SystemExit(main())
