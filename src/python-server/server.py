"""
FastAPI Pronunciation Server for BookReader.

Provides TTS (Text-to-Speech), IPA transcription, and PDF extraction services.
Uses Edge TTS for neural voice synthesis, gruut for IPA generation,
and PyMuPDF/pytesseract for PDF text extraction.

Default port: 8766
"""
import os
import asyncio
import subprocess
import sys
import shutil
import inspect
from typing import Optional, List, Dict
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime

from generators.tts import generate_audio, MODELS_DIR, VOICE_MODELS
from generators.ipa import generate_ipa
import urllib.request
import json

# PDF processing imports (lazy loaded to handle missing dependencies)
try:
    import fitz  # PyMuPDF
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    fitz = None

try:
    import pytesseract
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    import numpy as np
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    pytesseract = None
    Image = None
    ImageEnhance = None
    ImageFilter = None
    ImageOps = None
    np = None

# PaddleOCR support (optional, installed by default)
# Using lazy initialization to avoid blocking server startup with model downloads
try:
    from paddleocr import PaddleOCR
    PADDLEOCR_AVAILABLE = True
    PaddleOCR_class = PaddleOCR  # Store the class for lazy initialization
except ImportError:
    PADDLEOCR_AVAILABLE = False
    PaddleOCR_class = None

# PaddleOCR/PaddleX may try to check remote model hosters even when local models are cached.
# BookReader runs locally and may not have network access, so disable by default.
os.environ.setdefault("DISABLE_MODEL_SOURCE_CHECK", "True")

# Limit native thread fan-out to reduce RAM spikes on some systems.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

# PaddleOCR instances (initialized lazily on first use, per language)
paddle_ocr_instances = {}
paddle_ocr_lock = None  # For thread-safe lazy initialization

PADDLE_LANG_MAP = {
    "en": "en",
    "ja": "japan",
    "zh": "ch",
    "ko": "korean",
}

def get_paddle_lang(language: str) -> str:
    if not language:
        return "en"
    return PADDLE_LANG_MAP.get(str(language).lower(), "en")

def get_paddle_ocr(language: str = "en"):
    """
    Get or initialize PaddleOCR instance (lazy initialization).
    This avoids blocking server startup with model downloads.
    Models are downloaded on first use instead.
    """
    global paddle_ocr_instances, paddle_ocr_lock

    if not PADDLEOCR_AVAILABLE:
        raise Exception("PaddleOCR not available. Install with: pip install paddleocr paddlepaddle")

    # Initialize lock if needed (thread-safe)
    if paddle_ocr_lock is None:
        import threading
        paddle_ocr_lock = threading.Lock()

    paddle_lang = get_paddle_lang(language)

    # Lazy initialization (only create instance on first use)
    if paddle_lang not in paddle_ocr_instances:
        with paddle_ocr_lock:
            # Double-check after acquiring lock
            if paddle_lang not in paddle_ocr_instances:
                print(f"[PaddleOCR] Initializing PaddleOCR (first use - downloading models if needed)... lang={paddle_lang}")
                # Newer PaddleOCR builds route through PaddleX and enable doc pre-processing by default,
                # which is heavier than we need for manga crops. Pass only supported kwargs.
                kwargs = {
                    "use_textline_orientation": False,
                    "lang": paddle_lang,
                    "use_doc_preprocessor": False,
                    "use_doc_orientation_classify": False,
                    "use_doc_unwarping": False,
                }
                try:
                    sig = inspect.signature(PaddleOCR_class.__init__)
                    supported = set(sig.parameters.keys())
                    filtered_kwargs = {k: v for k, v in kwargs.items() if k in supported}
                except Exception:
                    filtered_kwargs = {"use_textline_orientation": False, "lang": paddle_lang}

                paddle_ocr_instances[paddle_lang] = PaddleOCR_class(**filtered_kwargs)
                print(f"[PaddleOCR] Initialization complete! lang={paddle_lang}")

    return paddle_ocr_instances[paddle_lang]

# Server configuration
VERSION = "1.0.0"
DEFAULT_PORT = 8766

# Debug configuration (debug branch only)
# ⚠️ SET TO FALSE FOR MAIN BRANCH MERGE ⚠️
# Main branch does not have a 'debugging' folder and may not have write permissions.
# When testing OCR improvements on the debug branch, set this to True to enable:
#   - Debug image saves (original crops, preprocessed images)
#   - Detailed OCR logs (confidence stats, all detections)
#   - Output location: BookReader/debugging/{images,logs}/
DEBUG_BRANCH_ENABLED = False

DEBUG_ENABLED = DEBUG_BRANCH_ENABLED and os.environ.get("BOOKREADER_OCR_DEBUG", "1").lower() in ("1", "true", "yes")
DEBUG_DIR = Path(os.environ.get("BOOKREADER_DEBUG_DIR", str(Path(__file__).resolve().parents[2] / "debugging")))
DEBUG_IMAGES_DIR = DEBUG_DIR / "images"
DEBUG_LOGS_DIR = DEBUG_DIR / "logs"


def cleanup_debug_directories():
    """Clean up debug directories on startup for fresh logs."""
    if not DEBUG_ENABLED:
        return
    if os.environ.get("BOOKREADER_OCR_DEBUG_CLEAN", "1").lower() in ("0", "false", "no"):
        return

    try:
        # Remove and recreate images directory
        if DEBUG_IMAGES_DIR.exists():
            shutil.rmtree(DEBUG_IMAGES_DIR)
        DEBUG_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

        # Remove and recreate logs directory
        if DEBUG_LOGS_DIR.exists():
            shutil.rmtree(DEBUG_LOGS_DIR)
        DEBUG_LOGS_DIR.mkdir(parents=True, exist_ok=True)

        print(f"[Debug] Cleaned up debug directories: {DEBUG_DIR}")
    except Exception as e:
        print(f"[Debug] Failed to cleanup debug directories: {e}")


# Clean debug folders on startup
cleanup_debug_directories()

# Initialize FastAPI app
app = FastAPI(
    title="BookReader Pronunciation Server",
    version=VERSION,
    description="TTS and IPA services for BookReader"
)

# Allow Electron to connect (localhost only)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class TTSRequest(BaseModel):
    text: str
    language: str = "en"


class TTSResponse(BaseModel):
    success: bool
    audio_base64: Optional[str] = None
    format: str = "mp3"
    error: Optional[str] = None


class IPARequest(BaseModel):
    text: str
    language: str = "en"


class IPAResponse(BaseModel):
    success: bool
    text: str
    ipa: Optional[str] = None
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    version: str


class IPALanguageInfo(BaseModel):
    code: str
    name: str
    package: str
    installed: bool


class IPALanguagesResponse(BaseModel):
    success: bool
    languages: List[IPALanguageInfo]
    error: Optional[str] = None


class InstallLanguageRequest(BaseModel):
    language: str


class InstallLanguageResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None


