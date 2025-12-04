"""IPA transcription generator using gruut."""
from typing import Optional

# Lazy load gruut to improve startup time
_gruut_loaded = False
_sentences_func = None


def _ensure_gruut_loaded():
    """Lazy load gruut module."""
    global _gruut_loaded, _sentences_func

    if not _gruut_loaded:
        try:
            from gruut import sentences
            _sentences_func = sentences
            _gruut_loaded = True
        except ImportError as e:
            print(f"[IPA] Failed to import gruut: {e}")
            raise


def generate_ipa(text: str, language: str = "en") -> Optional[str]:
    """
    Generate IPA transcription for text using gruut.

    Args:
        text: Text to transcribe (words, phrases, or sentences)
        language: Language code ('en', 'de', 'ru')

    Returns:
        IPA transcription string (e.g., "/h ə l oʊ/"), or None if generation fails
    """
    if not text or not text.strip():
        print(f"[IPA] Empty text, returning None")
        return None

    try:
        _ensure_gruut_loaded()

        # Map language codes to gruut language codes
        lang_map = {
            "en": "en-us",
            "de": "de-de",
            "ru": "ru-ru",
            "fr": "fr-fr",
            "es": "es-es",
            "it": "it-it",
        }
        gruut_lang = lang_map.get(language, "en-us")
        print(f"[IPA] Using gruut language: {gruut_lang} for input language: {language}")

        # Generate phonemes using gruut
        phonemes = []
        for sent in _sentences_func(text, lang=gruut_lang):
            for word in sent:
                print(f"[IPA] Word: '{word.text}' -> phonemes: {word.phonemes}")
                if word.phonemes:
                    phonemes.extend(word.phonemes)

        if not phonemes:
            print(f"[IPA] No phonemes generated for '{text}'")
            return None

        # Format as IPA string
        ipa_string = ' '.join(phonemes)
        print(f"[IPA] Final IPA: {ipa_string}")
        return ipa_string

    except Exception as e:
        import traceback
        print(f"[IPA] Error generating IPA: {e}")
        print(f"[IPA] Traceback: {traceback.format_exc()}")
        return None


def generate_syllables(text: str, language: str = "en") -> Optional[str]:
    """
    Generate syllable breakdown for a word.

    Note: gruut doesn't provide syllable boundaries directly,
    so this is a basic implementation that may not be 100% accurate.
    For production, consider using a dedicated syllabification library.

    Args:
        text: Word to syllabify
        language: Language code

    Returns:
        Syllable breakdown with dots (e.g., "hel·lo"), or None if generation fails
    """
    # This is a placeholder - gruut doesn't provide syllables
    # The AI fallback can handle syllables better
    # For now, return None and let the AI handle it
    return None


# For testing
if __name__ == "__main__":
    import sys

    test_text = sys.argv[1] if len(sys.argv) > 1 else "hello"
    test_lang = sys.argv[2] if len(sys.argv) > 2 else "en"

    print(f"Generating IPA for: '{test_text}' ({test_lang})")
    result = generate_ipa(test_text, test_lang)

    if result:
        print(f"IPA: /{result}/")
    else:
        print("Failed to generate IPA")
