#!/usr/bin/env python3
"""
Download Piper TTS voice models for offline use.
Run this once to set up the models directory.
"""
import os
import sys
from pathlib import Path
import urllib.request
from typing import Dict

MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Model download URLs (from Piper releases)
VOICE_MODELS = {
    "en_US-lessac-medium": {
        "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
    },
    "de_DE-thorsten-medium": {
        "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json",
    },
    "ru_RU-dmitri-medium": {
        "model_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx.json",
    },
}

def download_file(url: str, destination: Path):
    """Download file with progress."""
    print(f"Downloading: {destination.name}")
    try:
        urllib.request.urlretrieve(url, destination)
        size_mb = destination.stat().st_size / (1024 * 1024)
        print(f"  ✓ Downloaded {size_mb:.1f} MB")
    except Exception as e:
        print(f"  ✗ Failed: {e}")
        raise

def check_existing_models() -> Dict[str, bool]:
    """Check which models already exist."""
    existing = {}
    for voice_name in VOICE_MODELS.keys():
        model_file = MODELS_DIR / f"{voice_name}.onnx"
        config_file = MODELS_DIR / f"{voice_name}.onnx.json"
        existing[voice_name] = model_file.exists() and config_file.exists()
    return existing

def main():
    """Download all voice models."""
    print("Piper TTS Model Downloader")
    print("=" * 50)

    # Check existing models
    existing = check_existing_models()
    existing_count = sum(existing.values())
    total_count = len(VOICE_MODELS)

    print(f"\nModels directory: {MODELS_DIR.absolute()}")
    print(f"Status: {existing_count}/{total_count} models present")

    if existing_count == total_count:
        print("\n✓ All models already downloaded!")
        print("\nTo re-download, delete the models directory and run again:")
        print(f"  rm -rf {MODELS_DIR}")
        print(f"  python {Path(__file__).name}")
        return 0

    # Show what will be downloaded
    to_download = [name for name, exists in existing.items() if not exists]
    if to_download:
        print(f"\nWill download {len(to_download)} model(s):")
        for name in to_download:
            print(f"  - {name}")
        print(f"\nTotal download size: ~{len(to_download) * 60} MB")
        print()

    downloaded = 0
    failed = 0

    for voice_name, urls in VOICE_MODELS.items():
        if existing[voice_name]:
            print(f"\n✓ {voice_name}: Already present (skipping)")
            continue

        print(f"\n{voice_name}:")

        model_file = MODELS_DIR / f"{voice_name}.onnx"
        config_file = MODELS_DIR / f"{voice_name}.onnx.json"

        try:
            # Download model
            if not model_file.exists():
                download_file(urls["model_url"], model_file)

            # Download config
            if not config_file.exists():
                download_file(urls["config_url"], config_file)

            downloaded += 1

        except Exception as e:
            print(f"  ✗ Failed to download {voice_name}: {e}")
            failed += 1
            # Clean up partial downloads
            if model_file.exists():
                model_file.unlink()
            if config_file.exists():
                config_file.unlink()

    print("\n" + "=" * 50)
    if failed == 0:
        print(f"✓ Successfully downloaded {downloaded} model(s)!")
        print(f"Models location: {MODELS_DIR.absolute()}")
        return 0
    else:
        print(f"⚠ Downloaded {downloaded} model(s), {failed} failed")
        print("Please check your internet connection and try again.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