# PDF Extraction Models
class PdfPageResult(BaseModel):
    page_num: int
    text: str
    extraction_method: str  # 'text' or 'ocr'
    confidence: Optional[float] = None


class PdfMetadata(BaseModel):
    title: str
    author: Optional[str] = None
    page_count: int


class PdfExtractRequest(BaseModel):
    pdf_path: str
    language: str = "en"
    use_ocr: bool = True  # If true, use OCR for pages without text


class PdfExtractResponse(BaseModel):
    success: bool
    pdf_type: str = ""  # 'text', 'scanned', 'mixed'
    pages: List[PdfPageResult] = []
    metadata: Optional[PdfMetadata] = None
    error: Optional[str] = None


class TesseractStatusResponse(BaseModel):
    available: bool
    pdf_available: bool
    ocr_available: bool
    tesseract_path: Optional[str] = None
    error: Optional[str] = None


# Manga OCR Models
class OCRTextRegion(BaseModel):
    text: str
    bbox: List[float]  # [x, y, width, height] in pixels
    confidence: float  # 0-1
    confidence_tier: str = "unknown"  # 'high' | 'medium' | 'low'


class MangaOCRRequest(BaseModel):
    image_path: str
    language: str = "en"
    preprocessing_profile: str = "default"  # 'default' | 'adaptive' | 'high_contrast' | 'low_contrast' | 'denoised'
    psm_mode: str = "sparse"  # 'sparse' | 'dense' | 'auto' | 'vertical'
    ocr_engine: str = "paddleocr"  # 'tesseract' | 'paddleocr' | 'trocr' | 'easyocr' | 'hybrid'


class MangaOCRRegionRequest(BaseModel):
    image_path: str
    region: List[float]  # [x, y, width, height] in pixels
    language: str = "en"
    # For small user-selected crops, aggressive binarization + sparse PSM often hurts OCR.
    preprocessing_profile: str = "minimal"  # 'none' | 'minimal' | 'default' | 'adaptive' | 'high_contrast' | 'low_contrast' | 'denoised'
    psm_mode: str = "dense"  # 'sparse' | 'dense' | 'auto' | 'vertical'
    ocr_engine: str = "paddleocr"  # 'tesseract' | 'paddleocr' | 'trocr' | 'easyocr' | 'hybrid'


class MangaOCRResponse(BaseModel):
    success: bool
    regions: List[OCRTextRegion] = []
    error: Optional[str] = None
    metadata: Optional[dict] = None  # Confidence stats, preprocessing info, filter counts


# Voice Model Management Models
class VoiceModelInfo(BaseModel):
    language: str
    name: str
    model_file: str
    config_file: str
    size: Optional[int] = None  # Size in bytes if downloaded
    downloaded: bool
    download_url_model: Optional[str] = None
    download_url_config: Optional[str] = None


class VoiceModelsResponse(BaseModel):
    success: bool
    models: List[VoiceModelInfo] = []
    models_directory: str = ""
    error: Optional[str] = None


class DownloadModelRequest(BaseModel):
    language: str


class DownloadModelResponse(BaseModel):
    success: bool
    message: str
    progress: Optional[int] = None  # 0-100
    error: Optional[str] = None


class DeleteModelRequest(BaseModel):
    language: str


class DeleteModelResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None


# Tesseract language mapping
TESSERACT_LANGS = {
    "en": "eng",
    "de": "deu",
    "ru": "rus",
    "fr": "fra",
    "es": "spa",
    "it": "ita",
    "pt": "por",
    "ja": "jpn",
    "zh": "chi_sim",
    "ko": "kor",
}


def check_tesseract_installed() -> tuple[bool, Optional[str]]:
    """Check if Tesseract OCR is installed and return its path."""
    tesseract_path = shutil.which("tesseract")
    if tesseract_path:
        return True, tesseract_path
    # Check common installation paths
    common_paths = [
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
        "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
        "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
    ]
    for path in common_paths:
        if os.path.exists(path):
            return True, path
    return False, None


def detect_pdf_type(doc) -> str:
    """Detect if PDF is text-based, scanned, or mixed."""
    text_pages = 0
    image_pages = 0

    for page in doc:
        text = page.get_text().strip()
        if len(text) > 50:  # Has meaningful text
            text_pages += 1
        else:
            image_pages += 1

    if image_pages == 0:
        return "text"
    elif text_pages == 0:
        return "scanned"
    else:
        return "mixed"


def extract_text_from_page(page, use_ocr: bool, language: str) -> tuple[str, str, Optional[float]]:
    """
    Extract text from a PDF page.
    Returns: (text, extraction_method, confidence)
    """
    # Try text extraction first
    text = page.get_text().strip()

    if len(text) > 50:
        return text, "text", None

    # If no text and OCR is enabled, try OCR
    if use_ocr and OCR_AVAILABLE:
        try:
            # Render page to image
            mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better OCR
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")

            # Convert to PIL Image
            import io
            img = Image.open(io.BytesIO(img_data))

            # Get Tesseract language code
            tess_lang = TESSERACT_LANGS.get(language, "eng")

            # Run OCR with confidence data
            ocr_data = pytesseract.image_to_data(img, lang=tess_lang, output_type=pytesseract.Output.DICT)

            # Extract text and calculate average confidence
            words = []
            confidences = []
            for i, word in enumerate(ocr_data["text"]):
                if word.strip():
                    words.append(word)
                    conf = ocr_data["conf"][i]
                    if conf > 0:  # -1 means no confidence
                        confidences.append(conf)

            ocr_text = " ".join(words)
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0

            if ocr_text.strip():
                return ocr_text, "ocr", avg_confidence / 100.0  # Normalize to 0-1
        except Exception as e:
            print(f"[PDF] OCR failed for page: {e}")

    # Return whatever text we have (might be empty)
    return text if text else "", "text", None


# Track ongoing installations
_installing_languages: Dict[str, bool] = {}


# Available gruut language packages
GRUUT_LANGUAGES = {
    "en": {"name": "English", "package": "gruut-lang-en"},
    "de": {"name": "German", "package": "gruut-lang-de"},
    "ru": {"name": "Russian", "package": "gruut-lang-ru"},
    "fr": {"name": "French", "package": "gruut-lang-fr"},
    "es": {"name": "Spanish", "package": "gruut-lang-es"},
    "it": {"name": "Italian", "package": "gruut-lang-it"},
    "nl": {"name": "Dutch", "package": "gruut-lang-nl"},
    "cs": {"name": "Czech", "package": "gruut-lang-cs"},
    "pt": {"name": "Portuguese", "package": "gruut-lang-pt"},
    "sv": {"name": "Swedish", "package": "gruut-lang-sv"},
    "ar": {"name": "Arabic", "package": "gruut-lang-ar"},
    "fa": {"name": "Persian", "package": "gruut-lang-fa"},
    "sw": {"name": "Swahili", "package": "gruut-lang-sw"},
    "zh": {"name": "Chinese", "package": "gruut-lang-zh"},
}


