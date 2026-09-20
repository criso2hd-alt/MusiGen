"""Explicit optional-tool setup. Keeps downloads and runtimes beside app data."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time
import urllib.request
import zipfile

from .config import settings
from .media_tools import configuration, capabilities, run_process
from .checkpoints import write_json

REVISIONS = {
    "m-a-p/SheetSage2": "80af707174fc7ee521c25925d5f014729f0e61ae",
    "m-a-p/MERT-v2-FullSong": "d8ba1c745e733b3908ce6ad16ebeb17ac7600a42",
    "Qwen/Qwen3-ASR-0.6B": "5eb144179a02acc5e5ba31e748d22b0cf3e303b0",
    "Qwen/Qwen3-ForcedAligner-0.6B": "c7cbfc2048c462b0d63a45797104fc9db3ad62b7",
}


def save_config(values):
    path = settings.DATA_DIR / "media-tools.json"
    raw = json.loads(path.read_text(encoding="utf-8-sig")) if path.exists() else {}
    for key, value in values.items():
        if not value:
            continue
        candidate = Path(value).resolve()
        try:
            raw[key] = str(candidate.relative_to(settings.DATA_DIR.resolve()))
        except ValueError:
            raw[key] = str(candidate)
    write_json(path, raw)


def repair():
    """Recover existing installations after moving just the executable."""
    current = configuration()
    candidates = [settings.DATA_DIR / "media-tools.json"]
    candidates += [parent / "data" / "media-tools.json" for parent in list(settings.DATA_DIR.parents)[:4]]
    recovered = {}
    for path in dict.fromkeys(candidates):
        if not path.is_file():
            continue
        try:
            raw = json.loads(path.read_text(encoding="utf-8-sig"))
        except (ValueError, OSError):
            continue
        for key in current:
            if current.get(key) and Path(current[key]).exists():
                continue
            value = raw.get(key)
            if not isinstance(value, str) or not value:
                continue
            candidate = Path(value)
            candidate = candidate if candidate.is_absolute() else path.parent / candidate
            if candidate.exists():
                recovered[key] = str(candidate.resolve())
                current[key] = recovered[key]
    save_config(recovered)
    return capabilities()


class MediaInstaller:
    def __init__(self):
        self.lock = threading.RLock()
        self.cancelled = threading.Event()
        self.worker = None
        self.state = {"status": "idle", "message": "", "kind": None, "started_at": None}

    def status(self):
        with self.lock:
            return dict(self.state)

    def report(self, message, **fields):
        with self.lock:
            self.state.update(message=message, **fields)

    def start(self, kind):
        if kind not in {"reference", "alignment"}:
            raise ValueError("Unknown optional tool")
        with self.lock:
            if self.state["status"] == "installing":
                raise ValueError("An optional tool installation is already running")
            self.cancelled.clear()
            self.state = {"status": "installing", "message": "Finding installed tools", "kind": kind, "started_at": time.time()}
            self.worker = threading.Thread(target=self._run, args=(kind,), daemon=True)
            self.worker.start()
            return dict(self.state)

    def cancel(self):
        self.cancelled.set()
        if self.status()["status"] == "installing":
            self.report("Cancelling setup; the current model file download may finish first.")

    def stop(self):
        self.cancel()
        if self.worker:
            self.worker.join(timeout=3)

    def check(self):
        if self.cancelled.is_set():
            raise InterruptedError("Installation cancelled. Downloaded files can be reused on retry.")

    def download(self, url, destination):
        self.check()
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".part")
        request = urllib.request.Request(url, headers={"User-Agent": "MusiGen optional-tools"})
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as stream:
            while block := response.read(1024 * 1024):
                self.check()
                stream.write(block)
        temporary.replace(destination)

    def _run(self, kind):
        folder = settings.DATA_DIR / "media-tools"
        folder.mkdir(parents=True, exist_ok=True)
        try:
            tools = repair()
            missing = tools["reference_missing"] + tools["midi_missing"] if kind == "reference" else tools["alignment_missing"]
            if not missing and tools["ffmpeg_configured"]:
                self.report("Existing tools connected — ready", status="done")
                return
            uv = next((p for p in [settings.REPO_ROOT / "uv.exe", settings.REPO_ROOT / "installer/vendor/uv.exe"] if p.is_file()), None)
            uv = str(uv) if uv else shutil.which("uv")
            if not uv:
                raise RuntimeError("uv installer is missing. Run the packaged MusiGen application to install optional tools.")
            # These environment variables affect only child installation commands.
            env = dict(os.environ, UV_CACHE_DIR=str(folder / "uv-cache"), UV_PYTHON_INSTALL_DIR=str(folder / "python"))
            def command(args):
                self.check()
                # Explicit child environment; never mutate the live music runtime.
                log = folder / "install.log"
                with log.open("ab") as stream:
                    child = subprocess.Popen([uv, "--system-certs", *args], env=env, stdout=stream, stderr=stream,
                        stdin=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                    try:
                        started = time.monotonic()
                        while child.poll() is None:
                            self.check()
                            if time.monotonic() - started > 7200:
                                raise TimeoutError("Setup timed out. Retry to reuse downloaded packages.")
                            time.sleep(.2)
                        if child.returncode:
                            raise RuntimeError(f"Dependency setup failed. Details: {log}")
                    finally:
                        if child.poll() is None:
                            child.kill()
                        child.wait()
            config = configuration()
            runtime = folder / kind
            python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
            self.report("Preparing the isolated Python runtime")
            if not python.exists():
                command(["venv", "--python", "3.11" if kind == "reference" else "3.12", str(runtime)])
            self.report("Installing CUDA audio dependencies — this may download several GB")
            command(["pip", "install", "--python", str(python), "torch==2.8.0", "torchaudio==2.8.0", "--index-url", "https://download.pytorch.org/whl/cu126"])
            from huggingface_hub import HfApi, hf_hub_download
            repos = list(REVISIONS)[:2] if kind == "reference" else list(REVISIONS)[2:]
            for repo in repos:
                self.check()
                destination = folder / "models" / repo.split("/")[-1]
                files = HfApi().list_repo_files(repo, revision=REVISIONS[repo])
                files = [name for name in files if not name.lower().endswith((".wav", ".mp3", ".png", ".jpg", ".mp4"))]
                for i, name in enumerate(files):
                    self.check()
                    self.report(f"Downloading {repo.split('/')[-1]} · file {i+1}/{len(files)} · {name}")
                    hf_hub_download(repo, name, revision=REVISIONS[repo], local_dir=destination)
            self.report("Finishing audio tools and checking dependencies")
            if kind == "reference":
                command(["pip", "install", "--python", str(python), "-r", str(folder / "models/SheetSage2/requirements.txt"), "soundfile==0.13.1", "imageio-ffmpeg==0.6.0"])
                config.update(sheetsage_python=str(python), sheetsage_model=str(folder / "models/SheetSage2"), sheetsage_parent=str(folder / "models/MERT-v2-FullSong"))
                if not config.get("fluidsynth") or not Path(config["fluidsynth"]).exists():
                    self.report("Downloading the MIDI renderer")
                    archive = folder / "fluidsynth.zip"
                    self.download("https://github.com/FluidSynth/fluidsynth/releases/download/v2.6.1/fluidsynth-v2.6.1-win10-x64-cpp11.zip", archive)
                    target = folder / "bin"
                    with zipfile.ZipFile(archive) as bundle:
                        for member in bundle.infolist():
                            if not (target / member.filename).resolve().is_relative_to(target.resolve()):
                                raise ValueError("Invalid MIDI renderer archive")
                        bundle.extractall(target)
                    config["fluidsynth"] = str(next(target.rglob("fluidsynth.exe")))
                if not config.get("soundfont") or not Path(config["soundfont"]).exists():
                    self.report("Downloading the General MIDI sound bank")
                    # Pin the official repository snapshot, including its license.
                    for name in ["GeneralUser-GS.sf2", "documentation/LICENSE.txt"]:
                        target = folder / "soundfonts" / Path(name).name
                        self.download("https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/684543d5e5efaef08d02be50dcda8d552478fa60/" + name, target)
                    config["soundfont"] = str(folder / "soundfonts/GeneralUser-GS.sf2")
                validation = "import torch, torchaudio, transformers, soundfile; assert transformers.__version__ == '4.45.2'"
            else:
                command(["pip", "install", "--python", str(python), "qwen-asr==0.0.6", "torch==2.8.0", "torchaudio==2.8.0", "numpy==1.26.4", "librosa==0.11.0", "imageio-ffmpeg==0.6.0"])
                config.update(alignment_python=str(python), asr_model=str(folder / "models/Qwen3-ASR-0.6B"), aligner_model=str(folder / "models/Qwen3-ForcedAligner-0.6B"))
                validation = "import torch, torchaudio, qwen_asr, soundfile"
            run_process([str(python), "-c", validation], folder, self.cancelled.is_set, timeout=120)
            self.check()
            flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
            config["ffmpeg"] = subprocess.check_output([str(python), "-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], text=True, creationflags=flags, timeout=60).strip()
            save_config(config)
            write_json(folder / (kind + "-revisions.json"), {repo: REVISIONS[repo] for repo in repos})
            self.report("Tools installed — ready", status="done")
        except Exception as exc:
            self.report(str(exc), status="cancelled" if self.cancelled.is_set() else "error")


media_installer = MediaInstaller()
