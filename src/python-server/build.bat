@echo off
REM Build script for BookReader Pronunciation Server (Windows)
REM
REM This script:
REM 1. Creates/updates a virtual environment
REM 2. Installs dependencies
REM 3. Runs PyInstaller to create standalone executable
REM
REM Usage:
REM   build.bat           - Full build (venv + dependencies + PyInstaller)
REM   build.bat --dev     - Dev setup only (venv + dependencies, no PyInstaller)
REM   build.bat --binary  - PyInstaller only (assumes venv exists)

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

set VENV_DIR=venv
set PYTHON_MIN_VERSION=3.9

echo ===================================
echo BookReader Pronunciation Server Build
echo ===================================

REM Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python not found. Please install Python %PYTHON_MIN_VERSION% or higher.
    exit /b 1
)

for /f "tokens=*" %%i in ('python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"') do set PYTHON_VERSION=%%i
echo Found Python %PYTHON_VERSION%

REM Parse arguments
if "%1"=="--dev" goto :setup_dev
if "%1"=="--binary" goto :build_binary_only
goto :full_build

:setup_dev
call :setup_venv
call :install_deps
echo.
echo Development setup complete. Run 'venv\Scripts\activate' to activate.
goto :done

:build_binary_only
call %VENV_DIR%\Scripts\activate
call :build_binary
goto :done

:full_build
call :setup_venv
call :install_deps
call :build_binary
goto :done

:setup_venv
echo.
echo Setting up virtual environment...

if not exist "%VENV_DIR%" (
    echo Creating virtual environment...
    python -m venv %VENV_DIR%
) else (
    echo Virtual environment already exists.
)

call %VENV_DIR%\Scripts\activate

REM Upgrade pip, wheel, and setuptools FIRST
echo [Setup] Upgrading pip, wheel, and setuptools...
python -m pip install --upgrade pip wheel setuptools
if %errorlevel% neq 0 (
    echo [ERROR] Failed to upgrade pip/wheel/setuptools
    exit /b 1
)
exit /b 0

:install_deps
echo.
echo Installing dependencies...

echo [Dependencies] Installing from requirements.txt...
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies from requirements.txt
    exit /b 1
)

echo [Dependencies] Installing PyInstaller...
pip install pyinstaller
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install PyInstaller
    exit /b 1
)

echo [Dependencies] Verifying critical packages...
python -c "import paddleocr; print('[OK] paddleocr installed')" 2>nul || echo [WARNING] paddleocr not found
python -c "import Polygon; print('[OK] Polygon3 installed')" 2>nul || echo [WARNING] Polygon3 not found
python -c "import lanms; print('[OK] lanms-neo installed')" 2>nul || echo [WARNING] lanms-neo not found
python -c "import piper; print('[OK] piper-tts installed')" 2>nul || echo [WARNING] piper-tts not found

echo [Dependencies] Installation completed.
exit /b 0

:build_binary
echo.
echo Building standalone executable with PyInstaller...

REM Clean previous build
echo [PyInstaller] Cleaning previous build artifacts...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

REM Run PyInstaller
echo [PyInstaller] Running PyInstaller with spec file...
pyinstaller pronunciation-server.spec --clean --log-level INFO
if %errorlevel% neq 0 (
    echo [ERROR] PyInstaller build failed with exit code %errorlevel%
    echo Check the output above for specific errors
    exit /b 1
)

REM Check output
echo [PyInstaller] Verifying build output...
if exist "dist\pronunciation-server.exe" (
    echo.
    echo [SUCCESS] Build successful!
    echo Executable: dist\pronunciation-server.exe
    dir "dist\pronunciation-server.exe"
) else (
    echo [ERROR] Build completed but executable not found at dist\pronunciation-server.exe
    echo [PyInstaller] Checking dist directory...
    if exist "dist" (
        dir /s dist
    ) else (
        echo dist\ directory was not created
    )
    exit /b 1
)
exit /b 0

:done
echo.
echo Done!
endlocal
