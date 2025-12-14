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
from pathlib import Path

# Analysis: Collect all Python files and dependencies
a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=[
        # Include Piper TTS voice models
        ('models/*.onnx', 'models'),
        ('models/*.json', 'models'),
        # Include espeak-ng-data for Piper TTS phoneme generation
        ('venv/lib/python3.13/site-packages/piper/espeak-ng-data', 'piper/espeak-ng-data'),
    ],
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
