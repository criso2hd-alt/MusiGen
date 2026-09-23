# Neon Boutique experiment

Branch: `codex/vinyl-store-3d`. Library > Record store opens an embedded WebGL room; no separate window or remote service is needed.

## Interaction

- WASD walks; Shift toggles mouse capture; Escape releases it.
- A center ring fades in when a record or the counter screen is actionable.
- Click / F lifts a sleeve out of its bin. Drag or move the captured mouse to rotate; Flip sleeve reveals saved track details. Click / F returns it.
- Right click / Space / Play record starts the existing MusiGen audio player. A deck slides in, the disc leaves the sleeve and settles onto its platter, and the tonearm swings into place. Rotation is 33 1/3 RPM and follows actual playback; pause or a different track stops it.
- Browsers that deny pointer capture offer Browse without capture: drag to look and use WASD while the canvas is focused.
- Playlist selection controls the displayed collection and the existing playback queue. More than 36 records are split into additional crates/pages.

## Asset pipeline

`assets/store/neon-boutique.blend` is the editable, user-optimized Blender source. Use `assets/store/bake_edited.py` to bake/export that file without overwriting it. **Do not run `build_store.py` on the edited source**: it is the original scene generator and would replace the user's changes. The GLB is bundled by Vite and the regular installer spec. Blender is an authoring dependency only, not required on users' computers.

The room uses baked illumination and a single static mesh plus emissive fixtures. Album art, sleeves, the animated inspection deck and the music-responsive counter display remain interactive Three.js objects. Artwork and music stay local. Original concept images are under `docs/store-concepts`.

## Resource behavior

The room is lazy-loaded, capped at 45 FPS (Balanced) or 30 FPS (Low), and stops rendering in hidden tabs. It disposes its renderer, geometry, materials and textures when leaving the store. Heavy job stages or active AI model operations unmount the room and explain the GPU conflict. Status failures fail closed. Paused or merely queued jobs do not block entry. Exiting inspection leaves normal music playback running.

## Validation and limits

TypeScript/Vite build and the 25 frontend tests pass, including collision bounds, generation guards and playlist scope. Browser checks exercised real local cover/audio loading, sleeve selection, playback progress, turntable presentation, spin-on/play and stop-on/pause state, sleeve return, and simulated busy-state unloading. Pointer capture is denied by the Codex browser; native WebView2 capture still needs user acceptance testing in the EXE. This is an experimental first art pass, not a final visual-quality sign-off.

Three.js and its GLTFLoader use the MIT license; see `frontend/public/store/THREE-LICENSE.txt`. Blender scene geometry/materials are generated locally by the included script.


## User-optimized scene update

The editable scene is now the user's optimized mesh (41,788 exported triangles).
Do not regenerate it with `build_store.py`: that would replace the user's work.
Use `bake_edited.py` with the existing .blend instead. It never saves over the
source; it verifies its SHA-256 remains unchanged. Existing poster UVs are pinned
and procedural Generated coordinates are preserved before joining. A separate
non-overlapping Lightmap UV is packed for an 4096px combined bake. The exported
room and two animated speaker pairs share one baked material across three meshes.
The 4K atlas uses about 85 MiB with mipmaps, leaving room for live reflections.
Cycles disk tiling is disabled: an 8K bake exceeded available memory and a tiled
retry failed in the OpenEXR cache. The pipeline rejects empty lightmaps.

`verify_store_glb.py` checks UV bounds, non-degenerate triangles and sampled
interior overlaps directly in the exported GLB. Preview PNGs show the source and
baked scene from the same camera. Old app-created poster planes were removed;
posters now come entirely from the edited Blender model.


## Entrance lighting and counter screen

A small `neon-fixtures.glb`, exported from the edited scene by `export_neon.py`,
keeps the pink/cyan neon lit during a 2.8-second entrance fade. The baked room
brightness ramps up without adding real-time shadows. Reduced-motion preferences
skip the fade. This adds a few neon-only draw calls to the one-material room.
The back-wall canvas sits in front of the recessed panel and displays live audio
frequency bars plus a waveform, with an idle message when playback is paused.

The material fade supports both unlit and emissive PBR Blender exports. Exit reverses the brightness transition before returning to the library. Empty-bin signs have undistorted artwork and solid blank backs; repeated cabinet-front collection plaques have been removed.


## Speaker motion and reflective finishes

The edited source contains `LR_Big_Speakers` and `LR_Small_Speakers`. They are
baked with the room, then separated using vertex groups; no static duplicate
cones remain. Each left/right half deforms around its own center so the paired
spacing stays fixed. Bass/midrange drive the big cones and highs drive the small
ones. Forward/back motion and mild radial squash use smoothed FFT energy and
settle back to the exact original positions when paused. Reduced motion disables
this effect.

`export_surfaces.py` reads the largest floor and ceiling faces and their Blender
roughness into `reflective-surfaces.json`, without saving the .blend. Selective
Rough floor/ceiling overlays use a filtered local environment probe. This avoids
screen-space cutoffs and recursive planar projection artifacts. The probe updates
at a limited rate and is lower-resolution in Low mode; reflections are approximate
(they do not reproduce exact mirror parallax). Held objects are excluded.
`soft-lighting.json` uses soft area lights with dimmed display/entrance fill and
a reduced counter wash so the rear neon remains legible. This is applied without
changing the user's Blender source or its edited meshes.
Run the surface and neon exporters after editing either surface or neon fixtures.

The welcome instructions appear after the entrance lighting completes and remain
dismissed after browsing starts, including when mouse capture is lost. Entry
buttons wrap with a 12px gap and preserve dark text on hover. Sleeves use a thin
0.006-unit edge instead of 0.045.

Music lighting is optional with a saved intensity slider. Smoothed audio bands
animate local color washes and neon tint, with a horizontal brightness chase
across the rear sign. Effects fade back to the authored lighting on pause;
reduced motion disables animation. This is a shader effect over baked lighting,
not expensive real-time shadow-casting lights.
Playback requests wait for the deck to settle and are cancelled on returning a
record. Space/right-click and the inspection button toggle playback.

Speaker motion now follows band energy directly, without a synthetic oscillator.
Music light zones use saved BPM or an onset-interval tempo estimate, genre-sensitive
pace/palettes, alternating zones, chase and sweep patterns. The rear sign uses a
spatial brightness chase across its letters. Ratings persist in the track JSON,
with 0 meaning unrated and 1–5 validated by the API.
