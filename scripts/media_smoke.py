"""Opt-in real media/GPU checks; output and temporary library stay in data/."""
import argparse
import json
import os
from pathlib import Path
import struct
import sys
import time

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("kind", choices=["midi", "reference", "alignment"])
parser.add_argument("--audio", type=Path)
args = parser.parse_args()
os.environ["MUSIGEN_DATA_DIR"] = str(root / "data")
sys.path.insert(0, str(root / "backend"))
from app.media_tools import configuration, prepare_audio, run_process
import soundfile as sf

folder = root / "data/media-tools/validation" / (time.strftime("%Y%m%d-%H%M%S") + "-" + args.kind)
folder.mkdir(parents=True)
config = configuration()
started = time.monotonic()
if args.kind == "midi":
    # Standard MIDI: one 120 BPM C-major scale, no additional MIDI library.
    events = b"\x00\xff\x51\x03\x07\xa1\x20\x00\xc0\x00"
    for note in [60, 62, 64, 65, 67, 69, 71, 72]:
        events += bytes([0, 0x90, note, 100, 0x83, 0x60, 0x80, note, 0])
    events += b"\x00\xff\x2f\x00"
    source = folder / "scale.mid"
    source.write_bytes(b"MThd" + struct.pack(">IHHH", 6, 0, 1, 480) + b"MTrk" + struct.pack(">I", len(events)) + events)
else:
    if not args.audio:
        parser.error("--audio is required")
    # Copy only a short excerpt; never alter the supplied audio or song database.
    with sf.SoundFile(args.audio) as reader:
        sample = reader.read(min(len(reader), reader.samplerate * 25), dtype="float32", always_2d=True)
        source = folder / "excerpt.wav"
        sf.write(source, sample, reader.samplerate)

audio, duration = prepare_audio(source, folder, config, lambda: False, lambda message: print(message, flush=True))
report = {"kind": args.kind, "duration": duration, "audio": str(audio)}
if args.kind != "midi":
    reference = args.kind == "reference"
    output = folder / "output.json"
    request = {"kind": args.kind, "audio": str(audio), "output": str(output),
               "model": config["sheetsage_model" if reference else "asr_model"],
               "parent": config.get("sheetsage_parent"), "aligner": config.get("aligner_model")}
    request_path = folder / "request.json"
    request_path.write_text(json.dumps(request), encoding="utf-8")
    run_process([config["sheetsage_python" if reference else "alignment_python"],
                 str(root / "backend/app/media_worker.py"), str(request_path)], folder, lambda: False, timeout=600)
    raw = json.loads(output.read_text(encoding="utf-8"))
    if reference:
        assert "K:" in raw["abc"], raw
        report["abc"] = raw["abc"]
    else:
        from app.media_tasks import validate_timing
        timing = validate_timing(raw, duration)
        report.update(words=len(timing.words), text=timing.text)
report["elapsed_seconds"] = time.monotonic() - started
(folder / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2), flush=True)
print("Validation output:", folder, flush=True)
