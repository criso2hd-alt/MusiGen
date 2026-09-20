# MusiGen improvement brief

Agreed scope, September 2026. Preserve the local, portable studio and existing
mixer behavior. Deliver in tested batches; do not treat research findings as
validated runtime behavior. Existing songs must remain readable.

## 1. Generation reliability and provenance
- Reconcile pills and additional words; submit the current recipe even immediately after editing.
- Prevent stale prompt responses from overwriting newer edits or restored recipes.
- Explain AI Write failures and GPU contention instead of silently showing the original tags.
- Audit shared GPU ownership across music, Qwen and cover generation.
- Label the optional song title; derive a short title from lyrics/style when blank.
- Save pills, extra instructions, final prompt, seed, planning mode, duration,
  sampling, engine, supplied/generated score and truncation information.
- Distinguish restoring the original recipe from remixing with a new seed.
- Include seed/recipe metadata in FLAC exports; missing legacy settings stay unknown.

## 2. Queue and duration
- Permanent GPU name, used/free VRAM, CPU and RAM dashboard with readable meters.
- Per-job elapsed time, meaningful stage progress and waiting/error states.
- Surface synthesis step activity; avoid implying that a heartbeat proves progress.
- Investigate memory pressure and low-memory options on the installed RTX 4080.
- Investigate stage checkpoints for pausing, generating another song, and resuming.
- Research/test longer songs; the current 240-second slider is an app limit.
- Make lyric writing duration-aware; estimate fit from lyrics and pacing.
- Inline truncation warnings and optional fit-to-duration behavior; preserve user edits.
- Investigate tempo/BPM guidance without pretending estimates guarantee exact duration.
- Fix the lyrics text field itself: manual enlargement and growing with the dock
  panel must work. This is separate from font size and visualizer lyric appearance.

## 3. Ingredients and library
- Seamlessly wrap the orbit pill browser; retain sorting/view modes.
- Search, adjustable text size, substantially expanded catalog.
- Later: per-pill visibility settings.
- Compact and full library views, individually expandable cards and expand all.
- Display the real recipe, seed, pills, extra instructions and final prompt.
- Record-store browsing mode using sleeves/shelves, not a 3D world.
- Discoverable cover-art actions; clearer track buttons and themed playlist chooser.

## 4. Visualizer and onboarding
- Prominent full-screen visualizer action beside Save.
- Start with pinned preset, otherwise last-used preset; auto-cycle starts off.
- Arrow icons for visualizer navigation, distinct from song transport.
- Distinguish one-shot random selection from continuous cycling.
- Lyrics size/appearance controls, contrast protection and less dense presentation.
- Animated, skippable, replayable spotlight tour modeled on DLSS5 IMAGE Converter.

## 5. Reference music and timed lyrics
- One import control for WAV, MP3, OGG, FLAC, supported additional audio formats and MIDI.
- Automatically render MIDI to WAV using an appropriate sound bank, then reuse
  the audio-reference path. Show conversion/preparation feedback.
- YuE2's documented cover path uses an extracted score (e.g. SheetSage2); assess
  dependencies, fidelity and practical installation before integrating.
- Optional local post-generation lyric alignment, persisted per song.
- Evaluate alignment on singing, repeated/skipped words and instrumental sections.
- Word highlighting, phrase transitions and optional caption effects, timing corrections.

## Verified starting findings
- Installed inference package: yue2-infer 0.1.6; weights in installer/dist/models.
- Synthesis is displayed at a fixed 68%, followed by decoding at 90%.
- Qwen loading can wait on the music engine lock; text failures silently fall back.
- Prompt preview uses asynchronous debounced requests; submission trusts the preview.
- Remix currently changes the seed and does not restore all generation settings.
- YuE2 exposes separate stages and plan persistence, not arbitrary pause/resume.
- No smaller official YuE2 generation model was found. Experimental FP8 affects AR
  layers only and restores BF16 for synthesis; benchmark before offering promises.
