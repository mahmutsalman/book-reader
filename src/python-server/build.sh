#!/bin/bash
#
# Build script for BookReader Pronunciation Server (macOS/Linux)
#
# This script:
# 1. Creates/updates a virtual environment
# 2. Installs dependencies
# 3. Runs PyInstaller to create standalone executable
#
# Usage:
#   ./build.sh           # Full build (venv + dependencies + PyInstaller)
#   ./build.sh --dev     # Dev setup only (venv + dependencies, no PyInstaller)
#   ./build.sh --binary  # PyInstaller only (assumes venv exists)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="venv"
PYTHON_MIN_VERSION="3.9"

echo "==================================="
echo "BookReader Pronunciation Server Build"
echo "==================================="

# Check Python version
check_python() {
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        echo "Error: Python not found. Please install Python $PYTHON_MIN_VERSION or higher."
        exit 1
    fi

    PYTHON_VERSION=$($PYTHON_CMD -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    echo "Found Python $PYTHON_VERSION at $($PYTHON_CMD -c 'import sys; print(sys.executable)')"
}

# Create virtual environment
setup_venv() {
    echo ""
    echo "Setting up virtual environment..."

    if [ ! -d "$VENV_DIR" ]; then
        echo "Creating virtual environment..."
        $PYTHON_CMD -m venv "$VENV_DIR"
    else
        echo "Virtual environment already exists."
    fi

    # Activate venv
    source "$VENV_DIR/bin/activate"

    # If pip is broken, recreate the venv
    if ! python -m pip --version >/dev/null 2>&1; then
        echo "Pip is not working in the virtual environment; recreating..."
        if type deactivate >/dev/null 2>&1; then
            deactivate
        fi
        rm -rf "$VENV_DIR"
        $PYTHON_CMD -m venv "$VENV_DIR"
        source "$VENV_DIR/bin/activate"
    fi

    # Upgrade pip
    python -m ensurepip --upgrade >/dev/null 2>&1 || true
    python -m pip install --upgrade pip wheel setuptools
}

# Install dependencies
install_deps() {
    echo ""
    echo "Installing dependencies..."

    # Install production dependencies
    pip install -r requirements.txt

    # Install PyInstaller for building
    pip install pyinstaller

    echo "Dependencies installed."
}

# Check and optionally download voice models
check_models() {
    echo ""
    echo "Checking voice models..."

    # Check if models directory exists and contains .onnx files
    if [ ! -d "models" ] || [ -z "$(ls -A models/*.onnx 2>/dev/null)" ]; then
        echo ""
        echo "⚠️  Voice models not found!"
        echo "   Pronunciation feature requires voice models (~180MB total)"
        echo "   Models: English (US), German, Russian"
        echo ""

        # In CI environment, skip interactive prompt and download automatically
        if [ -n "$CI" ] || [ -n "$GITHUB_ACTIONS" ]; then
            echo "CI environment detected - downloading models automatically..."
            python download_models.py

            if [ $? -eq 0 ]; then
                echo "✅ Voice models downloaded successfully!"
            else
                echo "⚠️  Failed to download models in CI. Continuing without models."
                echo "   App will work but pronunciation feature may be limited."
            fi
        else
            # Interactive mode - ask user
            echo "Would you like to download them now? [Y/n]"
            read -r response

            if [[ ! "$response" =~ ^[Nn]$ ]]; then
                echo ""
                echo "Downloading voice models from HuggingFace..."
                python download_models.py

                if [ $? -eq 0 ]; then
                    echo "✅ Voice models downloaded successfully!"
                else
                    echo "❌ Failed to download models. You can try again later with:"
                    echo "   cd src/python-server && python download_models.py"
                fi
            else
                echo ""
                echo "⏭️  Skipping model download."
                echo "   To download later, run:"
                echo "   cd src/python-server && python download_models.py"
            fi
        fi
    else
        model_count=$(ls -1 models/*.onnx 2>/dev/null | wc -l | tr -d ' ')
        echo "✅ Found $model_count voice model(s)"
    fi
}

# Build with PyInstaller
build_binary() {
    echo ""
    echo "Building standalone executable with PyInstaller..."

    # Clean previous build
    rm -rf build dist

    # Run PyInstaller
    pyinstaller pronunciation-server.spec --clean

    # Check output
    if [ -f "dist/pronunciation-server" ]; then
        echo ""
        echo "Build successful!"
        echo "Executable: dist/pronunciation-server"

        # Show file size
        SIZE=$(du -h dist/pronunciation-server | cut -f1)
        echo "Size: $SIZE"
    else
        echo "Error: Build failed. Executable not found."
        exit 1
    fi
}

# Main
check_python

case "${1:-}" in
    --dev)
        setup_venv
        install_deps
        check_models
        echo ""
        echo "Development setup complete. Run 'source venv/bin/activate' to activate."
        ;;
    --binary)
        source "$VENV_DIR/bin/activate"
        check_models
        build_binary
        ;;
    *)
        setup_venv
        install_deps
        check_models
        build_binary
        ;;
esac

echo ""
echo "Done!"
