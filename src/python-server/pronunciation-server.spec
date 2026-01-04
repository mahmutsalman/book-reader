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
from PyInstaller.utils.hooks import collect_dynamic_libs
from PyInstaller.utils.hooks import collect_data_files
import site

# Auto-detect espeak-ng-data path (cross-platform)
def find_espeak_data():
    """Find espeak-ng-data in the current Python environment (cross-platform)."""
    try:
        site_packages = [Path(p) for p in site.getsitepackages()]
    except Exception:
        site_packages = []

    for sp_dir in site_packages:
        candidate = sp_dir / "piper" / "espeak-ng-data"
        if candidate.exists():
            return str(candidate)

    # Fallback: print warning and return None
    print("WARNING: espeak-ng-data not found in venv. Piper TTS may not work!")
    return None

espeak_data_path = find_espeak_data()

# Auto-detect PaddleX data files
def find_paddlex_data():
    """
    Collect PaddleX runtime data files.

    PaddleX expects a `.version` file at runtime under `paddlex/.version`.
    PyInstaller will not reliably include dotfiles unless explicitly collected.
    """
    datas = []

    # Prefer PyInstaller's helper (robust across venv layouts, including Windows' venv/Lib/site-packages).
    try:
        datas = collect_data_files("paddlex")
        print(f"✓ Collected PaddleX data files: {len(datas)} entries")
    except Exception as e:
        print(f"WARNING: Failed to collect PaddleX data files: {e}")
        datas = []

    # Ensure `.version` is included even if collect_data_files misses dotfiles in some environments.
    try:
        has_version = any(Path(src).name == ".version" and str(dest).replace("\\", "/").rstrip("/") == "paddlex" for src, dest in datas)
    except Exception:
        has_version = False

    if has_version:
        return datas

    # Fallback: locate paddlex/.version directly from site-packages.
    try:
        site_packages = [Path(p) for p in site.getsitepackages()]
    except Exception:
        site_packages = []

    paddlex_dir = None
    version_file = None
    for sp_dir in site_packages:
        candidate_dir = sp_dir / "paddlex"
        candidate_version = candidate_dir / ".version"
        if candidate_version.exists():
            paddlex_dir = candidate_dir
            version_file = candidate_version
            break

    if version_file is not None:
        datas.append((str(version_file), "paddlex"))
        print(f"✓ Added PaddleX .version file explicitly: {version_file}")
        return datas

    # If the package exists but `.version` is missing, fail loudly to avoid shipping a broken OCR feature.
    for sp_dir in site_packages:
        candidate_dir = sp_dir / "paddlex"
        if candidate_dir.exists():
            paddlex_dir = candidate_dir
            break

    if paddlex_dir is not None:
        raise FileNotFoundError(f"PaddleX package found but missing required data file: {paddlex_dir / '.version'}")

    print("WARNING: PaddleX not found in site-packages. OCR may not work!")
    return datas

paddlex_data_files = find_paddlex_data()

def find_openssl_binaries():
    """
    Ensure the frozen app bundles a compatible OpenSSL for Python's `ssl` module.

    OpenCV wheels often bundle their own `libssl`/`libcrypto` which can conflict with
    Python's `_ssl` extension at runtime, causing `import ssl` to fail.

    We prefer the OpenSSL installation that Homebrew Python is linked against.
    """
    if sys.platform != "darwin":
        return []

    py_ver_dir = f"python{sys.version_info.major}.{sys.version_info.minor}"

    prefixes = [
        "/opt/homebrew/opt/openssl@3",  # Apple Silicon Homebrew
        "/usr/local/opt/openssl@3",     # Intel Homebrew
    ]

    for prefix in prefixes:
        libssl = Path(prefix) / "lib" / "libssl.3.dylib"
        libcrypto = Path(prefix) / "lib" / "libcrypto.3.dylib"
        if libssl.exists() and libcrypto.exists():
            print(f"✓ Using OpenSSL from: {prefix}")
            # Place next to the embedded Python runtime so `_ssl` can resolve them via @rpath.
            return [(str(libssl), py_ver_dir), (str(libcrypto), py_ver_dir)]

    print("WARNING: OpenSSL@3 not found in Homebrew prefixes; `import ssl` may fail in the frozen build.")
    return []

