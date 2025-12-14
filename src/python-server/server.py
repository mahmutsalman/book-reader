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

from generators.tts import generate_audio
from generators.ipa import generate_ipa

# PDF processing imports (lazy loaded to handle missing dependencies)
try:
    import fitz  # PyMuPDF
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    fitz = None

try:
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False
    pytesseract = None
    Image = None

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
