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

REM Upgrade pip
pip install --upgrade pip wheel setuptools
exit /b 0

:install_deps
echo.
echo Installing dependencies...

pip install -r requirements.txt
pip install pyinstaller

echo Dependencies installed.
exit /b 0

:build_binary
echo.
echo Building standalone executable with PyInstaller...

REM Clean previous build
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

REM Run PyInstaller
pyinstaller pronunciation-server.spec --clean

REM Check output
if exist "dist\pronunciation-server.exe" (
    echo.
    echo Build successful!
    echo Executable: dist\pronunciation-server.exe
) else (
    echo Error: Build failed. Executable not found.
    exit /b 1
)
exit /b 0

:done
echo.
echo Done!
endlocal
