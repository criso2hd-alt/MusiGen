"""Isolated optional inference entry point. Run with the tool's own Python.

Only standard-library imports before main; never import the host app here.
Models must already be installed locally. No implicit network downloads.
"""
import json
import os
from pathlib import Path
import sys


def main():
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    request = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("This optional worker requires CUDA; no silent CPU fallback.")
    if request["kind"] == "reference":
        import soundfile as sf
        from transformers import AutoModel
        options = {"base_model_path": request["parent"]} if request.get("parent") else {}
        model = AutoModel.from_pretrained(request["model"], trust_remote_code=True,
                                          local_files_only=True, **options).eval().to("cuda")
        waveform, rate = sf.read(request["audio"], dtype="float32")
        result = model.transcribe(waveform, sampling_rate=rate, melody_only=True)
        output = {"abc": result["abc"], "model": "SheetSage2"}
    else:
        from qwen_asr import Qwen3ASRModel
        model = Qwen3ASRModel.from_pretrained(
            request["model"], dtype=torch.bfloat16, device_map="cuda:0",
            max_inference_batch_size=1, max_new_tokens=4096,
            forced_aligner=request["aligner"],
            forced_aligner_kwargs={"dtype": torch.bfloat16, "device_map": "cuda:0"})
        result = model.transcribe(audio=request["audio"], language=None,
                                  return_time_stamps=True)[0]
        output = {"text": result.text, "language": result.language,
                  "source": "qwen3-asr", "words": [
                      {"text": word.text, "start": float(word.start_time),
                       "end": float(word.end_time)} for word in (result.time_stamps.items if result.time_stamps else [])]}
    destination = Path(request["output"])
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False), encoding="utf-8")
    temporary.replace(destination)


if __name__ == "__main__":
    main()
