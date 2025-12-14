# Smart Book Reader

A smart book reader application with dynamic text wrapping, AI-powered word lookup, offline pronunciation audio, and vocabulary tracking.

## Features

- **Dynamic Text Wrapping**: Automatic text reflow and hyphenation for optimal reading
- **AI Word Lookup**: Instant definitions, translations, and word context using Claude AI
- **Offline Pronunciation**: Neural text-to-speech in English, German, and Russian (no internet required)
- **Vocabulary Tracking**: Track learned words and build your vocabulary
- **Multi-Format Support**: EPUB, PDF, and text files
- **Adaptive Themes**: Multiple reading themes with automatic adjustment

## Prerequisites

- **Node.js** 18 or higher
- **Python** 3.9 or higher
- **npm** or **yarn**

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/BookReader.git
cd BookReader
npm install
```

### 2. Python Server Setup

The app includes an offline pronunciation server that requires voice models:

```bash
npm run python:setup
```

This will:
- Create a Python virtual environment
- Install Python dependencies
- **Prompt you to download voice models** (~180MB for all 3 languages)

> **Note:** Voice models are optional but required for pronunciation features. The app works without them, but pronunciation buttons will be disabled.

### 3. Run the App

```bash
npm start
```

## Development

### Project Structure

```
BookReader/
├── src/
│   ├── main/              # Electron main process
│   ├── renderer/          # React frontend
│   ├── python-server/     # Python pronunciation server
│   │   ├── server.py      # FastAPI server
│   │   ├── generators/    # TTS and IPA generators
│   │   ├── models/        # Piper TTS voice models (downloaded separately)
│   │   └── build.sh       # Python server build script
│   └── shared/            # Shared TypeScript types
├── package.json
└── README.md
```

### Available Scripts

```bash
# Development
npm start                  # Start in development mode
npm run lint               # Run ESLint

# Python Server
npm run python:setup       # Setup Python environment (dev mode)
npm run python:build       # Build production binary (macOS/Linux)
npm run python:build:win   # Build production binary (Windows)

# Production
npm run package            # Package app for current platform
npm run make               # Create distributable packages
```

### Python Server Development

The pronunciation server uses:
- **Piper TTS**: Offline neural text-to-speech
- **gruut**: IPA (phonetic) transcription
- **FastAPI**: REST API server

**Setup for Python development:**

```bash
cd src/python-server

# Activate virtual environment
source venv/bin/activate  # macOS/Linux
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Download voice models (if not already downloaded)
python download_models.py

# Run development server
python server.py
```

**API Endpoints:**
- `GET /health` - Health check
- `POST /api/tts` - Generate pronunciation audio (text → base64 WAV)
- `POST /api/ipa` - Get IPA phonetic transcription

## Voice Models

The app uses **Piper TTS** for offline pronunciation. Voice models are downloaded from HuggingFace.

### Included Languages

- **English (US)** - Lessac voice (~60MB)
- **German** - Thorsten voice (~60MB)
- **Russian** - Dmitri voice (~60MB)

### Manual Download

If automatic download fails or you skipped it:

```bash
cd src/python-server
python download_models.py
```

### Model Storage

- **Development**: `src/python-server/models/`
- **Production**: Bundled into the PyInstaller executable

Models are cached in memory after first load for performance.

## Building for Production

### macOS/Linux

```bash
# Build Python server binary
npm run python:build

# Package Electron app
npm run package

# Create distributable
npm run make
```

### Windows

```bash
# Build Python server binary
npm run python:build:win

# Package and distribute
npm run package
npm run make
```

## Troubleshooting

### Pronunciation Not Working

**Symptom:** No audio plays when clicking pronunciation buttons.

**Solution:**
```bash
cd src/python-server
python download_models.py
```

Then restart the app.

### Python Server Won't Start

**Check Python version:**
```bash
python3 --version  # Should be 3.9+
```

**Rebuild the server:**
```bash
npm run python:setup
```

### "Model not found" Errors

The Python server logs model errors to the console. Check for:
```
[TTS] Error: Model not found: /path/to/models/en_US-lessac-medium.onnx
[TTS] Please run: python download_models.py
```

Run the suggested command to download missing models.

### Import Errors

If you see errors about missing modules during development:

```bash
cd src/python-server
source venv/bin/activate
pip install -r requirements.txt
```

## Configuration

### Python Server Port

Default port: `8766`

Change in `src/main/services/python-manager.service.ts`:
```typescript
const PORT = 8766; // Change this
```

### Voice Model Languages

To add more languages, edit `src/python-server/download_models.py` and add models from the [Piper TTS repository](https://github.com/rhasspy/piper).

## Architecture

### Offline-First Design

The app is designed to work completely offline:
- ✅ Book reading and text rendering
- ✅ AI word lookup (uses local Claude API)
- ✅ Pronunciation audio (Piper TTS)
- ✅ IPA transcription (gruut)
- ✅ Vocabulary tracking

### Tech Stack

**Frontend:**
- Electron 33
- React 18
- TypeScript
- Vite

**Backend:**
- Python 3.13
- FastAPI
- Piper TTS (ONNX models)
- PyInstaller (for distribution)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Piper TTS** - High-quality offline neural voices by Rhasspy
- **Claude AI** - AI-powered word definitions and context
- **gruut** - IPA phonetic transcription library

## Support

For issues and questions:
- 🐛 [Report a bug](https://github.com/yourusername/BookReader/issues)
- 💡 [Request a feature](https://github.com/yourusername/BookReader/issues)
- 📧 Email: csmahmutsalman@gmail.com
