@echo off
REM Launcher for BookReader Python Server (Windows)
REM
REM This script launches the Python server with the embedded Python runtime.
REM It sets up the necessary environment variables for the server to function.

REM Get the directory where this script is located (Resources directory)
set SCRIPT_DIR=%~dp0
REM Remove trailing backslash for consistent path handling
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

REM Python runtime paths
set PYTHONHOME=%SCRIPT_DIR%\python-runtime
set PYTHON_EXE=%PYTHONHOME%\python.exe

REM Verify Python executable exists
if not exist "%PYTHON_EXE%" (
    echo [ERROR] Python executable not found at: %PYTHON_EXE%
    echo Please ensure the application was installed correctly.
    exit /b 1
)

REM Verify server.py exists
if not exist "%SCRIPT_DIR%\server.py" (
    echo [ERROR] Server script not found at: %SCRIPT_DIR%\server.py
    echo Please ensure the application was installed correctly.
    exit /b 1
)

REM Verify generators directory exists
if not exist "%SCRIPT_DIR%\generators" (
    echo [ERROR] Generators directory not found at: %SCRIPT_DIR%\generators
    echo Please ensure the application was installed correctly.
    exit /b 1
)

REM Set PATH to include Python runtime
set PATH=%PYTHONHOME%;%PYTHONHOME%\Scripts;%PATH%

REM Build PYTHONPATH carefully to avoid empty segments
REM Start with the script directory (where server.py and generators/ are located)
set PYTHONPATH=%SCRIPT_DIR%

REM Add user's OCR packages directory if APPDATA is set
if defined APPDATA (
    set PYTHONPATH=%PYTHONPATH%;%APPDATA%\BookReader\ocr-packages
)

REM Change to script directory before running (helps with relative imports)
cd /d "%SCRIPT_DIR%"

REM Debug output (can be removed in production)
echo [Launcher] SCRIPT_DIR=%SCRIPT_DIR%
echo [Launcher] PYTHONHOME=%PYTHONHOME%
echo [Launcher] PYTHONPATH=%PYTHONPATH%
echo [Launcher] Starting server...

REM Launch server
"%PYTHON_EXE%" "%SCRIPT_DIR%\server.py" %*
