#!/usr/bin/env python3
"""
Standalone test script to verify Edge TTS works.
Run this to test if the issue is with Edge TTS or your app.
"""
import asyncio
import edge_tts

async def test_edge_tts():
    """Test Edge TTS with different voices."""
    test_text = "Hello, this is a test."

    # Test different voices
    voices_to_test = [
        ("en-US-GuyNeural", "US Male"),
        ("en-US-JennyNeural", "US Female"),
        ("en-GB-RyanNeural", "UK Male"),
    ]

    print("Testing Edge TTS...")
    print(f"Text: '{test_text}'")
    print("-" * 50)

    for voice, description in voices_to_test:
        print(f"\nTesting {description} ({voice})...")
        try:
            communicate = edge_tts.Communicate(test_text, voice)
            output_file = f"test_{voice}.mp3"

            await communicate.save(output_file)
            print(f"✅ SUCCESS! Saved to {output_file}")

            # Try to get file size
            import os
            if os.path.exists(output_file):
                size = os.path.getsize(output_file)
                print(f"   File size: {size} bytes")
                # Clean up
                os.remove(output_file)

        except Exception as e:
            print(f"❌ FAILED: {type(e).__name__}: {e}")

    print("\n" + "=" * 50)
    print("Edge TTS version:", edge_tts.__version__ if hasattr(edge_tts, '__version__') else "Unknown")

if __name__ == "__main__":
    asyncio.run(test_edge_tts())
