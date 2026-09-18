"""Entry the installed runtime uses to serve the MusiGen backend + UI.

Runs in its own process (spawned by the packaged launcher). PYTHONPATH points at
the bundled backend and MUSIGEN_APP_PORT selects the port. A watchdog exits the
process if the launcher (parent) dies, so the backend never lingers in the
background holding RAM/VRAM when the app window is gone.
"""
import os
import threading
import time


def _watch_parent() -> None:
    ppid = int(os.environ.get("MUSIGEN_PARENT_PID", "0"))
    if not ppid or os.name != "nt":
        return
    import ctypes

    k = ctypes.windll.kernel32
    while True:
        time.sleep(3)
        h = k.OpenProcess(0x1000, False, ppid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            os._exit(0)  # parent gone
        code = ctypes.c_ulong()
        k.GetExitCodeProcess(h, ctypes.byref(code))
        k.CloseHandle(h)
        if code.value != 259:  # STILL_ACTIVE
            os._exit(0)


if __name__ == "__main__":
    threading.Thread(target=_watch_parent, daemon=True).start()
    import uvicorn
    from app.main import app

    port = int(os.environ.get("MUSIGEN_APP_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