def is_language_installed(lang_code: str) -> bool:
    """Check if a gruut language package is installed."""
    try:
        package_name = f"gruut_lang_{lang_code}"
        __import__(package_name)
        return True
    except ImportError:
        return False


def install_language_sync(lang_code: str) -> tuple[bool, str]:
    """Install a gruut language package synchronously."""
    if lang_code not in GRUUT_LANGUAGES:
        return False, f"Unknown language: {lang_code}"

    package = GRUUT_LANGUAGES[lang_code]["package"]

    try:
        print(f"[IPA] Installing {package}...")
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", package],
            capture_output=True,
            text=True,
            timeout=120  # 2 minute timeout
        )

        if result.returncode == 0:
            print(f"[IPA] Successfully installed {package}")
            return True, f"Successfully installed {GRUUT_LANGUAGES[lang_code]['name']} IPA support"
        else:
            print(f"[IPA] Failed to install {package}: {result.stderr}")
            return False, f"Installation failed: {result.stderr}"
    except subprocess.TimeoutExpired:
        return False, "Installation timed out"
    except Exception as e:
        return False, f"Installation error: {str(e)}"


# Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if server is running and ready."""
    return HealthResponse(status="ok", version=VERSION)


@app.post("/api/tts", response_model=TTSResponse)
async def text_to_speech(request: TTSRequest):
    """
    Generate audio from text with enhanced error logging.

    Args:
        request: TTSRequest with text and language

    Returns:
        TTSResponse with base64-encoded MP3 audio
    """
    request_id = id(request)  # Unique ID for tracking

    print(f"[TTS:{request_id}] Request: lang={request.language}, len={len(request.text)}, preview='{request.text[:50]}...'")

    if not request.text or not request.text.strip():
        print(f"[TTS:{request_id}] Error: Empty text")
        return TTSResponse(success=False, error="Text is required")

    try:
        print(f"[TTS:{request_id}] Starting audio generation...")
        audio_base64 = await generate_audio(request.text, request.language)

        if audio_base64:
            print(f"[TTS:{request_id}] Success: {len(audio_base64)} bytes")
            return TTSResponse(success=True, audio_base64=audio_base64, format="mp3")
        else:
            print(f"[TTS:{request_id}] Error: generate_audio returned None")
            return TTSResponse(success=False, error="Audio generation failed - check logs")

    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[TTS:{request_id}] Exception: {error_type}: {error_msg}")
        import traceback
        traceback.print_exc()
        return TTSResponse(success=False, error=f"{error_type}: {error_msg}")


@app.get("/api/tts/{language}/{text}", response_model=TTSResponse)
async def text_to_speech_get(language: str, text: str):
    """
    Generate audio from text (GET endpoint).

    Args:
        language: Language code (en, de, ru)
        text: Text to synthesize

    Returns:
        TTSResponse with base64-encoded MP3 audio
    """
    return await text_to_speech(TTSRequest(text=text, language=language))


@app.post("/api/ipa", response_model=IPAResponse)
async def get_ipa(request: IPARequest):
    """
    Generate IPA transcription for text.

    Args:
        request: IPARequest with text and language

    Returns:
        IPAResponse with IPA transcription
    """
    print(f"[Server IPA] Received request: language={request.language}, text={request.text[:50]}...")

    if not request.text or not request.text.strip():
        return IPAResponse(
            success=False,
            text=request.text,
            error="Text is required"
        )

    try:
        ipa = generate_ipa(request.text, request.language)
        print(f"[Server IPA] Generated IPA: {ipa}")

        if ipa:
            return IPAResponse(
                success=True,
                text=request.text,
                ipa=ipa
            )
        else:
            print(f"[Server IPA] IPA generation returned None")
            return IPAResponse(
                success=False,
                text=request.text,
                error="Failed to generate IPA"
            )

    except Exception as e:
        print(f"[Server IPA] Exception: {e}")
        return IPAResponse(
            success=False,
            text=request.text,
            error=str(e)
        )


@app.get("/api/ipa/{language}/{text}", response_model=IPAResponse)
async def get_ipa_get(language: str, text: str):
    """
    Generate IPA transcription (GET endpoint).

    Args:
        language: Language code (en, de, ru)
        text: Text to transcribe

    Returns:
        IPAResponse with IPA transcription
    """
    return await get_ipa(IPARequest(text=text, language=language))


@app.get("/api/ipa/languages", response_model=IPALanguagesResponse)
async def get_ipa_languages():
    """
    Get list of available IPA languages and their installation status.

    Returns:
        IPALanguagesResponse with list of languages
    """
    try:
        languages = []
        for code, info in GRUUT_LANGUAGES.items():
            languages.append(IPALanguageInfo(
                code=code,
                name=info["name"],
                package=info["package"],
                installed=is_language_installed(code)
            ))

        # Sort by name, but put installed first
        languages.sort(key=lambda x: (not x.installed, x.name))

        return IPALanguagesResponse(success=True, languages=languages)
    except Exception as e:
        return IPALanguagesResponse(success=False, languages=[], error=str(e))


@app.post("/api/ipa/install", response_model=InstallLanguageResponse)
async def install_ipa_language(request: InstallLanguageRequest):
    """
    Install a gruut language package for IPA support.

    Args:
        request: InstallLanguageRequest with language code

    Returns:
        InstallLanguageResponse with installation result
    """
    lang = request.language

    # Check if already installed
    if is_language_installed(lang):
        return InstallLanguageResponse(
            success=True,
            message=f"{GRUUT_LANGUAGES.get(lang, {}).get('name', lang)} is already installed"
        )

    # Check if installation is already in progress
    if _installing_languages.get(lang):
        return InstallLanguageResponse(
            success=False,
            message="Installation already in progress",
            error="Please wait for the current installation to complete"
        )

    # Mark as installing
    _installing_languages[lang] = True

    try:
        success, message = install_language_sync(lang)

        if success:
            return InstallLanguageResponse(success=True, message=message)
        else:
            return InstallLanguageResponse(success=False, message="Installation failed", error=message)
    finally:
        _installing_languages[lang] = False


# Voice Model Management Endpoints
# HuggingFace model URLs
VOICE_MODEL_URLS = {
    "en": {
        "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
    },
    "de": {
        "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json",
    },
    "ru": {
        "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx.json",
    },
}

# Track ongoing downloads
_downloading_models: Dict[str, bool] = {}


def get_model_files(language: str) -> tuple[Path, Path]:
    """Get file paths for model and config."""
    voice_info = VOICE_MODELS.get(language)
    if not voice_info:
        raise ValueError(f"Unknown language: {language}")

    model_path = MODELS_DIR / voice_info["model"]
    config_path = MODELS_DIR / voice_info["config"]
    return model_path, config_path


