"""Text-to-Speech generator using Edge TTS (Microsoft Neural Voices)."""
import asyncio
import base64
import tempfile
import os
from typing import Optional

import edge_tts

# Voice mapping for supported languages
VOICES = {
    "en": "en-US-GuyNeural",      # American English, male
    "de": "de-DE-ConradNeural",   # German, male
    "ru": "ru-RU-DmitryNeural",   # Russian, male
}

# Alternative voices (for future expansion)
VOICE_ALTERNATIVES = {
    "en": [
        "en-US-JennyNeural",       # Female
        "en-US-AriaNeural",        # Conversational
        "en-GB-RyanNeural",        # British male
    ],
    "de": [
        "de-DE-KatjaNeural",       # Female
        "de-AT-JonasNeural",       # Austrian
    ],
    "ru": [
        "ru-RU-SvetlanaNeural",    # Female
    ],
}


async def generate_audio(text: str, language: str = "en") -> Optional[str]:
    """
    Generate MP3 audio from text using Edge TTS.

    Args:
        text: Text to synthesize (words, phrases, or sentences)
        language: Language code ('en', 'de', 'ru')

    Returns:
        Base64-encoded MP3 audio string, or None if generation fails
    """
    if not text or not text.strip():
        return None

    # Get voice for language, default to English
    voice = VOICES.get(language, VOICES["en"])

    # Create a temporary file for the audio
    temp_file = None
    try:
        # Create temp file with .mp3 extension
        fd, temp_file = tempfile.mkstemp(suffix='.mp3')
        os.close(fd)

        # Generate audio using Edge TTS
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(temp_file)

        # Read the audio file and encode to base64
        with open(temp_file, 'rb') as f:
            audio_data = f.read()

        if not audio_data:
            return None

        return base64.b64encode(audio_data).decode('utf-8')

    except Exception as e:
        print(f"[TTS] Error generating audio: {e}")
        return None

    finally:
        # Clean up temp file
        if temp_file and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass


def generate_audio_sync(text: str, language: str = "en") -> Optional[str]:
    """
    Synchronous wrapper for generate_audio.

    Args:
        text: Text to synthesize
        language: Language code

    Returns:
        Base64-encoded MP3 audio string, or None if generation fails
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
        with open("test_audio.mp3", "wb") as f:
            f.write(base64.b64decode(result))
        print("Saved to test_audio.mp3")
    else:
        print("Failed to generate audio")
