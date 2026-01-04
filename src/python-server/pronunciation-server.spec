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

# Auto-detect PaddleX data files
def find_paddlex_data():
    """Find PaddleX .version file and other data files."""
    paddlex_data = []

    # Try to find paddlex in venv
    # Windows path
    windows_paths = glob.glob('venv/Lib/python*/site-packages/paddlex')
    # Unix/macOS path
    unix_paths = glob.glob('venv/lib/python*/site-packages/paddlex')

    paddlex_paths = windows_paths + unix_paths

    if paddlex_paths:
        paddlex_dir = Path(paddlex_paths[0])
        # Include .version file
        version_file = paddlex_dir / '.version'
        if version_file.exists():
            paddlex_data.append((str(version_file), 'paddlex'))
            print(f"✓ Found PaddleX .version file: {version_file}")
        else:
            print(f"WARNING: PaddleX .version file not found at {version_file}")
    else:
        print("WARNING: PaddleX not found in venv. OCR may not work!")

    return paddlex_data

paddlex_data_files = find_paddlex_data()

# IMPORTANT: Voice models are NOT bundled in the executable
# They will be downloaded on-demand by the user through the app UI
# This significantly reduces the bundle size (~180MB saved)
# Models will be stored in user's app data directory
model_data_files = []  # Empty - no models bundled

# Analysis: Collect all Python files and dependencies
a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=model_data_files + paddlex_data_files + ([(espeak_data_path, 'piper/espeak-ng-data')] if espeak_data_path else []),
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
        # PaddleOCR and dependencies
        'paddleocr',
        'paddlepaddle',
        'paddle',
        'paddle.fluid',
        'paddlex',
        'cv2',  # OpenCV
        'shapely',
        'shapely.geometry',
        'pyclipper',
        'lmdb',
        'tqdm',
        'scipy',
        'scipy.special',
        'scipy.ndimage',
        'Polygon',
        'lanms',
        'imgaug',
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
