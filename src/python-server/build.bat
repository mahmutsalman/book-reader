@echo off
REM
REM Build script for BookReader Pronunciation Server - Embedded Python Distribution (Windows)
REM
REM This script:
REM 1. Downloads and configures embedded Python for Windows
REM 2. Installs CORE dependencies only (TTS, IPA, PDF - NO OCR)
REM 3. Creates launcher script for production deployment
REM
REM OCR engines (PaddleOCR, EasyOCR) are installed on-demand by users via Settings UI
REM
REM Usage:
REM   build.bat           Full build for production
REM   build.bat --dev     Development setup (creates venv for local testing)
REM

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

set RUNTIME_DIR=%SCRIPT_DIR%python-runtime
set PYTHON_VERSION=3.11.9
set VENV_DIR=venv

echo ==============================================
echo BookReader Embedded Python Build (Windows)
echo ==============================================

REM Development mode: Create venv for local testing
if "%1"=="--dev" (
    echo Development mode: Creating venv...

    where python >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        set PYTHON_CMD=python
    ) else (
        echo Error: Python not found. Please install Python 3.9 or higher.
        exit /b 1
    )

    !PYTHON_CMD! --version

    if not exist "%VENV_DIR%" (
        echo Creating virtual environment...
        !PYTHON_CMD! -m venv "%VENV_DIR%"
    )

    call "%VENV_DIR%\Scripts\activate.bat"

    echo Installing dependencies...
    python -m pip install --upgrade pip wheel setuptools
    python -m pip install -r requirements.txt

    echo.
    echo [OK] Development environment ready!
    echo To activate: %VENV_DIR%\Scripts\activate.bat
    echo To run server: python server.py
    exit /b 0
)

REM Production mode: Setup embedded Python
echo Production mode: Setting up embedded Python...
echo Platform: Windows
echo Architecture: x64

echo.
echo Creating runtime directory...
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

REM Download Python embeddable package
echo.
echo Downloading Python %PYTHON_VERSION% embeddable package...
set EMBED_URL=https://www.python.org/ftp/python/%PYTHON_VERSION%/python-%PYTHON_VERSION%-embed-amd64.zip

if not exist "python-embed.zip" (
    powershell -Command "Invoke-WebRequest -Uri '%EMBED_URL%' -OutFile 'python-embed.zip'"
    if !ERRORLEVEL! NEQ 0 (
        echo Error: Failed to download Python embeddable package
        exit /b 1
    )
)

REM Verify download succeeded
if not exist "python-embed.zip" (
    echo Error: python-embed.zip not found after download attempt
    exit /b 1
)

echo Extracting Python...
REM Ensure runtime directory exists before extraction
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

echo Extracting to: %RUNTIME_DIR%
powershell -Command "Expand-Archive -Path 'python-embed.zip' -DestinationPath '%RUNTIME_DIR%' -Force"
if !ERRORLEVEL! NEQ 0 (
    echo Error: Failed to extract Python embeddable package
    exit /b 1
)

REM Verify extraction succeeded by checking for python.exe
if not exist "%RUNTIME_DIR%\python.exe" (
    echo Error: python.exe not found in %RUNTIME_DIR% after extraction
    echo This may indicate an extraction failure or download corruption
    dir "%RUNTIME_DIR%" 2>nul || echo Runtime directory does not exist
    exit /b 1
)

if exist "python-embed.zip" del "python-embed.zip"
echo [OK] Python extracted to: %RUNTIME_DIR%

REM Configure python311._pth to enable site-packages
echo.
echo Configuring Python paths...
(
echo python311.zip
echo .
echo site-packages
echo.
echo import site
) > "%RUNTIME_DIR%\python311._pth"

echo [OK] Python path configuration created

REM Install pip
echo.
echo Installing pip...
if not exist "get-pip.py" (
    powershell -Command "Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile 'get-pip.py'"
    if !ERRORLEVEL! NEQ 0 (
        echo Error: Failed to download get-pip.py
        exit /b 1
    )
)

REM Verify get-pip.py exists
if not exist "get-pip.py" (
    echo Error: get-pip.py not found after download attempt
    exit /b 1
)

"%RUNTIME_DIR%\python.exe" get-pip.py
if !ERRORLEVEL! NEQ 0 (
    echo Error: Failed to install pip
    exit /b 1
)

if exist "get-pip.py" del "get-pip.py"
echo [OK] pip installed

REM Install core dependencies
echo.
echo Installing core dependencies...

echo Installing web server...
"%RUNTIME_DIR%\python.exe" -m pip install fastapi>=0.104.0 uvicorn>=0.24.0 pydantic>=2.0.0
if !ERRORLEVEL! NEQ 0 (
    echo Error: Failed to install web server dependencies
    exit /b 1
)

echo Installing TTS and IPA...
"%RUNTIME_DIR%\python.exe" -m pip install piper-tts>=1.2.0 gruut>=2.3.0
if !ERRORLEVEL! NEQ 0 (
    echo Error: Failed to install TTS dependencies
    exit /b 1
)

echo Installing PDF processing...
"%RUNTIME_DIR%\python.exe" -m pip install PyMuPDF>=1.23.0 pytesseract>=0.3.10 Pillow>=10.0.0 scipy>=1.10.0
if !ERRORLEVEL! NEQ 0 (
    echo Error: Failed to install PDF processing dependencies
    exit /b 1
)

echo.
echo [OK] Core dependencies installed (OCR excluded - install via Settings UI)

REM Create launcher script
echo.
echo Creating launcher script...

(
echo @echo off
echo REM Launcher for BookReader Python Server
echo set SCRIPT_DIR=%%~dp0
echo set PYTHONHOME=%%SCRIPT_DIR%%python-runtime
echo set PYTHONPATH=%%SCRIPT_DIR%%;%%APPDATA%%\BookReader\ocr-packages;%%PYTHONPATH%%
echo set PATH=%%PYTHONHOME%%;%%PYTHONHOME%%\Scripts;%%PATH%%
echo cd /d "%%SCRIPT_DIR%%"
echo "%%PYTHONHOME%%\python.exe" "%%SCRIPT_DIR%%server.py" %%*
) > "%SCRIPT_DIR%launch-server.bat"

echo [OK] Launcher script created: launch-server.bat

echo.
echo ==============================================
echo [OK] Embedded Python build complete!
echo ==============================================
echo.
echo Runtime location: %RUNTIME_DIR%
echo Launcher script: launch-server.bat
echo.
echo To test locally: launch-server.bat
echo To package with Electron: npm run make:win
echo.
echo Note: OCR engines (PaddleOCR, EasyOCR) are NOT bundled.
echo Users can install them via Settings UI (~800MB download).
echo.

endlocal