- Lyrics currently scroll by playback fraction, not vocal timestamps.

## Validation
Use isolated temporary data and stub generation for regression tests. Run the
frontend build/lint. GPU quality, performance, packaging and visual interactions
need separate validation; do not interrupt an existing song generation to test.

## Effort sequence (user preference)
Work in dependency order within each group. Report a completed group before the
user switches effort. Keep checks focused to conserve usage; no repeated research
or broad refactors without a concrete need. Effort changes are made by the user.

1. HIGH: prompt/recipe consistency, shared GPU ownership, queue instrumentation,
   synthesis progress, duration/truncation semantics and lyric fit; then assess and
   integrate resumable stages, reference import and local lyric alignment. New
   inference dependencies require isolated validation before packaging.
2. MEDIUM: ingredients search/size/wrapping/catalog, usable resizable lyrics editor,
   library layouts/details/playlist controls, visualizer state and lyric appearance,
   spotlight tutorial and wiring the validated import/alignment workflows into UI.
3. LOW: labels, icons, spacing/contrast polish, documentation and release checklist.

### First implementation batch (not yet packaged)
- Immediate pill + extra-word composition and stale AI response protection.
- Shared model-operation lock and explicit contention response; log text failures.
- New tracks retain options, extra words, supplied score and generation metadata.
- FLAC exports include seed and recipe; older missing metadata remains unknown.
- Separate original-seed recipe restoration from new-seed remix.
- Basic expandable song details and labeled title field; local title suggestion.
- Frontend build passed; GPU-free regression tests added. The installed EXE has
  not been rebuilt or replaced.

### High foundations implemented (source checkout only)
- One reentrant ownership lock for in-process YuE2, Qwen and cover operations;
  busy requests fail promptly instead of waiting behind an active song. Qwen
  selection also stays off the API event loop. This does not coordinate other
  running app processes or an independent Ollama server.
- Cached CPU/RAM and NVIDIA GPU/VRAM samples every three seconds, with explicit
  unavailable/stale states. Monitoring does not load torch. High VRAM usage is
  not presented as proof that Windows shared GPU memory is in use.
- Elapsed active time, time since last progress, token counts, synthesis steps
  submitted and decode chunks. Submitting the last step is not GPU completion.
- Job journals and pause/resume at completed plan, semantic and latent boundaries.
  Intermediate data stays local. Restarted unfinished jobs wait for explicit
  resume. Changed request/weights/runtime invalidate a checkpoint. Checkpoint
  files are currently retained, including terminal jobs; retention cleanup is
  still needed before packaging.
- Lyrics writer receives a duration/tempo/word budget. Heuristic fit estimates
  offer an explicit duration adjustment without overwriting edited lyrics. These
  estimates are not forced alignment or a guarantee of the song's ending.
- Duration budget up to 330 seconds and optional AR offloading exposed as
  experimental. YuE2 can finish early or reach its token ceiling. Actual GPU
  validation results are recorded below; offloading savings need a comparative
  benchmark before promising a particular VRAM reduction.
- Recipe restoration keeps original options, supplied score, seed, engine,
  lyrics/section order, pills and extra instructions. Derived BPM guidance is
  recorded separately in the resolved prompt to avoid accumulating old tempos.

Validation: 19 GPU-free Python regressions passed, including installed YuE2
plan serialization with a fake inference pipeline, stage resume, cancellation,
restart journals, busy model selection, lyric estimates and FLAC metadata.
Browser QA with a separate temporary library verified pill + extra composition,
stub generation, details/seed restoration, AI failure feedback, resource meters,
and lyric warning -> duration adjustment. Frontend build and lint pass with
existing unrelated warnings. Installer packaging remains unvalidated. The user
authorized closing the idle installed app for isolated GPU tests; saved songs and
the installed executable were not modified.

### Optional media integration (source checkout)
- One audio/MIDI import control, bounded decoding and mono normalization.
  FluidSynth renders MIDI, SheetSage2 extracts melody ABC, and the resulting
  reference is persisted with its provenance and supplied to YuE2 Melody planning.
