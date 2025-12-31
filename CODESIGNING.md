# Code Signing Policy

## Acknowledgment
This project uses code signing services provided by the **SignPath Foundation**. We are grateful for their support in providing secure, trusted builds for the open-source community.

## Team Structure
To ensure the integrity of the signing process, we have defined the following roles:

* **Authors** (Commit Access):
    * Mahmut Salman ([@mahmutsalman](https://github.com/mahmutsalman))
* **Reviewers** (Code Review):
    * Mahmut Salman ([@mahmutsalman](https://github.com/mahmutsalman))
* **Approvers** (Release Authorization):
    * Mahmut Salman ([@mahmutsalman](https://github.com/mahmutsalman))

## Signing Practices
* Only official releases are submitted for signing via the SignPath platform.
* The signing process is integrated into our CI/CD pipeline.
* All artifacts are verified before and after the signing process to ensure no tampering has occurred.

## Dependency Bundling

### PyInstaller Bundling Approach
This application uses **PyInstaller** to bundle the Python pronunciation server into a standalone executable. This is a standard packaging practice (analogous to how Electron bundles Chromium) where:

* **All bundled components are open source** - See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for complete licensing information
* **Components are not separately signed** - The code signature applies to the final combined artifact
* **Standard packaging practice** - Similar to static linking, commonly used for distributing Python applications
* **No upstream library signing** - We bundle dependencies (FastAPI, Piper-TTS, etc.) but do not sign them as separate artifacts
* **Transparent dependency listing** - All bundled components and their licenses are documented in THIRD_PARTY_NOTICES.md

### Voice Models as Runtime Dependencies
The ONNX voice models used for text-to-speech are:

* **Downloaded separately** from HuggingFace (rhasspy/piper-voices)
* **Not embedded in source code** - Optional runtime dependencies (~180MB total)
* **Open source assets** - Part of the MIT-licensed Piper TTS project
* **Analogous to system libraries** - Freely redistributable runtime dependencies
* **Fully documented** - See THIRD_PARTY_NOTICES.md for model sources and licenses

## Multi-Factor Authentication
To maintain security, all project maintainers with access to GitHub and SignPath are required to use Multi-Factor Authentication (MFA).

## Privacy & Security
For information on how we handle data, please refer to our [PRIVACY.md](PRIVACY.md).