MusiGen — portable local AI music studio
========================================

HOW TO USE
1. Extract this whole "MusiGen" folder somewhere you can write to
   (Desktop, Documents, or any drive with free space — NOT Program Files).
2. Double-click MusiGen.exe.
3. First launch sets up its runtime and downloads what it needs, with a
   progress bar. This is a one-time step.

EVERYTHING STAYS IN THIS FOLDER
On first run MusiGen creates these subfolders right next to the EXE:
   runtime\    - the Python runtime it installs
   models\     - all downloaded AI models (music, lyrics, cover art)
   music\      - your generated songs
   data\       - the library database + cover images
   downloads\  - cached installer files

Nothing is written to AppData or anywhere else on your PC. To completely
remove MusiGen and free all its space, just delete this folder.

You can move or rename this folder anytime — it keeps working.

Models are only downloaded when you choose them in Setup (or on your first
song), so you only ever store what you actually use.
