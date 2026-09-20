"""Optional local tools, cancellable subprocesses, and bounded audio decoding."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

from .config import settings
from .engines.base import EngineCancelled

EXTENSIONS = {".wav", ".mp3", ".ogg", ".flac", ".m4a", ".aac", ".aiff", ".aif", ".opus", ".wma", ".webm", ".mid", ".midi"}
MAX_UPLOAD = 128 * 1024 * 1024
MAX_SECONDS = 330


def configuration():
    path = settings.DATA_DIR / "media-tools.json"
    raw = json.loads(path.read_text(encoding="utf-8-sig")) if path.exists() else {}
    # Relative paths are portable, relative to this configuration's directory.
    result = {}
    for key in ("sheetsage_python", "sheetsage_model", "sheetsage_parent", "alignment_python", "asr_model",
                "aligner_model", "ffmpeg", "fluidsynth", "soundfont"):
        value = os.environ.get("MUSIGEN_" + key.upper(), raw.get(key, ""))
        if value:
            candidate = Path(value)
            result[key] = str(candidate if candidate.is_absolute() else (settings.DATA_DIR / candidate).resolve())
        else:
            result[key] = shutil.which(key) if key in {"ffmpeg", "fluidsynth"} else None
    return result


def missing(config, keys):
    return [key for key in keys if not config.get(key) or not Path(config[key]).exists()]


def capabilities():
    config = configuration()
    return {"extensions": sorted(EXTENSIONS), "max_seconds": MAX_SECONDS,
            "max_upload_mb": MAX_UPLOAD // 1024**2,
            "reference_missing": reference_missing(config),
            "alignment_missing": missing(config, ["alignment_python", "asr_model", "aligner_model"]),
            "midi_missing": missing(config, ["fluidsynth", "soundfont"]),
            "ffmpeg_configured": not missing(config, ["ffmpeg"]),
            "note": "Configured paths still require a compatible runtime. See docs/MEDIA_TOOLS.md."}


def reference_missing(config):
    required = missing(config, ["sheetsage_python", "sheetsage_model"])
    model = config.get("sheetsage_model")
    path = Path(model) / "config.json" if model else None
    if path and path.is_file():
        try:
            adapter = json.loads(path.read_text(encoding="utf-8")).get("weights_format") == "adapter"
        except (OSError, ValueError):
            return required + ["valid SheetSage2 config.json"]
        if adapter:
            required += missing(config, ["sheetsage_parent"])
    return required


def run_process(command, folder, cancelled, *, timeout=1800, bounded_output=None):
    """File-backed log avoids pipe deadlocks. Reap on cancellation/timeout/error."""
    log = folder / "worker.log"
    with log.open("ab") as stream:
        process = subprocess.Popen(command, stdout=stream, stderr=stream, stdin=subprocess.DEVNULL,
            cwd=str(folder), creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        started = time.monotonic()
        try:
            while process.poll() is None:
                if cancelled():
                    raise EngineCancelled()
                if time.monotonic() - started > timeout:
                    raise TimeoutError("The media worker exceeded its time limit. Check worker.log.")
                if bounded_output and bounded_output.exists() and bounded_output.stat().st_size > MAX_UPLOAD:
                    raise ValueError("Rendered audio exceeds the size limit")
                time.sleep(.1)
            if cancelled():
                raise EngineCancelled()
            if process.returncode:
                raise RuntimeError(f"Media worker exited with code {process.returncode}. See {log}")
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()


def prepare_audio(source, folder, config, cancelled, report):
    """Normalize to bounded mono WAV; reject overlong input instead of cutting it."""
    import soundfile as sf
    if source.suffix.lower() in {".mid", ".midi"}:
        with source.open("rb") as stream:
            header = stream.read(4)
        if header != b"MThd":
            raise ValueError("Not a standard MIDI file")
        required = missing(config, ["fluidsynth", "soundfont"])
        if required:
            raise ValueError("MIDI rendering needs: " + ", ".join(required))
        report("Rendering MIDI to audio")
        rendered = folder / "midi.wav"
        run_process([config["fluidsynth"], "-ni", "-F", str(rendered), "-r", "24000",
                     config["soundfont"], str(source)], folder, cancelled, timeout=120, bounded_output=rendered)
        source = rendered
    report("Preparing reference audio")
    try:
        info = sf.info(source)
    except (RuntimeError, sf.LibsndfileError):
        if missing(config, ["ffmpeg"]):
            raise ValueError("This audio format needs FFmpeg. Configure it in media-tools.json.")
        decoded = folder / "decoded.wav"
        run_process([config["ffmpeg"], "-nostdin", "-v", "error", "-y", "-i", str(source),
            "-vn", "-t", str(MAX_SECONDS + 1), "-ac", "1", "-ar", "24000", str(decoded)],
            folder, cancelled, timeout=120)
        source, info = decoded, sf.info(decoded)
    if not 0 < info.duration <= MAX_SECONDS:
        raise ValueError(f"Reference audio must be between 0 and {MAX_SECONDS} seconds.")
    if info.channels > 16 or info.samplerate > 384000:
        raise ValueError("Unsupported channel count or sample rate")
    destination = folder / "reference.wav"
    with sf.SoundFile(source) as reader, sf.SoundFile(destination, "w", samplerate=info.samplerate,
            channels=1, subtype="PCM_16") as writer:
        for block in reader.blocks(blocksize=8192, dtype="float32", always_2d=True):
            if cancelled():
                raise EngineCancelled()
            writer.write(block.mean(axis=1))
    return destination, info.duration
