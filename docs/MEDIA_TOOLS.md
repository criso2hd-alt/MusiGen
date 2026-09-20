# Optional media tools

The main YuE2 environment remains independent. Audio import and word timing run
in short-lived Python workers, using the same model ownership slot as music,
Qwen writing and cover art. Each worker runs offline with locally installed
weights. A configured path is not proof that its dependencies or inference work.

## Reference path

Audio/MIDI upload -> bounded mono WAV -> SheetSage2 melody-only ABC -> YuE2 with
`cot=melody`, the chosen style and lyrics. MIDI uses FluidSynth and an SF2 sound
bank before following the same audio path. This is melody-guided generation,
not source separation or a guarantee of an exact cover arrangement.

Accepted extensions: WAV, MP3, OGG, FLAC, M4A, AAC, AIFF/AIF, Opus, WMA, WebM, MID/MIDI.
Actual decoding depends on libsndfile/FFmpeg. Unsupported or malformed audio
fails explicitly. Limits are 128 MB and 330 seconds; overlong audio is rejected,
not silently trimmed. Reference provenance includes filename, SHA-256 and score.

[SheetSage2 upstream setup](https://huggingface.co/m-a-p/SheetSage2/blob/main/README.md)
specifies Python 3.10/3.11, torch/torchaudio 2.8 CUDA 12.6, transformers 4.45.2,
numpy 1.24.3 and FFmpeg 6.1 shared libraries. Keep that stack separate from YuE2.
Our worker passes an already-decoded NumPy waveform, avoiding the upstream path
decoder's shared-library dependency. FFmpeg CLI remains useful for input formats
that libsndfile cannot decode. Download both the adapter and its exact MERT parent;
point `sheetsage_model` and `sheetsage_parent` at those directories. Alternatively,
use upstream `save_pretrained` to create a self-contained model and omit the parent.
The worker runs the locally installed upstream model code with
`trust_remote_code=True`; install from the official model repository.

FluidSynth is invoked without a shell, using `-ni -F <wav> -r 24000 <sf2> <mid>`.
Choose a legally redistributable General MIDI sound bank when packaging.

## Lyric timing path

Finished audio -> Qwen3-ASR transcription -> Qwen3 ForcedAligner word timestamps.
The original requested lyrics remain intact. Recognized text and timestamp cues
are separate track fields, so omitted or repeated lyrics are not forced into the
audio. The visualizer renders a short phrase, highlights the active word and
hides it during long gaps. Seeking uses timestamps directly.
Zero-duration word cues are retained in their phrase without inventing timing;
the real singing test produced one such cue.

Use a separate Python 3.12 environment with CUDA torch/torchaudio and
`qwen-asr==0.0.6`. This brings its own dependency requirements (including
transformers 4.57.6, accelerate 1.12.0 and language tokenizers).
[Upstream instructions](https://github.com/QwenLM/Qwen3-ASR#quickstart).
The selected small models are `Qwen/Qwen3-ASR-0.6B` and
`Qwen/Qwen3-ForcedAligner-0.6B`; these are separate from the Qwen2.5 lyric writer.
Singing accuracy must be evaluated; captions are explicitly marked as recognized
lyrics. Unsupported languages, silence or invalid timestamps produce an error.

## Local configuration

Create `media-tools.json` in the app's DATA directory. Paths may be absolute or
relative to that directory. Every key may also be overridden with a `MUSIGEN_`
environment variable, for example `MUSIGEN_ALIGNMENT_PYTHON`.

```json
{
  "alignment_python": "media-tools/alignment/Scripts/python.exe",
  "asr_model": "media-tools/models/Qwen3-ASR-0.6B",
  "aligner_model": "media-tools/models/Qwen3-ForcedAligner-0.6B",
  "sheetsage_python": "media-tools/reference/Scripts/python.exe",
  "sheetsage_model": "media-tools/models/SheetSage2",
  "sheetsage_parent": "media-tools/models/MERT-v2-FullSong",
  "ffmpeg": "media-tools/bin/ffmpeg.exe",
  "fluidsynth": "media-tools/bin/fluidsynth.exe",
  "soundfont": "media-tools/soundfonts/general-midi.sf2"
}
```

Omit tools that have not been installed. Setup reports missing paths. No download
occurs merely by opening a page or clicking Generate. To explicitly download
optional weights using the project's Python:

```powershell
.venv/Scripts/python scripts/download_media_models.py alignment
.venv/Scripts/python scripts/download_media_models.py reference
```

The downloader records immutable repository revisions in a JSON manifest. For
reference extraction both downloaded model directories are needed offline.
Configuration and downloaded runtimes stay in the ignored data directory. The
existing portable EXE is not changed by development setup.

The development MIDI renderer is FluidSynth 2.6.1 with GeneralUser GS, from their
official repositories. Keep the included license files with those dependencies.
SheetSage2's model card declares CC-BY-NC-4.0; distribution and commercial use of
this optional component must respect its model license.

Development runtime setup used separate environments under `data/media-tools`:

```powershell
# Use Python 3.11 for reference; Python 3.12 for alignment.
uv venv --python 3.11 data/media-tools/reference
uv venv --python 3.12 data/media-tools/alignment
uv pip install --python data/media-tools/reference/Scripts/python.exe torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu126
uv pip install --python data/media-tools/reference/Scripts/python.exe -r data/media-tools/models/SheetSage2/requirements.txt soundfile==0.13.1
uv pip install --python data/media-tools/alignment/Scripts/python.exe torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu126
uv pip install --python data/media-tools/alignment/Scripts/python.exe qwen-asr==0.0.6 torch==2.8.0 torchaudio==2.8.0 numpy==1.26.4 librosa==0.11.0 imageio-ffmpeg
```

The repository's installer vendor directory may provide the `uv.exe` executable.
Use `--system-certs` where the machine requires its OS certificate store. Set
`UV_CACHE_DIR` and `UV_PYTHON_INSTALL_DIR` inside `data/media-tools` to keep large
downloads on the project's drive. For FFmpeg, the installed `imageio_ffmpeg`
package exposes its executable path through `get_ffmpeg_exe()`.

Explicit smoke checks (close other inference applications first):

```powershell
.venv/Scripts/python scripts/gpu_smoke.py
.venv/Scripts/python scripts/media_smoke.py midi
.venv/Scripts/python scripts/media_smoke.py reference --audio path/to/sample.wav
.venv/Scripts/python scripts/media_smoke.py alignment --audio path/to/song.flac
```

Media checks copy at most 25 seconds of source audio. Results and logs stay under
`data/media-tools/validation`; they never write to the supplied song library.

## Lifecycle and validation

Media tasks persist under `data/media-tasks/<id>`. Worker logs and uploaded audio
stay local. Cancellation terminates and reaps the subprocess before releasing
the model slot. Restarted incomplete tasks show an interruption error and can be
submitted again; they do not silently run on startup. Checkpoints and media-task
retention cleanup remain required before distribution.

Automated tests cover real subprocess IPC with test models, ABC propagation,
provenance, concurrent track rename/deletion, invalid timestamps, upload limits,
overlong audio, cancellation/timeouts, caption gaps and seeking. These verify the
integration, not model accuracy. See IMPLEMENTATION.md for actual-machine results.

## In-app setup (preview 5)

Setup now offers Find existing tools / repair paths, Install / repair reference
 tools, and Install / repair lyric timing. Status is polled and failures expose
an actionable log path; cancellation reaps dependency subprocesses. A model file
already downloading may finish before cancellation is observed. No installation
starts merely by opening Setup. Full fresh installation requires internet and
several GB; the reuse/repair route was tested on this PC without downloading again.

The installer uses the app-bundled uv and pinned revisions in media_install.py.
It places runtimes, Python distributions, UV cache, weights and MIDI tools inside
DATA/media-tools. Relative configuration paths are preferred for files inside
DATA. Existing valid custom paths are preserved. Repair searches configuration
files at the app's nearby ancestor data locations, helping users who moved only
an executable. It does not copy or delete existing music/models.

Microphone recordings use browser permissions and the device selected in Setup.
The user starts/stops recording, previews it, then explicitly uses it as a
reference. WebM/Opus goes through the same bounded FFmpeg normalization as imports.
No live microphone was captured during automated checks. SheetSage2 and vocal
arrangement accuracy on hummed or sung references still depend on model behavior.
