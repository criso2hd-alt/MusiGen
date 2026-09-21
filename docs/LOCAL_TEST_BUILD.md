# Working app: installer/dist

The only active app location is `installer/dist/MusiGen.exe`. Do not create new
preview folders or numbered executables. Do not replace the executable while the
user is using it; notify the user and wait for it to close. Preserve models,
runtime, data and music. GitHub push/release still requires user approval.

## v0.0.2 (built in installer/dist/MusiGen.exe)

- Queue is a disclosure beneath Generate inside Mixer, with live active/queued/
  paused/error counts. The separate Queue panel and old layout are retired.
- Mixer uses a full-height default column, a measured minimum for core controls,
  and independent supplementary scrolling. Removed the fixed maximum-height lock.
- Removed duplicate fullscreen icon; the labeled visualizer button remains.
- Ingredient search has a clear/focus button. Mixer Pair and Shake up use local,
  curated suggestions around a selectable anchor; Shake up retains genre pills
  and the anchor and preserves changed pills' intensity values.
- Optional media tools have repair/download/cancel controls. Existing validated
  paths were reconnected in installer/dist/data/media-tools.json. Fresh installs
  use isolated runtimes and pinned model revisions under that app's data folder.
- Setup selects a microphone; Create can record, stop, preview and import it.
  Recording defaults to 60 seconds, with choices up to 330, and releases input
  tracks on stop or leaving the page. Real microphone permission/recording has
  not been exercised by the agent; synthetic WebM input decoded successfully.
- Explicit BPM retimes supplied ABC without dropping its melody or rests.
- Stub remains unchanged pending clarification of the user's contradictory phrase.

Build/TypeScript, automated backend/frontend tests, and browser checks were run.
The repair/reuse branch works against existing installed tools; a full fresh
multi-GB tool download and live microphone recording are still acceptance checks.
No additional GPU generation was needed for this UI/setup change.

- App and Windows executable version: 0.0.2.
- Permanent GitHub and Buy Me a Coffee links finish the Setup page.


## Experimental vinyl-store build (codex/vinyl-store-3d)

The same v0.0.2 executable now includes the embedded Blender-authored Neon Boutique,
animated sleeve inspection, sliding turntable, vinyl extraction and playback-synced
spinning/tonearm movement. It also includes the playlist playback scope correction.
See STORE_3D.md for controls, the asset pipeline and validation limits. The store and studio improvements are included in the v0.0.2 source update.
Native mouse capture still needs acceptance testing; packaged releases are listed
on GitHub separately.
