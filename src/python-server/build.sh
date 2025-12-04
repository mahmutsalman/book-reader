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

    # Upgrade pip
    pip install --upgrade pip wheel setuptools
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
        echo ""
        echo "Development setup complete. Run 'source venv/bin/activate' to activate."
        ;;
    --binary)
        source "$VENV_DIR/bin/activate"
        build_binary
        ;;
    *)
        setup_venv
        install_deps
        build_binary
        ;;
esac

echo ""
echo "Done!"
