@echo off
REM Launcher for BookReader Python Server (Windows)

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
REM Remove trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

REM Python runtime paths
set PYTHONHOME=%SCRIPT_DIR%\python-runtime
set PYTHON_EXE=%PYTHONHOME%\python.exe

REM Set Python environment
set PATH=%PYTHONHOME%;%PYTHONHOME%\Scripts;%PATH%

REM Add script directory to PYTHONPATH so Python can find generators module
REM Also add user's OCR packages directory
set PYTHONPATH=%SCRIPT_DIR%;%APPDATA%\BookReader\ocr-packages;%PYTHONPATH%

REM Launch server
"%PYTHON_EXE%" "%SCRIPT_DIR%\server.py" %*
