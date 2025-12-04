"""
FastAPI Pronunciation Server for BookReader.

Provides TTS (Text-to-Speech) and IPA transcription services.
Uses Edge TTS for neural voice synthesis and gruut for IPA generation.

Default port: 8766
"""
import os
import asyncio
import subprocess
import sys
from typing import Optional, List, Dict

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from generators.tts import generate_audio
from generators.ipa import generate_ipa

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
    Generate audio from text.

    Args:
        request: TTSRequest with text and language

    Returns:
        TTSResponse with base64-encoded MP3 audio
    """
    if not request.text or not request.text.strip():
        return TTSResponse(
            success=False,
            error="Text is required"
        )

    try:
        print(f"[Server TTS] Received request: language={request.language}, text={request.text[:50]}...")
        audio_base64 = await generate_audio(request.text, request.language)

        if audio_base64:
            return TTSResponse(
                success=True,
                audio_base64=audio_base64,
                format="mp3"
            )
        else:
            return TTSResponse(
                success=False,
                error="Failed to generate audio"
            )

    except Exception as e:
        return TTSResponse(
            success=False,
            error=str(e)
        )


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