openssl_binaries = find_openssl_binaries()

# Paddle (paddlepaddle) ships a set of shared libraries in `paddle/libs` that are
# loaded dynamically at runtime. PyInstaller may miss these unless explicitly collected.
try:
    paddle_dynamic_libs = collect_dynamic_libs('paddle')
    if paddle_dynamic_libs:
        print(f"✓ Collected Paddle dynamic libs: {len(paddle_dynamic_libs)} files")
except Exception as e:
    print(f"WARNING: Failed to collect Paddle dynamic libs: {e}")
    paddle_dynamic_libs = []

# IMPORTANT: Voice models are NOT bundled in the executable
# They will be downloaded on-demand by the user through the app UI
# This significantly reduces the bundle size (~180MB saved)
# Models will be stored in user's app data directory
model_data_files = []  # Empty - no models bundled

# Analysis: Collect all Python files and dependencies
a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=paddle_dynamic_libs + openssl_binaries,
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
        'paddleocr.ppocr',
        'paddleocr.ppstructure',
        'paddle',           # paddlepaddle package imports as 'paddle'
        'paddle.fluid',
        'paddle.nn',
        'paddle.optimizer',
        'paddle.utils',
        'paddlex',
        'cv2',  # OpenCV
        'skimage',          # scikit-image (used by PaddleOCR)
        'shapely',
        'shapely.geometry',
        'pyclipper',
        'lmdb',
        'tqdm',
        'scipy',
        'scipy.special',
        'scipy.ndimage',
        'Polygon',          # Polygon3 package imports as 'Polygon' (not 'Polygon3'!)
        'lanms',            # lanms-neo package imports as 'lanms' (not 'lanms-neo'!)
        'lanms.adaptor',    # lanms-neo submodule for NMS
        'imgaug',
        'imgaug.augmenters',
        'imgaug.parameters',
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
    ],
    noarchive=False,
)

# OpenCV wheels can ship their own OpenSSL (`cv2/.dylibs/libssl*.dylib` and `libcrypto*.dylib`)
# and PyInstaller may create top-level `libssl.3.dylib`/`libcrypto.3.dylib` symlinks pointing to them.
# This can break `import ssl` (Python's `_ssl` extension expects the OpenSSL it was built against).
if sys.platform == "darwin":
    py_ver_dir = f"python{sys.version_info.major}.{sys.version_info.minor}"
    blocked_dests = {
        "cv2/.dylibs/libssl.3.dylib",
        "cv2/.dylibs/libcrypto.3.dylib",
    }

    filtered = []
    removed = []
    for dest, src, typecode in list(a.binaries):
        src_str = str(src)
        if dest in blocked_dests:
            removed.append((dest, src_str))
            continue
        # Remove any top-level OpenSSL symlinks so we can recreate them to point at the Python OpenSSL.
        if typecode == "SYMLINK" and dest in ("libssl.3.dylib", "libcrypto.3.dylib"):
            removed.append((dest, src_str))
            continue
        filtered.append((dest, src, typecode))

    if removed:
        print("✓ Removed OpenCV-provided OpenSSL from bundle (avoid ssl symbol conflicts)")
        for dest, src_str in removed:
            print(f"  - {dest} <= {src_str}")

    # Re-add stable top-level symlinks for OpenSSL to the Python runtime directory.
    filtered.append(("libssl.3.dylib", f"{py_ver_dir}/libssl.3.dylib", "SYMLINK"))
    filtered.append(("libcrypto.3.dylib", f"{py_ver_dir}/libcrypto.3.dylib", "SYMLINK"))

    a.binaries = filtered

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
