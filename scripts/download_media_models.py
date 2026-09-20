"""Download optional weights only when explicitly run; never changes YuE2 files."""
import argparse
import json
from pathlib import Path

import truststore
truststore.inject_into_ssl()
from huggingface_hub import HfApi, snapshot_download

parser = argparse.ArgumentParser()
parser.add_argument("kind", choices=["alignment", "reference"])
parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parents[1] / "data/media-tools/models")
args = parser.parse_args()
repos = (["Qwen/Qwen3-ASR-0.6B", "Qwen/Qwen3-ForcedAligner-0.6B"] if args.kind == "alignment"
         else ["m-a-p/SheetSage2", "m-a-p/MERT-v2-FullSong"])
manifest = {}
for repo in repos:
    if args.kind == "reference" and repo == "m-a-p/MERT-v2-FullSong":
        adapter = json.loads((args.directory / "SheetSage2/config.json").read_text(encoding="utf-8"))
        if adapter.get("base_model_name_or_path") != repo:
            raise ValueError("SheetSage2 now requires a different parent; update the setup recipe.")
        revision = adapter["base_model_revision"]
    else:
        revision = HfApi().model_info(repo).sha
    destination = args.directory / repo.split("/")[-1]
    print(f"Downloading {repo} at {revision} to {destination}", flush=True)
    snapshot_download(repo, revision=revision, local_dir=destination,
        ignore_patterns=["*.wav", "*.mp3", "*.png", "*.jpg", "*.mp4"])
    manifest[repo] = {"revision": revision, "path": str(destination.resolve())}
args.directory.mkdir(parents=True, exist_ok=True)
(args.directory / f"{args.kind}-revisions.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