- Separate Python environments for SheetSage2 and Qwen3-ASR/ForcedAligner preserve
  the main music runtime. Workers run offline and share the app's model slot;
  native models are unloaded before external inference. No silent CPU fallback.
- Persistent task status, cancellation/reaping, explicit restart errors, upload
  limits, missing-tool feedback and local worker logs. Setup currently reports
  local configuration; an automatic portable optional-tool installer is not built.
- Library action to analyze sung words and store their timestamps separately from
  requested lyrics. The expanded visualizer shows readable short phrases with
  active-word highlighting, including correct seeking and instrumental gaps.
  Recognition can be imperfect; manual timing correction and appearance controls
  are still future UI work.
- Python regressions exercise actual worker subprocess IPC using test models,
  upload errors, ABC handoff, cancellation, timestamp validation, and concurrent
  track rename/deletion. Frontend caption tests cover gaps, backward seeks and
  coincident word timestamps without dropping recognized words.
- Browser QA verified phrase highlighting at a controlled playback timestamp and
  missing-tool feedback in a separate temporary library.

### Actual-machine checks
- RTX 4080, native YuE2 and existing Qwen2.5-3B weights: saved semantic-stage pause,
  resume, 16.20-second FLAC, prompt request rejected promptly while music runs,
  and successful prose prompt after releasing music. Full check: 93.22 seconds.
  Report: `data/gpu-validation/20260919-233416/report.json`.
- Tested native runtime: yue2-infer 0.1.6, upstream commit
  `0edaf2f4053ef4731334b8329834b107977f9637`. The bounded-synthesis adapter uses
  this runtime's loading and validation interfaces. Pin and retest that dependency
  when packaging; the existing installer still installs the upstream Git branch.
- Both optional environments import and detect CUDA. Dependency compatibility
  checks pass. Official model revisions are recorded under
  `data/media-tools/models/*-revisions.json`.
- Real FluidSynth 2.6.1 + GeneralUser GS: eight-note MIDI rendered to nonzero WAV
  in 0.30 seconds. Short MP3, OGG, FLAC, M4A, AAC, AIFF, Opus and WMA samples all
  decoded successfully using libsndfile/FFmpeg.
- SheetSage2 on the MIDI-rendered scale: exact C D E F G A B C melody recovered
  in 13.13 seconds using the offline CUDA worker.
- Qwen3-ASR/ForcedAligner on a 25-second copy of Battle Cry: recognized the first
  sung line and returned nine word timestamps. One word has a zero-duration cue;
  it stays in the displayed phrase without an invented highlight interval.
  This single sample is a functional check, not a broad singing-accuracy score.
- Long-song synthesis reproduced memory pressure: about 15 GB dedicated and
  4 GB shared GPU memory, with no synthesis step progress. The saved semantic
  stage was retained and the test process stopped. Windows synthesis now uses
  the native query-block option (256 queries) while keeping all keys/values,
  original song chunks, noise and context. A CPU numerical comparison passes
  for causal and noncausal grouped-query attention. The resumed run sampled
  around 6 GB dedicated and 80 MB shared. It completed a 274.96-second FLAC with
  `truncated=false` from a 330-second requested budget. Composition took 873.83
  seconds; resuming through synthesis, decoding and Qwen verification took
  352.92 seconds. This is one measured case, not a guaranteed duration or speed.
  Report: `data/gpu-validation/20260919-234402/report.json`.
- End-to-end MIDI reference: the extracted scale was accepted as supplied ABC
  in YuE2 Melody planning and produced a 9.68-second FLAC. While paused, Qwen
  unloaded the music model and wrote a prompt; the saved song then resumed after
  model reload. Report: `data/gpu-validation/20260920-000956/report.json`.