def is_model_downloaded(language: str) -> bool:
    """Check if voice model files exist for a language."""
    try:
        model_path, config_path = get_model_files(language)
        return model_path.exists() and config_path.exists()
    except:
        return False


def download_file_sync(url: str, destination: Path) -> bool:
    """Download file with progress logging."""
    try:
        print(f"[Voice Model] Downloading: {destination.name}")
        urllib.request.urlretrieve(url, destination)
        size_mb = destination.stat().st_size / (1024 * 1024)
        print(f"[Voice Model] Downloaded {size_mb:.1f} MB")
        return True
    except Exception as e:
        print(f"[Voice Model] Download failed: {e}")
        if destination.exists():
            destination.unlink()  # Clean up partial download
        return False


@app.get("/api/voice/models", response_model=VoiceModelsResponse)
async def get_voice_models():
    """
    Get list of available voice models and their download status.

    Returns:
        VoiceModelsResponse with list of models
    """
    try:
        models = []
        for lang_code, voice_info in VOICE_MODELS.items():
            model_path, config_path = get_model_files(lang_code)
            downloaded = model_path.exists() and config_path.exists()

            # Get file size if downloaded
            size = None
            if downloaded:
                size = model_path.stat().st_size + config_path.stat().st_size

            # Get download URLs
            urls = VOICE_MODEL_URLS.get(lang_code, {})

            models.append(VoiceModelInfo(
                language=lang_code,
                name=voice_info["name"],
                model_file=voice_info["model"],
                config_file=voice_info["config"],
                size=size,
                downloaded=downloaded,
                download_url_model=urls.get("model_url"),
                download_url_config=urls.get("config_url")
            ))

        # Sort: downloaded first, then by language code
        models.sort(key=lambda x: (not x.downloaded, x.language))

        return VoiceModelsResponse(
            success=True,
            models=models,
            models_directory=str(MODELS_DIR)
        )
    except Exception as e:
        print(f"[Voice Model] Error listing models: {e}")
        return VoiceModelsResponse(
            success=False,
            error=str(e)
        )


@app.post("/api/voice/download", response_model=DownloadModelResponse)
async def download_voice_model(request: DownloadModelRequest):
    """
    Download a voice model from HuggingFace.

    Args:
        request: DownloadModelRequest with language code

    Returns:
        DownloadModelResponse with download result
    """
    lang = request.language

    # Validate language
    if lang not in VOICE_MODELS:
        return DownloadModelResponse(
            success=False,
            message=f"Unknown language: {lang}",
            error=f"Supported languages: {', '.join(VOICE_MODELS.keys())}"
        )

    # Check if already downloaded
    if is_model_downloaded(lang):
        return DownloadModelResponse(
            success=True,
            message=f"{VOICE_MODELS[lang]['name']} is already downloaded",
            progress=100
        )

    # Check if download is already in progress
    if _downloading_models.get(lang):
        return DownloadModelResponse(
            success=False,
            message="Download already in progress",
            error="Please wait for the current download to complete"
        )

    # Get URLs
    urls = VOICE_MODEL_URLS.get(lang)
    if not urls:
        return DownloadModelResponse(
            success=False,
            message="Download URLs not configured",
            error=f"No download URLs found for {lang}"
        )

    # Mark as downloading
    _downloading_models[lang] = True

    try:
        model_path, config_path = get_model_files(lang)

        # Ensure directory exists
        MODELS_DIR.mkdir(parents=True, exist_ok=True)

        # Download model file
        print(f"[Voice Model] Starting download: {VOICE_MODELS[lang]['name']}")
        if not download_file_sync(urls["model_url"], model_path):
            raise Exception("Failed to download model file")

        # Download config file
        if not download_file_sync(urls["config_url"], config_path):
            raise Exception("Failed to download config file")

        print(f"[Voice Model] Download complete: {VOICE_MODELS[lang]['name']}")
        return DownloadModelResponse(
            success=True,
            message=f"Successfully downloaded {VOICE_MODELS[lang]['name']}",
            progress=100
        )

    except Exception as e:
        print(f"[Voice Model] Download failed: {e}")
        # Clean up partial downloads
        try:
            model_path, config_path = get_model_files(lang)
            if model_path.exists():
                model_path.unlink()
            if config_path.exists():
                config_path.unlink()
        except:
            pass

        return DownloadModelResponse(
            success=False,
            message="Download failed",
            error=str(e)
        )
    finally:
        _downloading_models[lang] = False


@app.post("/api/voice/delete", response_model=DeleteModelResponse)
async def delete_voice_model(request: DeleteModelRequest):
    """
    Delete a downloaded voice model.

    Args:
        request: DeleteModelRequest with language code

    Returns:
        DeleteModelResponse with deletion result
    """
    lang = request.language

    # Validate language
    if lang not in VOICE_MODELS:
        return DeleteModelResponse(
            success=False,
            message=f"Unknown language: {lang}",
            error=f"Supported languages: {', '.join(VOICE_MODELS.keys())}"
        )

    # Check if model exists
    if not is_model_downloaded(lang):
        return DeleteModelResponse(
            success=True,
            message=f"{VOICE_MODELS[lang]['name']} is not installed"
        )

    try:
        model_path, config_path = get_model_files(lang)

        # Delete files
        if model_path.exists():
            model_path.unlink()
        if config_path.exists():
            config_path.unlink()

        print(f"[Voice Model] Deleted: {VOICE_MODELS[lang]['name']}")
        return DeleteModelResponse(
            success=True,
            message=f"Successfully deleted {VOICE_MODELS[lang]['name']}"
        )

    except Exception as e:
        print(f"[Voice Model] Delete failed: {e}")
        return DeleteModelResponse(
            success=False,
            message="Delete failed",
            error=str(e)
        )


# PDF Extraction Endpoints
@app.get("/api/pdf/status", response_model=TesseractStatusResponse)
async def get_pdf_status():
    """
    Check PDF extraction and OCR availability.

    Returns:
        TesseractStatusResponse with availability info
    """
    tesseract_installed, tesseract_path = check_tesseract_installed()

    return TesseractStatusResponse(
        available=PDF_AVAILABLE or OCR_AVAILABLE,
        pdf_available=PDF_AVAILABLE,
        ocr_available=OCR_AVAILABLE and tesseract_installed,
        tesseract_path=tesseract_path,
        error=None if PDF_AVAILABLE else "PyMuPDF not installed"
    )


