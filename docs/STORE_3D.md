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

`assets/store/neon-boutique.blend` is the editable Blender source. `assets/store/build_store.py` regenerates its modeled furniture, lighting, headphones, posters, counter, speakers and listening stations. Run with Blender 5.2 in background and `-- --bake` to generate the preview, 4096-pixel lighting atlas and `frontend/public/store/neon-boutique.glb`. The GLB is bundled by Vite and the regular installer spec. Blender is an authoring dependency only, not required on users' computers.

The room uses baked illumination and a single static mesh plus emissive fixtures. Album art, sleeves, the animated inspection deck and the music-responsive counter display remain interactive Three.js objects. Artwork and music stay local. Original concept images are under `docs/store-concepts`.

## Resource behavior

The room is lazy-loaded, capped at 45 FPS (Balanced) or 30 FPS (Low), and stops rendering in hidden tabs. It disposes its renderer, geometry, materials and textures when leaving the store. Heavy job stages or active AI model operations unmount the room and explain the GPU conflict. Status failures fail closed. Paused or merely queued jobs do not block entry. Exiting inspection leaves normal music playback running.

## Validation and limits

TypeScript/Vite build and the 17 frontend tests pass, including collision bounds, generation guards and playlist scope. Browser checks exercised real local cover/audio loading, sleeve selection, playback progress, turntable presentation, spin-on/play and stop-on/pause state, sleeve return, and simulated busy-state unloading. Pointer capture is denied by the Codex browser; native WebView2 capture still needs user acceptance testing in the EXE. This is an experimental first art pass, not a final visual-quality sign-off.

Three.js and its GLTFLoader use the MIT license; see `frontend/public/store/THREE-LICENSE.txt`. Blender scene geometry/materials are generated locally by the included script.
