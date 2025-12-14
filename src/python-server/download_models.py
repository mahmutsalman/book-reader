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

def main():
    """Download all voice models."""
    print("Piper TTS Model Downloader")
    print("=" * 50)

    for voice_name, urls in VOICE_MODELS.items():
        print(f"\n{voice_name}:")

        model_file = MODELS_DIR / f"{voice_name}.onnx"
        config_file = MODELS_DIR / f"{voice_name}.onnx.json"

        # Download model
        if model_file.exists():
            print(f"  Model already exists: {model_file.name}")
        else:
            download_file(urls["model_url"], model_file)

        # Download config
        if config_file.exists():
            print(f"  Config already exists: {config_file.name}")
        else:
            download_file(urls["config_url"], config_file)

    print("\n" + "=" * 50)
    print("✓ All models downloaded successfully!")
    print(f"Models location: {MODELS_DIR.absolute()}")

if __name__ == "__main__":
    main()
