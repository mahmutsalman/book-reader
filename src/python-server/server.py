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
from typing import Optional, List, Dict
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
    from PIL import Image, ImageEnhance, ImageFilter
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    pytesseract = None
    Image = None
    ImageEnhance = None
    ImageFilter = None

# Server configuration
VERSION = "1.0.0"
DEFAULT_PORT = 8766

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


class MangaOCRRequest(BaseModel):
    image_path: str
    language: str = "en"


class MangaOCRResponse(BaseModel):
    success: bool
    regions: List[OCRTextRegion] = []
    error: Optional[str] = None


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


def preprocess_comic_image(img):
    """
    Preprocess comic image for better OCR accuracy.
    Optimized for English comics with speech bubbles.
    """
    # Convert to grayscale to reduce color noise.
    img = img.convert('L')

    # Boost contrast to make text stand out.
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)

    # Sharpen text edges.
    img = img.filter(ImageFilter.SHARPEN)

    # Binary threshold for darker text on light backgrounds.
    threshold = 180
    img = img.point(lambda p: 255 if p > threshold else 0)

    # Denoise small artifacts.
    img = img.filter(ImageFilter.MedianFilter(size=3))

    return img


@app.post("/api/manga/extract-text", response_model=MangaOCRResponse)
async def extract_manga_text(request: MangaOCRRequest):
    """
    Extract text with bounding boxes from a manga/comic page image using OCR.

    Args:
        request: MangaOCRRequest with image_path and language

    Returns:
        MangaOCRResponse with OCRTextRegion array containing text and bounding boxes
    """
    if not OCR_AVAILABLE:
        return MangaOCRResponse(
            success=False,
            error="OCR not available. pytesseract is not installed."
        )

    image_path = request.image_path

    # Validate file exists
    if not os.path.exists(image_path):
        return MangaOCRResponse(
            success=False,
            error=f"Image file not found: {image_path}"
        )

    try:
        print(f"[Manga OCR] Processing: {os.path.basename(image_path)}")

        # Load image with PIL
        img = Image.open(image_path)

        # Get Tesseract language code
        tess_lang = TESSERACT_LANGS.get(request.language, "eng")

        # Preprocess image to improve OCR accuracy.
        preprocessed = preprocess_comic_image(img)

        # Run OCR with bounding box data optimized for sparse comic text.
        ocr_data = pytesseract.image_to_data(
            preprocessed,
            lang=tess_lang,
            output_type=pytesseract.Output.DICT,
            config='--psm 11 --oem 3'
        )

        # Parse OCR results into regions
        regions: List[OCRTextRegion] = []

        MIN_CONFIDENCE = 30
        total_extracted = len(ocr_data["text"])

        for i in range(total_extracted):
            text = ocr_data["text"][i].strip()
            try:
                conf = float(ocr_data["conf"][i])
            except (TypeError, ValueError):
                conf = -1

            # Skip empty text or low confidence.
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
                confidence=confidence
            ))

        filtered_count = len(regions)
        filtered_out = total_extracted - filtered_count
        print(f"[Manga OCR] Extracted {total_extracted} regions, kept {filtered_count} (filtered {filtered_out} low-confidence)")

        return MangaOCRResponse(
            success=True,
            regions=regions
        )

    except Exception as e:
        print(f"[Manga OCR] Failed: {e}")
        return MangaOCRResponse(
            success=False,
            error=f"OCR extraction failed: {str(e)}"
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
