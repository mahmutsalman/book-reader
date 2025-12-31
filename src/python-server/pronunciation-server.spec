# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for BookReader Pronunciation Server.
Creates a standalone executable that includes Python runtime and all dependencies.

Build command:
  pyinstaller pronunciation-server.spec

Output:
  dist/pronunciation-server (macOS/Linux)
  dist/pronunciation-server.exe (Windows)
"""

import sys
import glob
from pathlib import Path

# Auto-detect espeak-ng-data path (cross-platform)
def find_espeak_data():
    """Find espeak-ng-data in venv, handling both Windows and Unix paths."""
    # Try Windows path first (venv/Lib with capital L)
    windows_paths = glob.glob('venv/Lib/python*/site-packages/piper/espeak-ng-data')
    if windows_paths:
        return windows_paths[0]

    # Try Unix/macOS path (venv/lib lowercase)
    unix_paths = glob.glob('venv/lib/python*/site-packages/piper/espeak-ng-data')
    if unix_paths:
        return unix_paths[0]

    # Fallback: print warning and return None
    print("WARNING: espeak-ng-data not found in venv. Piper TTS may not work!")
    return None

espeak_data_path = find_espeak_data()

# Check if model files exist (optional - app works without them)
def find_model_files():
    """Find voice model files if they exist."""
    model_files = []
    if Path('models').exists():
        onnx_files = list(Path('models').glob('*.onnx'))
        json_files = list(Path('models').glob('*.json'))
        if onnx_files:
            model_files.append(('models/*.onnx', 'models'))
        if json_files:
            model_files.append(('models/*.json', 'models'))
    return model_files

model_data_files = find_model_files()

# Analysis: Collect all Python files and dependencies
a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=model_data_files + ([(espeak_data_path, 'piper/espeak-ng-data')] if espeak_data_path else []),
    hiddenimports=[
        # FastAPI and dependencies
        'fastapi',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'pydantic',
        'pydantic_core',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        # Piper TTS (offline neural voices)
        'piper',
        'piper.voice',
        'onnxruntime',
        # gruut for IPA
        'gruut',
        'gruut.lang',
        'gruut_ipa',
        # Standard library async
        'asyncio',
        'concurrent.futures',
        # HTTP
        'httpx',
        'httpcore',
        'h11',
        'certifi',
        'ssl',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary modules to reduce size
        'tkinter',
        'matplotlib',
        # numpy is required by piper-tts for ONNX operations - DO NOT EXCLUDE
        'pandas',
        'scipy',
        'PIL',
        'cv2',
    ],
    noarchive=False,
)

# Create single-file executable
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='pronunciation-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for logging
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
