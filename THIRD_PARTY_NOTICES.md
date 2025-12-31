# Third-Party Notices

This document contains licensing information for third-party software and assets used in Smart Book Reader.

---

## Open Source Components

Smart Book Reader incorporates the following open-source components:

### Voice Models & Speech Synthesis

#### Piper Text-to-Speech
- **Project**: Piper TTS
- **Version**: 1.0.0
- **License**: MIT License
- **Repository**: https://github.com/rhasspy/piper
- **Copyright**: Copyright (c) Rhasspy
- **Usage**: Neural text-to-speech synthesis engine for offline pronunciation

#### Voice Models (ONNX Neural Networks)
- **Source**: HuggingFace - rhasspy/piper-voices
- **Version**: v1.0.0
- **License**: MIT License (Piper project)
- **Repository**: https://huggingface.co/rhasspy/piper-voices
- **Models Used**:
  - **English (US) - Lessac Medium**
    - Model: `en_US-lessac-medium.onnx` (~60MB)
    - URL: https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
    - Dataset: Lessac voice dataset
  - **German - Thorsten Medium**
    - Model: `de_DE-thorsten-medium.onnx` (~60MB)
    - URL: https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx
    - Dataset: Thorsten voice dataset
  - **Russian - Dmitri Medium**
    - Model: `ru_RU-dmitri-medium.onnx` (~60MB)
    - URL: https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx
    - Dataset: Dmitri voice dataset

**Note**: These pre-trained neural network models (.onnx files) are distributed as part of the open-source Piper TTS project. They are runtime dependencies analogous to system libraries, downloaded separately and not embedded in the application source code.

---

### Python Dependencies

#### FastAPI
- **Version**: >=0.104.0
- **License**: MIT License
- **Repository**: https://github.com/tiangolo/fastapi
- **Usage**: Web framework for pronunciation server API

#### Uvicorn
- **Version**: >=0.24.0
- **License**: BSD 3-Clause License
- **Repository**: https://github.com/encode/uvicorn
- **Usage**: ASGI server for Python backend

#### Pydantic
- **Version**: >=2.0.0
- **License**: MIT License
- **Repository**: https://github.com/pydantic/pydantic
- **Usage**: Data validation and settings management

#### Piper-TTS (Python Package)
- **Version**: >=1.2.0
- **License**: MIT License
- **Repository**: https://github.com/rhasspy/piper
- **Usage**: Python bindings for Piper text-to-speech

#### gruut
- **Version**: >=2.3.0
- **License**: MIT License
- **Repository**: https://github.com/rhasspy/gruut
- **Usage**: IPA phonetic transcription library

#### PyMuPDF (fitz)
- **Version**: >=1.23.0
- **License**: GNU Affero General Public License v3.0
- **Repository**: https://github.com/pymupdf/PyMuPDF
- **Usage**: PDF text extraction and processing

#### pytesseract
- **Version**: >=0.3.10
- **License**: Apache License 2.0
- **Repository**: https://github.com/madmaze/pytesseract
- **Usage**: OCR capabilities for PDF processing

#### Pillow
- **Version**: >=10.0.0
- **License**: Historical Permission Notice and Disclaimer (HPND)
- **Repository**: https://github.com/python-pillow/Pillow
- **Usage**: Image processing library

---

### JavaScript/Node Dependencies

#### Electron
- **Version**: 39.2.4
- **License**: MIT License
- **Repository**: https://github.com/electron/electron
- **Usage**: Cross-platform desktop application framework

#### React
- **Version**: 19.2.0
- **License**: MIT License
- **Repository**: https://github.com/facebook/react
- **Usage**: UI component library

#### React DOM
- **Version**: 19.2.3
- **License**: MIT License
- **Repository**: https://github.com/facebook/react
- **Usage**: React rendering for web

#### React Router DOM
- **Version**: 7.10.0
- **License**: MIT License
- **Repository**: https://github.com/remix-run/react-router
- **Usage**: Client-side routing

#### better-sqlite3
- **Version**: 12.5.0
- **License**: MIT License
- **Repository**: https://github.com/WiseLibs/better-sqlite3
- **Usage**: SQLite database interface with native bindings

#### Electron Forge
- **Version**: 7.10.2
- **License**: MIT License
- **Repository**: https://github.com/electron/forge
- **Usage**: Build tooling and packaging

#### TypeScript
- **Version**: ~4.5.4
- **License**: Apache License 2.0
- **Repository**: https://github.com/microsoft/TypeScript
- **Usage**: Type-safe JavaScript development

#### Vite
- **Version**: 5.4.21
- **License**: MIT License
- **Repository**: https://github.com/vitejs/vite
- **Usage**: Frontend build tool and dev server

#### Tailwind CSS
- **Version**: 4.1.17
- **License**: MIT License
- **Repository**: https://github.com/tailwindlabs/tailwindcss
- **Usage**: Utility-first CSS framework

---

## Bundled Dependencies

### PyInstaller Bundling

This application uses **PyInstaller** to bundle the Python pronunciation server into a standalone executable. PyInstaller packages the following components:

- Python interpreter (Python Software Foundation License)
- All Python dependencies listed above
- ONNX Runtime (MIT License) - included with piper-tts

**Important**: PyInstaller creates a self-contained executable where all components remain under their original open-source licenses. This is analogous to static linking and is standard practice for distributing Python applications (similar to how Electron bundles Chromium).

**All bundled components are open source** and are not separately signed. The code signature applies to the final combined artifact, not individual components.

---

## License Compliance

### License Summary

| Component Type | Primary Licenses | Notes |
|----------------|------------------|-------|
| Application Code | MIT | Smart Book Reader source code |
| Voice Models | MIT | Piper TTS neural network models |
| Python Backend | MIT, BSD-3, AGPL-3.0, Apache-2.0, HPND | See individual packages |
| JavaScript Frontend | MIT, Apache-2.0 | Electron, React, and build tools |
| Native Bindings | MIT | better-sqlite3 |

### AGPL-3.0 Component

**PyMuPDF** is licensed under AGPL-3.0. This library is used for PDF text extraction and is included as a runtime dependency in the bundled Python server. As per AGPL requirements:

- Source code is available: https://github.com/pymupdf/PyMuPDF
- No modifications have been made to the library
- Network use is local-only (pronunciation server on localhost)

---

## Attribution

We are grateful to the open-source community and the following projects:

- **Rhasspy Community** - For the excellent Piper TTS engine and high-quality voice models
- **HuggingFace** - For hosting and distributing the Piper voice models
- **FastAPI & Uvicorn Teams** - For modern Python web framework
- **Electron Team** - For cross-platform desktop framework
- **React Team** - For UI component library
- **All contributors** to the dependencies listed above

---

## Code Signing

This application uses code signing services provided by [SignPath Foundation](https://signpath.org/). The code signature confirms that:

1. The binary matches the source code at a specific commit
2. The build was produced by the authorized development team
3. The binary has not been tampered with since signing

**The signature does NOT**:
- Guarantee software quality or fitness for purpose
- Imply endorsement by SignPath Foundation
- Provide warranty of any kind

For more information, see our [Code Signing Policy](CODESIGNING.md).

---

## Contact

For questions about licensing or third-party components:

- **GitHub Issues**: https://github.com/mahmutsalman/book-reader/issues
- **Email**: csmahmutsalman@gmail.com

---

*Last Updated: 2025-12-31*