@app.post("/api/pdf/extract", response_model=PdfExtractResponse)
async def extract_pdf(request: PdfExtractRequest):
    """
    Extract text from a PDF file.

    Args:
        request: PdfExtractRequest with pdf_path, language, and use_ocr flag

    Returns:
        PdfExtractResponse with extracted pages and metadata
    """
    if not PDF_AVAILABLE:
        return PdfExtractResponse(
            success=False,
            error="PDF processing not available. PyMuPDF is not installed."
        )

    pdf_path = request.pdf_path

    # Validate file exists
    if not os.path.exists(pdf_path):
        return PdfExtractResponse(
            success=False,
            error=f"PDF file not found: {pdf_path}"
        )

    # Check if OCR is requested but not available
    if request.use_ocr and not OCR_AVAILABLE:
        print("[PDF] OCR requested but pytesseract not available, falling back to text extraction only")

    try:
        print(f"[PDF] Opening: {pdf_path}")
        doc = fitz.open(pdf_path)

        # Get metadata
        title = doc.metadata.get("title", "") or Path(pdf_path).stem
        author = doc.metadata.get("author", "")
        page_count = len(doc)

        metadata = PdfMetadata(
            title=title,
            author=author if author else None,
            page_count=page_count
        )

        # Detect PDF type
        pdf_type = detect_pdf_type(doc)
        print(f"[PDF] Detected type: {pdf_type}, pages: {page_count}")

        # Extract text from each page
        pages: List[PdfPageResult] = []
        for page_num, page in enumerate(doc, start=1):
            text, method, confidence = extract_text_from_page(
                page,
                use_ocr=request.use_ocr,
                language=request.language
            )

            pages.append(PdfPageResult(
                page_num=page_num,
                text=text,
                extraction_method=method,
                confidence=confidence
            ))

            if page_num % 10 == 0:
                print(f"[PDF] Processed page {page_num}/{page_count}")

        doc.close()
        print(f"[PDF] Extraction complete: {len(pages)} pages")

        return PdfExtractResponse(
            success=True,
            pdf_type=pdf_type,
            pages=pages,
            metadata=metadata
        )

    except Exception as e:
        print(f"[PDF] Extraction failed: {e}")
        return PdfExtractResponse(
            success=False,
            error=f"Failed to extract PDF: {str(e)}"
        )


def classify_confidence_tier(confidence: float) -> str:
    """
    Classify OCR confidence into tiers for visual feedback.

    Tiers:
    - high (≥60%): Reliable detection, green highlights
    - medium (30-60%): Partial detection, yellow highlights
    - low (15-30%): Questionable detection, red highlights
    """
    if confidence >= 0.60:
        return "high"
    elif confidence >= 0.30:
        return "medium"
    else:
        return "low"


def calculate_confidence_stats(regions: List[OCRTextRegion]) -> dict:
    """
    Calculate confidence distribution statistics for debugging and user feedback.

    Returns:
        dict with count, min, max, avg, median, and tier distribution
    """
    if not regions:
        return {
            'count': 0,
            'min': 0.0,
            'max': 0.0,
            'avg': 0.0,
            'median': 0.0,
            'distribution': {'high': 0, 'medium': 0, 'low': 0}
        }

    confidences = [r.confidence for r in regions]
    sorted_conf = sorted(confidences)

    return {
        'count': len(regions),
        'min': min(confidences),
        'max': max(confidences),
        'avg': sum(confidences) / len(confidences),
        'median': sorted_conf[len(sorted_conf) // 2],
        'distribution': {
            'high': sum(1 for c in confidences if c >= 0.60),
            'medium': sum(1 for c in confidences if 0.30 <= c < 0.60),
            'low': sum(1 for c in confidences if 0.15 <= c < 0.30)
        }
    }


def save_debug_image(image, prefix: str, suffix: str = ""):
    """
    Save debug image with timestamp for visual inspection.
    """
    if not DEBUG_ENABLED:
        return None

    try:
        DEBUG_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # milliseconds
        filename = f"{prefix}_{timestamp}"
        if suffix:
            filename += f"_{suffix}"
        filename += ".png"

        filepath = DEBUG_IMAGES_DIR / filename
        image.save(filepath)

        print(f"[DEBUG] Saved image: {filepath}")
        return str(filepath)
    except Exception as e:
        print(f"[DEBUG] Failed to save image: {e}")
        return None


def log_debug_info(message: str, data: dict = None):
    """
    Log debug information to file with timestamp.
    """
    if not DEBUG_ENABLED:
        return

    try:
        DEBUG_LOGS_DIR.mkdir(parents=True, exist_ok=True)

        # Generate log filename (one per day)
        log_date = datetime.now().strftime("%Y%m%d")
        log_file = DEBUG_LOGS_DIR / f"ocr_debug_{log_date}.log"

        # Format log entry
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
        log_entry = f"[{timestamp}] {message}\n"

        if data:
            for key, value in data.items():
                log_entry += f"  {key}: {value}\n"

        log_entry += "\n"

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(log_entry)

    except Exception as e:
        print(f"[DEBUG] Failed to write log: {e}")


def preprocess_comic_image(img, profile: str = "default"):
    """
    Preprocess comic image for better OCR accuracy with adaptive profiles.

    Profiles:
    - none: No preprocessing (best for clean handwritten/printed text)
    - minimal: Light grayscale + slight contrast (1.2x) only
    - default: Preserve edges (autocontrast → ~1.4x contrast → unsharp mask; no hard binarization)
    - adaptive: Auto-adjusting threshold for varying lighting (Otsu-like approach)
    - high_contrast: Enhanced contrast (2.5x) for faded/scanned pages
    - low_contrast: Gentler contrast + unsharp mask for high-contrast digital manga (no binarization)
    - denoised: Extra median filtering for noisy/compressed scans
    """
    # Handle "none" profile - return original with just grayscale
    if profile == "none":
        return img.convert('L')

    # Handle "minimal" profile - very light processing
    if profile == "minimal":
        img = img.convert('L')
        enhancer = ImageEnhance.Contrast(img)
        return enhancer.enhance(1.2)  # Barely noticeable contrast boost

    # Convert to grayscale (universal first step)
    img = img.convert('L')

    if profile == "adaptive":
        # Adaptive thresholding for varying lighting
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.8)

        # Convert to numpy array for adaptive processing
        img_array = np.array(img)

        # Simple adaptive threshold: local mean (box filter) with a small offset.
        # Implemented without SciPy to keep OCR working in minimal environments.
        window = 15
        pad = window // 2
        padded = np.pad(img_array.astype(np.float32), ((pad, pad), (pad, pad)), mode="reflect")
        integral = np.pad(padded, ((1, 0), (1, 0)), mode="constant", constant_values=0).cumsum(0).cumsum(1)
        sums = (
            integral[window:, window:]
            - integral[:-window, window:]
            - integral[window:, :-window]
            + integral[:-window, :-window]
        )
        local_mean = sums / float(window * window)
        threshold_map = local_mean - 10.0  # Offset for better text detection
        img_array = (img_array > threshold_map).astype(np.uint8) * 255

        img = Image.fromarray(img_array)
        img = img.filter(ImageFilter.MedianFilter(size=3))

    elif profile == "high_contrast":
        # For faded/scanned pages
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.5)
        img = img.filter(ImageFilter.SHARPEN)
        img = img.point(lambda p: 255 if p > 170 else 0)
        img = img.filter(ImageFilter.MedianFilter(size=3))

    elif profile == "low_contrast":
        # For crisp digital manga
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.25)
        img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=150, threshold=3))

    elif profile == "denoised":
        # Extra denoising for compressed/artifacted images
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.0)
        img = img.filter(ImageFilter.MedianFilter(size=5))
        img = img.filter(ImageFilter.SHARPEN)
        img = img.point(lambda p: 255 if p > 180 else 0)

    else:  # "default"
        # Default: preserve anti-aliased edges; avoid hard binarization unless explicitly requested.
        img = ImageOps.autocontrast(img, cutoff=1)
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.4)
        img = img.filter(ImageFilter.UnsharpMask(radius=1.5, percent=160, threshold=3))

    return img


