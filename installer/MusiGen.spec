# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

from pathlib import Path

root = Path(SPECPATH).resolve().parent
installer = root / 'installer'
# Bundle application sources only, excluding test fixtures and bytecode caches.
datas = [(str(installer / 'vendor' / 'uv.exe'), '.'),
         (str(root / 'run_backend.py'), '.'),
         (str(root / 'backend' / 'requirements.txt'), 'backend'),
         (str(root / 'frontend' / 'dist'), 'frontend/dist'),
         (str(installer / 'musigen.ico'), '.'),
         (str(installer / 'musigen.png'), '.')]
datas += [(str(p), str(p.parent.relative_to(root)))
          for p in (root / 'backend' / 'app').rglob('*.py')]

binaries = []
hiddenimports = ['truststore', 'clr']
tmp_ret = collect_all('webview')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('clr_loader')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('pythonnet')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    [str(installer / 'bootstrap_gui.py')],
    pathex=[str(installer)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['torch', 'transformers', 'numpy'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='MusiGen',
    version=str(installer / 'version_info.txt'),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(installer / 'musigen.ico'),
)