High implementation and targeted GPU validation are complete in the development
checkout. Next effort: **Medium**. Remaining release work includes installer
dependency pinning, optional-tool installation UX, packaged-app validation and
checkpoint/upload retention. Full-song transcription accuracy and visual/audio
quality need broader user testing; the functional checks are not quality scores.

Runtime configuration and setup details: [MEDIA_TOOLS.md](MEDIA_TOOLS.md).

## Medium batch completed — September 20

- Ingredient catalog expanded from 274 to 708 labels, with search, saved text
  size and per-ingredient visibility. Orbit view repeats its tile in both axes,
  respects the active sort/filter and keeps a finite number of rendered pills.
- Lyrics editor grows with its dock and supports vertical dragging; browser QA
  measured a manual change from 180 to 257 pixels. The fit controls stay below
  the editor in the scrollable panel.
- Compact, Full and Record store library layouts; individually expanded details
  and Expand all/Collapse all. Persistent layout preference, shelf styling,
  random record selection, labeled actions and a themed playlist chooser.
- Prominent full-screen visualizer action. Preset restoration prefers the pinned
  name, then last-used name, with migration from legacy numeric indices.
  Auto-cycle starts off on opening; arrows and labeled Random/Auto controls
  distinguish visual selection from song transport. Native visualizer fullscreen
  includes captions, and the hidden player does not run another Milkdrop instance.
- Saved lyric text size, backdrop opacity, position and phrase/all-text display.
  Actual word cues retain highlighting; timing without analysis stays explicitly
  approximate. Tracks with only empty section tags show the no-lyrics state.
- Skippable, replayable nine-step spotlight tour inspired by the DLSS5 app's
  onboarding interaction, implemented for React. It reveals target panels and
  restores the user's previous page when dismissed.
- Resource meters use the app palette instead of native browser progress styling.

Validation: production frontend build passed; 19 backend regressions and six
frontend caption/preset tests passed. Lint reports six pre-existing warnings and
no errors. Catalog labels have no case-insensitive duplicates within categories.
Browser QA used a temporary six-track library: tour progression/replay, ingredient
search/hiding/size persistence, orbit tiling, manual textarea resizing, all three
library layouts, expand-all, playlist addition, pinned and last preset restoration,
auto-cycle reset, and word highlighting with appearance changes were checked.

Next effort: **Low** for final UI polish and release preparation. These changes
are in the development checkout and built frontend, not the installed executable.
The release work listed above remains, including packaged-app validation and
portable optional-tool installation. Manual lyric timing correction and additional
caption effects are later enhancements; recognition quality still needs broader
listening tests.

## Local preview build completed — September 20

- Built `installer/dist/test-build/MusiGen.exe`, version `0.1.0-preview.1`.
  It uses a copied 12-track library/music/cover collection. Runtime and model
  junctions reuse the validated local dependencies; optional media tools are
  configured for this PC. The original EXE and library remain unchanged.
- Pinned YuE to tested commit `0edaf2f4053ef4731334b8329834b107977f9637` and CUDA
  torch 2.11.0. Installer upgrades reuse the environment; incomplete wheel
  downloads cannot masquerade as a completed cached wheel.
- Removed machine-specific absolute paths from the PyInstaller spec and excluded
  backend tests/bytecode. Added a backend log for packaged startup diagnostics.
- Fixed native preference persistence: pywebview's default private mode discarded
  local storage, and random backend ports changed its origin. The launcher now
  uses a persistent profile and saved port per app folder. A busy saved port
  produces an explicit error instead of silently changing the preference origin.
- Alphabetical ingredient sorting now shows the corresponding up/down icon.
- Production build, 19 backend tests, six frontend tests and four installer tests
  pass. Packaged startup, bundled asset/source inventory, model detection and
  optional-tool paths were checked. GPU inference was validated in the earlier
  high batch; the packaged build does not constitute clean-machine install QA.

User acceptance is next: [local test checklist](LOCAL_TEST_BUILD.md). No GitHub
push or release has been performed. Public redistribution still needs the release
work and optional-component packaging described above.