def _parse_paddle_bbox(bbox_points):
    """
    Parse PaddleOCR bbox output into (x, y, w, h).
    Supports:
      - 4-point polygon: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
      - 2-point rectangle: [[x1,y1],[x2,y2]]
      - 4-number rectangle: [x1,y1,x2,y2]
    """
    if bbox_points is None:
        return None

    # Normalize numpy arrays to plain Python lists
    try:
        if np is not None and isinstance(bbox_points, np.ndarray):
            bbox_points = bbox_points.tolist()
    except Exception:
        pass

    if isinstance(bbox_points, (list, tuple)) and len(bbox_points) == 4 and all(isinstance(v, (int, float)) for v in bbox_points):
        x1, y1, x2, y2 = bbox_points
        x = min(x1, x2)
        y = min(y1, y2)
        w = abs(x2 - x1)
        h = abs(y2 - y1)
        return float(x), float(y), float(w), float(h)

    if not isinstance(bbox_points, (list, tuple)) or len(bbox_points) < 2:
        return None

    points = []
    for p in bbox_points:
        if not isinstance(p, (list, tuple)) or len(p) < 2:
            continue
        x, y = p[0], p[1]
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            continue
        points.append((float(x), float(y)))

    if len(points) < 2:
        return None

    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x = min(xs)
    y = min(ys)
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    return float(x), float(y), float(w), float(h)


def _paddle_lines_from_result(result):
    """
    Normalize PaddleOCR .ocr() output into an iterable of line entries.
    Different PaddleOCR versions/configs may return different nesting levels.
    """
    if result is None:
        return []
    if not isinstance(result, list):
        return []
    if len(result) == 0:
        return []

    # Common case: one image => [ [line, line, ...] ]
    if len(result) == 1 and isinstance(result[0], list):
        return result[0] or []

    # Some versions return directly: [line, line, ...]
    return result


def _iter_paddle_entries(result):
    """
    Yield PaddleOCR detections as (bbox_points, text, confidence).

    Supports both:
      - legacy PaddleOCR format: [ [bbox_points, (text, conf)], ... ]
      - PaddleX OCRResult format: [{'rec_texts': [...], 'rec_scores': [...], 'rec_polys': [...]}, ...]
    """
    if result is None:
        return

    if isinstance(result, list) and result:
        first = result[0]
        if hasattr(first, "get") and callable(getattr(first, "get")):
            rec_texts = first.get("rec_texts")
            rec_scores = first.get("rec_scores")
            rec_polys = first.get("rec_polys") or first.get("dt_polys")
            if isinstance(rec_texts, list) and isinstance(rec_scores, list) and isinstance(rec_polys, list):
                for bbox_points, text, confidence in zip(rec_polys, rec_texts, rec_scores):
                    yield bbox_points, text, confidence
                return

    for line in _paddle_lines_from_result(result):
        if not isinstance(line, (list, tuple)) or len(line) < 2:
            continue

        bbox_points = line[0]
        text_info = line[1]

        if not isinstance(text_info, (list, tuple)) or len(text_info) < 2:
            continue

        yield bbox_points, text_info[0], text_info[1]


def perform_paddleocr_with_stats(img, x_offset=0, y_offset=0, language: str = "en"):
    """
    Perform OCR using PaddleOCR and convert results to OCRTextRegion format.

    Args:
        img: PIL Image object
        x_offset: X offset to add to bounding box coordinates
        y_offset: Y offset to add to bounding box coordinates

    Returns:
        Tuple of (regions, total_extracted) where total_extracted counts all text detections
        prior to confidence filtering.
    """
    # Get PaddleOCR instance (lazy initialization on first use)
    ocr_instance = get_paddle_ocr(language)

    # Convert PIL image to numpy array for PaddleOCR.
    # PaddleOCR can crash on images with alpha channels (e.g. RGBA PNGs), so normalize to RGB.
    if getattr(img, "mode", None) != "RGB":
        img = img.convert("RGB")
    img_np = np.array(img)

    # Run PaddleOCR (text orientation handled by use_textline_orientation init parameter)
    result = ocr_instance.ocr(img_np)

    regions: List[OCRTextRegion] = []

    MIN_CONFIDENCE = 0.15  # Keep consistent with Tesseract's 15% threshold
    total_extracted = 0

    for bbox_points, text, confidence in _iter_paddle_entries(result):

        if not isinstance(text, str):
            continue

        text = text.strip()
        if not text:
            continue

        total_extracted += 1

        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 0.0

        if confidence < MIN_CONFIDENCE:
            continue

        bbox = _parse_paddle_bbox(bbox_points)
        if bbox is None:
            continue

        x, y, w, h = bbox
        x = x + float(x_offset)
        y = y + float(y_offset)

        regions.append(OCRTextRegion(
            text=text,
            bbox=[float(x), float(y), float(w), float(h)],
            confidence=float(confidence),
            confidence_tier=classify_confidence_tier(float(confidence))
        ))

    return regions, total_extracted


def perform_paddleocr(img, x_offset=0, y_offset=0, language: str = "en"):
    regions, _total = perform_paddleocr_with_stats(img, x_offset=x_offset, y_offset=y_offset, language=language)
    return regions


