# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas = [('E:/Claude Code/MusiGen/installer/vendor/uv.exe', '.'), ('E:/Claude Code/MusiGen/run_backend.py', '.'), ('E:/Claude Code/MusiGen/backend', 'backend'), ('E:/Claude Code/MusiGen/frontend/dist', 'frontend/dist'), ('E:/Claude Code/MusiGen/installer/musigen.ico', '.'), ('E:/Claude Code/MusiGen/installer/musigen.png', '.')]
binaries = []
hiddenimports = ['truststore', 'clr']
tmp_ret = collect_all('webview')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('clr_loader')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('pythonnet')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['E:/Claude Code/MusiGen/installer/bootstrap_gui.py'],
    pathex=[],
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
    icon='E:/Claude Code/MusiGen/installer/musigen.ico',
)
