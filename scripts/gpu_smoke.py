"""Explicit small GPU smoke test. Uses existing weights and isolated output data."""
import argparse
import json
import os
from pathlib import Path
import sys
import threading
import time

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--duration", type=int, default=15)
parser.add_argument("--lyrics", type=Path)
parser.add_argument("--abc", type=Path, help="Validate supplied-score melody generation")
parser.add_argument("--interleave-writer", action="store_true", help="Unload music for Qwen while paused, then resume")
parser.add_argument("--resume-folder", type=Path, help="Resume a previous smoke run with the same inputs")
args = parser.parse_args()
if not 15 <= args.duration <= 330:
    parser.error("duration must be between 15 and 330 seconds")
os.environ.setdefault("MUSIGEN_DATA_DIR", str(root / "data/gpu-validation"))
os.environ.setdefault("MUSIGEN_HF_CACHE", str(root / "installer/dist/models"))
os.environ.setdefault("MUSIGEN_LLM_MODEL", "Qwen/Qwen2.5-3B-Instruct")
sys.path.insert(0, str(root / "backend"))
from app.config import settings
from app.engines import build_engine
from app.engines.base import EnginePaused, EngineRequest
from app.gpu import ModelBusy
from app import llm

folder = args.resume_folder or settings.DATA_DIR / time.strftime("%Y%m%d-%H%M%S")
folder.mkdir(parents=True, exist_ok=True)
engine = build_engine("yue2")
pause = threading.Event()
busy_check = []
last_stage = None
started = time.monotonic()

def progress(event):
    global last_stage
    interval = 8 if event.stage == "synthesizing" else 100
    if event.stage != last_stage or event.completed is not None and event.completed % interval == 0:
        print(event.stage, event.message, flush=True)
        last_stage = event.stage
    if event.stage == "generating" and not busy_check:
        def check():
            try:
                llm.generate("test", "test", 1)
                busy_check.append(False)
            except ModelBusy:
                busy_check.append(True)
        thread = threading.Thread(target=check)
        thread.start()
        thread.join(3)
        pause.set()

request = EngineRequest(style="gentle acoustic folk, soft vocal", lyrics=args.lyrics.read_text(encoding="utf-8") if args.lyrics else "[verse]\nMorning light, bring me home",
    out_path=folder / "sample.flac", cot="melody" if args.abc else "off",
    abc=args.abc.read_text(encoding="utf-8") if args.abc else None,
    max_duration=args.duration, seed=832005,
    memory_mode="low", checkpoint_dir=folder / "checkpoint", is_pause_requested=pause.is_set)
report = {"busy_check": busy_check}
try:
    try:
        engine.generate(request, progress, lambda: False)
        raise AssertionError("Expected a saved-stage pause")
    except EnginePaused:
        report["paused"] = (request.checkpoint_dir / "semantic.json").exists()
        print("Paused with saved semantic stage", flush=True)
    if args.interleave_writer:
        report["interleaved_prompt"] = llm.generate("Write a short music description.", "Gentle piano", 24, .8)
        if not report["interleaved_prompt"] or engine._pipe is not None:
            raise AssertionError("Qwen must run and unload music while the song is paused")
    pause.clear()
    result = engine.generate(request, progress, lambda: False)
    report.update(duration=result.duration, metadata=result.meta, audio=str(result.audio_path))
    print("Resumed and decoded", result.duration, flush=True)
    prompt = llm.generate("Write one short music style description. No preamble.", "Tags: synthwave, dreamy, gritty", 64, .8)
    report["writer_prompt"] = prompt
    report["music_unloaded_for_writer"] = engine._pipe is None
    if not prompt or busy_check != [True] or not report["paused"]:
        raise AssertionError("GPU smoke checks failed")
finally:
    report["elapsed_seconds"] = time.monotonic() - started
    (folder / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    engine.close()
    llm.unload()
print("GPU smoke passed:", folder, flush=True)