@app.post("/api/manga/extract-text", response_model=MangaOCRResponse)
async def extract_manga_text(request: MangaOCRRequest):
    """
    Extract text with bounding boxes from a manga/comic page image using OCR.

    Args:
        request: MangaOCRRequest with image_path and language

    Returns:
        MangaOCRResponse with OCRTextRegion array containing text and bounding boxes
    """
    requested_engine = (request.ocr_engine or "tesseract").lower()
    engine_used = requested_engine
    fallback_reason = None

    if requested_engine in ("hybrid", "trocr", "easyocr"):
        if PADDLEOCR_AVAILABLE:
            engine_used = "paddleocr"
            fallback_reason = f"{requested_engine} not implemented; using paddleocr"
        elif OCR_AVAILABLE:
            engine_used = "tesseract"
            fallback_reason = f"{requested_engine} not implemented; using tesseract"
        else:
            return MangaOCRResponse(success=False, error="OCR not available. Install pytesseract or paddleocr.")
    elif requested_engine not in ("tesseract", "paddleocr"):
        if PADDLEOCR_AVAILABLE:
            engine_used = "paddleocr"
            fallback_reason = f"Unknown ocr_engine '{requested_engine}'; using paddleocr"
        elif OCR_AVAILABLE:
            engine_used = "tesseract"
            fallback_reason = f"Unknown ocr_engine '{requested_engine}'; using tesseract"
        else:
            return MangaOCRResponse(success=False, error="OCR not available. Install pytesseract or paddleocr.")

    if engine_used == "paddleocr" and not PADDLEOCR_AVAILABLE:
        if OCR_AVAILABLE:
            engine_used = "tesseract"
            fallback_reason = "PaddleOCR not available; using tesseract"
        else:
            return MangaOCRResponse(success=False, error="OCR not available. PaddleOCR not installed and pytesseract unavailable.")

    if engine_used == "tesseract" and not OCR_AVAILABLE:
        if PADDLEOCR_AVAILABLE:
            engine_used = "paddleocr"
            fallback_reason = "Tesseract not available; using paddleocr"
        else:
            return MangaOCRResponse(success=False, error="OCR not available. pytesseract is not installed.")

    image_path = request.image_path

    # Validate file exists
    if not os.path.exists(image_path):
        return MangaOCRResponse(
            success=False,
            error=f"Image file not found: {image_path}"
        )

    try:
        print(f"[Manga OCR] Processing: {os.path.basename(image_path)} (requested={requested_engine}, using={engine_used})")

        # Load image with PIL
        img = Image.open(image_path)

        regions: List[OCRTextRegion] = []
        total_extracted = 0

        if engine_used == "paddleocr":
            try:
                regions, total_extracted = perform_paddleocr_with_stats(img, x_offset=0, y_offset=0, language=request.language)
            except Exception as e:
                log_debug_info("[PaddleOCR] Full-page OCR exception (falling back)", {"error": str(e)})
                if not OCR_AVAILABLE:
                    raise
                engine_used = "tesseract"
                fallback_reason = f"PaddleOCR failed: {str(e)}; using tesseract"

        if engine_used == "tesseract":
            # Get Tesseract language code
            tess_lang = TESSERACT_LANGS.get(request.language, "eng")

            # Preprocess image with selected profile
            preprocessed = preprocess_comic_image(img, request.preprocessing_profile)

            # PSM mode mapping for Tesseract
            PSM_MODES = {
                'sparse': 11,   # Sparse text with OSD (current default)
                'dense': 6,     # Uniform block of text
                'auto': 3,      # Fully automatic
                'vertical': 4   # Single column (for vertical manga)
            }
            psm_value = PSM_MODES.get(request.psm_mode, 11)

            # Run OCR with dynamic PSM mode
            ocr_data = pytesseract.image_to_data(
                preprocessed,
                lang=tess_lang,
                output_type=pytesseract.Output.DICT,
                config=f'--psm {psm_value} --oem 3'
            )

            MIN_CONFIDENCE = 15  # Lowered from 30 to capture more partial text
            total_extracted = len(ocr_data["text"])

            for i in range(total_extracted):
                text = ocr_data["text"][i].strip()
                try:
                    conf = float(ocr_data["conf"][i])
                except (TypeError, ValueError):
                    conf = -1

                # Skip empty text or very low confidence
                if not text or conf < MIN_CONFIDENCE:
                    continue

                # Extract bounding box coordinates
                x = float(ocr_data["left"][i])
                y = float(ocr_data["top"][i])
                w = float(ocr_data["width"][i])
                h = float(ocr_data["height"][i])

                # Normalize confidence to 0-1 range
                confidence = conf / 100.0

                regions.append(OCRTextRegion(
                    text=text,
                    bbox=[x, y, w, h],
                    confidence=confidence,
                    confidence_tier=classify_confidence_tier(confidence)
                ))

        # Calculate metadata
        filtered_count = len(regions)
        filtered_out = total_extracted - filtered_count
        confidence_stats = calculate_confidence_stats(regions)

        metadata = {
            'confidence_stats': confidence_stats,
            'ocr_engine': engine_used,
            'ocr_engine_requested': requested_engine,
            'ocr_engine_used': engine_used,
            'fallback_reason': fallback_reason,
            'preprocessing_profile': request.preprocessing_profile,
            'psm_mode': request.psm_mode,
            'total_extracted': total_extracted,
            'filtered_count': filtered_count,
            'filtered_out': filtered_out
        }

        print(f"[Manga OCR] Extracted {total_extracted} regions, kept {filtered_count} (filtered {filtered_out})")
        print(f"[Manga OCR] Confidence: avg={confidence_stats['avg']:.2f}, range={confidence_stats['min']:.2f}-{confidence_stats['max']:.2f}")

        return MangaOCRResponse(
            success=True,
            regions=regions,
            metadata=metadata
        )

    except Exception as e:
        print(f"[Manga OCR] Failed: {e}")
        return MangaOCRResponse(
            success=False,
            error=f"OCR extraction failed: {str(e)}"
        )


