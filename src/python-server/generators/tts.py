"""Text-to-Speech generator using Piper TTS (Offline Neural Voices)."""
import asyncio
import base64
import tempfile
import os
import wave
from typing import Optional
from pathlib import Path
import sys

# Set espeak data path BEFORE importing piper
# Handles both development (venv) and production (PyInstaller bundle)
try:
    # Check if running in PyInstaller bundle
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        # Production: PyInstaller bundle
        base_path = Path(sys._MEIPASS)
        espeak_path = base_path / "piper" / "espeak-ng-data"

        if espeak_path.exists():
            os.environ['ESPEAK_DATA_PATH'] = str(espeak_path)
            print(f"[TTS] Production - ESPEAK_DATA_PATH: {espeak_path}")
        else:
            print(f"[TTS] ERROR: espeak-ng-data not found in bundle: {espeak_path}")
    else:
        # Development: Use venv
        import site
        site_packages = site.getsitepackages()

        espeak_found = False
        for sp in site_packages:
            espeak_path = Path(sp) / "piper" / "espeak-ng-data"
            if espeak_path.exists():
                os.environ['ESPEAK_DATA_PATH'] = str(espeak_path)
                print(f"[TTS] Development - ESPEAK_DATA_PATH: {espeak_path}")
                espeak_found = True
                break

        if not espeak_found:
            print(f"[TTS] ERROR: espeak-ng-data not found in site-packages")

except Exception as e:
    print(f"[TTS] ERROR setting ESPEAK_DATA_PATH: {e}")
    import traceback
    traceback.print_exc()

# Now import piper after setting environment variable
from piper import PiperVoice

# Model directory - handles both development and production
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    # Production: PyInstaller bundle
    MODELS_DIR = Path(sys._MEIPASS) / "models"
else:
    # Development: Relative to this file
    MODELS_DIR = Path(__file__).parent.parent / "models"

print(f"[TTS] Models directory: {MODELS_DIR}")

# Voice model mapping
VOICE_MODELS = {
    "en": {
        "model": "en_US-lessac-medium.onnx",
        "config": "en_US-lessac-medium.onnx.json",
        "name": "English (US) - Lessac"
    },
    "de": {
        "model": "de_DE-thorsten-medium.onnx",
        "config": "de_DE-thorsten-medium.onnx.json",
        "name": "German - Thorsten"
    },
    "ru": {
        "model": "ru_RU-dmitri-medium.onnx",
        "config": "ru_RU-dmitri-medium.onnx.json",
        "name": "Russian - Dmitri"
    },
}

# Cache loaded voices for performance
_voice_cache = {}


def get_voice(language: str) -> Optional[PiperVoice]:
    """
    Load or retrieve cached Piper voice for language.

    Args:
        language: Language code ('en', 'de', 'ru')

    Returns:
        PiperVoice instance or None if model not found
    """
    # Check cache first
    if language in _voice_cache:
        return _voice_cache[language]

    # Get model info, fallback to English
    voice_info = VOICE_MODELS.get(language, VOICE_MODELS["en"])

    model_path = MODELS_DIR / voice_info["model"]
    config_path = MODELS_DIR / voice_info["config"]

    # Verify model files exist
    if not model_path.exists():
        print(f"[TTS] Error: Model not found: {model_path}")
        print(f"[TTS] Please run: python download_models.py")
        return None

    if not config_path.exists():
        print(f"[TTS] Warning: Config not found: {config_path}, using defaults")
        config_path = None

    try:
        # Load voice model
        print(f"[TTS] Loading voice: {voice_info['name']} from {model_path.name}")
        voice = PiperVoice.load(str(model_path), config_path=str(config_path) if config_path else None)

        # Cache for future use
        _voice_cache[language] = voice
        print(f"[TTS] Voice loaded and cached: {language}")

        return voice

    except Exception as e:
        error_type = type(e).__name__
        print(f"[TTS] Error loading voice ({error_type}): {e}")
        import traceback
        traceback.print_exc()
        return None


async def generate_audio(text: str, language: str = "en") -> Optional[str]:
    """
    Generate WAV audio with Piper TTS (offline).

    Args:
        text: Text to synthesize (words, phrases, or sentences)
        language: Language code ('en', 'de', 'ru')

    Returns:
        Base64-encoded WAV audio string, or None if generation fails
    """
    if not text or not text.strip():
        print("[TTS] Error: Empty text provided")
        return None

    temp_file = None

    try:
        # Get voice for language
        voice = get_voice(language)
        if voice is None:
            print(f"[TTS] Error: Could not load voice for language: {language}")
            return None

        # Create temp file for WAV output
        fd, temp_file = tempfile.mkstemp(suffix='.wav')
        os.close(fd)

        text_preview = text[:50] + '...' if len(text) > 50 else text
        print(f"[TTS] Generating: text='{text_preview}' lang={language}")

        # Generate audio with Piper
        audio_chunks = list(voice.synthesize(text))

        if not audio_chunks:
            print("[TTS] Error: No audio chunks generated")
            return None

        # Get first chunk for format info
        first_chunk = audio_chunks[0]

        # Collect all audio bytes
        all_audio_bytes = b''.join(chunk.audio_int16_bytes for chunk in audio_chunks)

        # Write WAV file with proper headers
        with wave.open(temp_file, 'wb') as wav_file:
            wav_file.setnchannels(first_chunk.sample_channels)
            wav_file.setsampwidth(first_chunk.sample_width)
            wav_file.setframerate(first_chunk.sample_rate)
            wav_file.writeframes(all_audio_bytes)

        # Verify file was created and has content
        if not os.path.exists(temp_file):
            print(f"[TTS] Error: Temp file not created")
            return None

        file_size = os.path.getsize(temp_file)
        if file_size == 0:
            print(f"[TTS] Error: Generated file is empty")
            return None

        print(f"[TTS] Generated audio: {file_size} bytes ({first_chunk.sample_rate}Hz, {first_chunk.sample_width*8}bit, {first_chunk.sample_channels}ch)")

        # Read WAV file and encode to base64
        with open(temp_file, 'rb') as f:
            audio_data = f.read()

        if not audio_data:
            print(f"[TTS] Error: Could not read audio data")
            return None

        base64_data = base64.b64encode(audio_data).decode('utf-8')
        print(f"[TTS] Success: Encoded to base64 ({len(base64_data)} chars)")
        return base64_data

    except Exception as e:
        error_type = type(e).__name__
        print(f"[TTS] Error ({error_type}): {e}")
        import traceback
        traceback.print_exc()
        return None

    finally:
        # Clean up temp file
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception as e:
                print(f"[TTS] Warning: Could not remove temp file: {e}")


def generate_audio_sync(text: str, language: str = "en") -> Optional[str]:
    """
    Synchronous wrapper for generate_audio.

    Args:
        text: Text to synthesize
        language: Language code

    Returns:
        Base64-encoded audio string, or None if generation fails
    """
    return asyncio.run(generate_audio(text, language))


# For testing
if __name__ == "__main__":
    import sys

    test_text = sys.argv[1] if len(sys.argv) > 1 else "Hello, world!"
    test_lang = sys.argv[2] if len(sys.argv) > 2 else "en"

    print(f"Generating audio for: '{test_text}' ({test_lang})")
    result = generate_audio_sync(test_text, test_lang)

    if result:
        print(f"Success! Base64 length: {len(result)}")
        # Optionally save to file for testing
        with open("test_audio.wav", "wb") as f:
            f.write(base64.b64decode(result))
        print("Saved to test_audio.wav")
    else:
        print("Failed to generate audio")