@app.post("/api/manga/extract-text-region", response_model=MangaOCRResponse)
async def extract_manga_text_region(request: MangaOCRRegionRequest):
    """
    Extract text from a specific region of a manga/comic page image.
    """
    requested_engine = (request.ocr_engine or "tesseract").lower()
    engine_used = requested_engine
    fallback_reason = None

    if requested_engine in ("hybrid", "trocr", "easyocr"):
        if PADDLEOCR_AVAILABLE:
            engine_used = "paddleocr"
            fallback_reason = f"{requested_engine} not implemented; using paddleocr"
        elif OCR_AVAILABLE:
            engine_used = "tesseract"
            fallback_reason = f"{requested_engine} not implemented; using tesseract"
        else:
            return MangaOCRResponse(success=False, error="OCR not available. Install pytesseract or paddleocr.")
    elif requested_engine not in ("tesseract", "paddleocr"):
        if PADDLEOCR_AVAILABLE:
            engine_used = "paddleocr"
            fallback_reason = f"Unknown ocr_engine '{requested_engine}'; using paddleocr"
        elif OCR_AVAILABLE:
            engine_used = "tesseract"
            fallback_reason = f"Unknown ocr_engine '{requested_engine}'; using tesseract"
        else:
            return MangaOCRResponse(success=False, error="OCR not available. Install pytesseract or paddleocr.")

    if engine_used == "paddleocr" and not PADDLEOCR_AVAILABLE:
        if OCR_AVAILABLE:
            engine_used = "tesseract"
            fallback_reason = "PaddleOCR not available; using tesseract"
        else:
            return MangaOCRResponse(success=False, error="OCR not available. PaddleOCR not installed and pytesseract unavailable.")

    if engine_used == "tesseract" and not OCR_AVAILABLE:
        if PADDLEOCR_AVAILABLE:
            engine_used = "paddleocr"
            fallback_reason = "Tesseract not available; using paddleocr"
        else:
            return MangaOCRResponse(success=False, error="OCR not available. pytesseract is not installed.")

    image_path = request.image_path

    if not os.path.exists(image_path):
        return MangaOCRResponse(
            success=False,
            error=f"Image file not found: {image_path}"
        )

    if not request.region or len(request.region) != 4:
        return MangaOCRResponse(
            success=False,
            error="Invalid region. Expected [x, y, width, height]."
        )

    try:
        img = Image.open(image_path)
        img_width, img_height = img.size

        x, y, w, h = request.region
        x = int(max(0, x))
        y = int(max(0, y))
        w = int(w)
        h = int(h)

        if x >= img_width or y >= img_height:
            return MangaOCRResponse(success=True, regions=[])

        w = max(1, min(w, img_width - x))
        h = max(1, min(h, img_height - y))

        if w <= 1 or h <= 1:
            return MangaOCRResponse(success=True, regions=[])

        cropped = img.crop((x, y, x + w, y + h))

        # DEBUG: Save original cropped region
        log_debug_info("OCR Rectangle Selection", {
            "image_path": os.path.basename(image_path),
            "region": f"x={x}, y={y}, w={w}, h={h}",
            "cropped_size": f"{cropped.size[0]}x{cropped.size[1]}",
            "ocr_engine": request.ocr_engine,
            "preprocessing_profile": request.preprocessing_profile,
            "psm_mode": request.psm_mode,
            "language": request.language
        })
        save_debug_image(cropped, "01_original_crop")

        regions: List[OCRTextRegion] = []
        total_extracted = 0
        MIN_CONFIDENCE = 15  # Only used for Tesseract debug filtering below
        ocr_data = None

        # Route to the selected OCR engine
        if engine_used == "paddleocr":
            try:
                regions, total_extracted = perform_paddleocr_with_stats(cropped, x_offset=x, y_offset=y, language=request.language)
            except Exception as e:
                log_debug_info("[PaddleOCR] Region OCR exception (falling back)", {"error": str(e)})
                if not OCR_AVAILABLE:
                    raise
                engine_used = "tesseract"
                fallback_reason = f"PaddleOCR failed: {str(e)}; using tesseract"

        if engine_used == "tesseract":
            tess_lang = TESSERACT_LANGS.get(request.language, "eng")
            preprocessed = preprocess_comic_image(cropped, request.preprocessing_profile)

            # DEBUG: Save preprocessed image (what Tesseract sees)
            save_debug_image(preprocessed, "02_preprocessed", request.preprocessing_profile)

            # PSM mode mapping for Tesseract
            PSM_MODES = {
                'sparse': 11,   # Sparse text with OSD
                'dense': 6,     # Uniform block of text
                'auto': 3,      # Fully automatic
                'vertical': 4   # Single column (for vertical manga)
            }
            psm_value = PSM_MODES.get(request.psm_mode, 11)

            ocr_data = pytesseract.image_to_data(
                preprocessed,
                lang=tess_lang,
                output_type=pytesseract.Output.DICT,
                config=f'--psm {psm_value} --oem 3'
            )

            MIN_CONFIDENCE = 15  # Lowered from 30 to capture more partial text
            total_extracted = len(ocr_data["text"])

            for i in range(total_extracted):
                text = ocr_data["text"][i].strip()
                try:
                    conf = float(ocr_data["conf"][i])
                except (TypeError, ValueError):
                    conf = -1

                if not text or conf < MIN_CONFIDENCE:
                    continue

                region_x = float(ocr_data["left"][i]) + x
                region_y = float(ocr_data["top"][i]) + y
                region_w = float(ocr_data["width"][i])
                region_h = float(ocr_data["height"][i])
                confidence = conf / 100.0

                regions.append(OCRTextRegion(
                    text=text,
                    bbox=[region_x, region_y, region_w, region_h],
                    confidence=confidence,
                    confidence_tier=classify_confidence_tier(confidence)
                ))

        # Calculate metadata
        filtered_count = len(regions)
        filtered_out = total_extracted - filtered_count
        confidence_stats = calculate_confidence_stats(regions)

        metadata = {
            'confidence_stats': confidence_stats,
            'ocr_engine': engine_used,
            'ocr_engine_requested': requested_engine,
            'ocr_engine_used': engine_used,
            'fallback_reason': fallback_reason,
            'preprocessing_profile': request.preprocessing_profile,
            'psm_mode': request.psm_mode,
            'total_extracted': total_extracted,
            'filtered_count': filtered_count,
            'filtered_out': filtered_out
        }

        # DEBUG: Log detailed OCR results
        all_detections = []
        if engine_used == "tesseract" and ocr_data:
            for i in range(total_extracted):
                text = ocr_data["text"][i].strip()
                try:
                    conf = float(ocr_data["conf"][i])
                except (TypeError, ValueError):
                    conf = -1

                if text:  # Log all text detections, even filtered ones
                    status = "✅ KEPT" if conf >= MIN_CONFIDENCE else "❌ FILTERED"
                    tier = classify_confidence_tier(conf / 100.0) if conf >= 0 else "invalid"
                    all_detections.append(f"{status} [{tier:6s}] {conf:5.1f}% | {text}")
        elif engine_used == "paddleocr":
            for r in regions:
                conf_pct = r.confidence * 100.0
                tier = r.confidence_tier or classify_confidence_tier(r.confidence)
                all_detections.append(f"✅ KEPT [{tier:6s}] {conf_pct:5.1f}% | {r.text}")

        log_debug_info("OCR Results", {
            "total_detections": total_extracted,
            "kept": filtered_count,
            "filtered_out": filtered_out,
            "confidence_min": f"{confidence_stats['min']*100:.1f}%" if regions else "N/A",
            "confidence_max": f"{confidence_stats['max']*100:.1f}%" if regions else "N/A",
            "confidence_avg": f"{confidence_stats['avg']*100:.1f}%" if regions else "N/A",
            "distribution_high": confidence_stats['distribution']['high'] if regions else 0,
            "distribution_medium": confidence_stats['distribution']['medium'] if regions else 0,
            "distribution_low": confidence_stats['distribution']['low'] if regions else 0,
            "all_text_detections": "\n    " + "\n    ".join(all_detections) if all_detections else "None"
        })

        print(f"[Manga OCR] Region OCR extracted {total_extracted} regions, kept {filtered_count} (filtered {filtered_out})")
        return MangaOCRResponse(success=True, regions=regions, metadata=metadata)

    except Exception as e:
        print(f"[Manga OCR] Region OCR failed: {e}")
        return MangaOCRResponse(
            success=False,
            error=f"OCR region extraction failed: {str(e)}"
        )

# Main entry point
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", DEFAULT_PORT))
    print(f"Starting BookReader Pronunciation Server on port {port}...")

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info"
    )
