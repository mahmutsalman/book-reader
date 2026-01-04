#!/bin/bash
#
# Build script for BookReader Pronunciation Server - Embedded Python Distribution
#
# This script:
# 1. Downloads and configures embedded Python for the target platform
# 2. Installs CORE dependencies only (TTS, IPA, PDF - NO OCR)
# 3. Creates launcher script for production deployment
#
# OCR engines (PaddleOCR, EasyOCR) are installed on-demand by users via Settings UI
#
# Usage:
#   ./build.sh           # Full build for production
#   ./build.sh --dev     # Development setup (creates venv for local testing)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RUNTIME_DIR="$SCRIPT_DIR/python-runtime"
PYTHON_VERSION="3.11.9"
VENV_DIR="venv"

echo "=============================================="
echo "BookReader Embedded Python Build"
echo "=============================================="

# Development mode: Create venv for local testing
if [ "$1" == "--dev" ]; then
    echo "Development mode: Creating venv..."

    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        echo "Error: Python not found. Please install Python 3.9 or higher."
        exit 1
    fi

    echo "Using: $($PYTHON_CMD --version)"

    if [ ! -d "$VENV_DIR" ]; then
        echo "Creating virtual environment..."
        $PYTHON_CMD -m venv "$VENV_DIR"
    fi

    source "$VENV_DIR/bin/activate"

    echo "Installing dependencies..."
    pip install --upgrade pip wheel setuptools
    pip install -r requirements.txt

    echo ""
    echo "✅ Development environment ready!"
    echo "To activate: source venv/bin/activate"
    echo "To run server: python server.py"
    exit 0
fi

# Production mode: Setup embedded Python
echo "Production mode: Setting up embedded Python..."
echo "Platform: $(uname)"
echo "Architecture: $(uname -m)"

# Platform detection and Python download
setup_embedded_python() {
    mkdir -p "$RUNTIME_DIR"

    # Determine architecture
    ARCH=$(uname -m)

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: Use python-build-standalone (relocatable, no hardcoded paths)
        echo ""
        echo "Downloading standalone Python for macOS ($ARCH)..."

        # Map macOS architecture names
        if [ "$ARCH" == "arm64" ]; then
            ARCH_NAME="aarch64"
        elif [ "$ARCH" == "x86_64" ]; then
            ARCH_NAME="x86_64"
        else
            echo "Error: Unsupported macOS architecture: $ARCH"
            exit 1
        fi

        STANDALONE_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240107/cpython-3.11.7+20240107-${ARCH_NAME}-apple-darwin-install_only.tar.gz"

        if [ ! -f "python.tar.gz" ]; then
            curl -L "$STANDALONE_URL" -o python.tar.gz
        fi

        echo "Extracting Python..."
        tar -xzf python.tar.gz -C "$RUNTIME_DIR" --strip-components=1
        rm python.tar.gz

        PYTHON_EXE="$RUNTIME_DIR/bin/python3"
        echo "✅ Python extracted to: $RUNTIME_DIR"

    else
        # Linux: Use python-build-standalone
        echo ""
        echo "Downloading standalone Python for Linux ($ARCH)..."

        # Map architecture names
        if [ "$ARCH" == "x86_64" ]; then
            ARCH_NAME="x86_64"
        elif [ "$ARCH" == "aarch64" ]; then
            ARCH_NAME="aarch64"
        else
            echo "Warning: Unsupported architecture $ARCH, trying x86_64..."
            ARCH_NAME="x86_64"
        fi

        STANDALONE_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240107/cpython-3.11.7+20240107-${ARCH_NAME}-unknown-linux-gnu-install_only.tar.gz"

        if [ ! -f "python.tar.gz" ]; then
            curl -L "$STANDALONE_URL" -o python.tar.gz
        fi

        echo "Extracting Python..."
        tar -xzf python.tar.gz -C "$RUNTIME_DIR" --strip-components=1
        rm python.tar.gz

        PYTHON_EXE="$RUNTIME_DIR/bin/python3"
        echo "✅ Python extracted to: $RUNTIME_DIR"
    fi

    # Verify Python works
    if [ ! -f "$PYTHON_EXE" ]; then
        echo "Error: Python executable not found at $PYTHON_EXE"
        exit 1
    fi

    echo "Verifying Python: $("$PYTHON_EXE" --version)"
}

# Install CORE dependencies only (NO OCR)
install_core_dependencies() {
    echo ""
    echo "Installing core dependencies..."

    # Ensure pip is available
    "$PYTHON_EXE" -m ensurepip --default-pip 2>/dev/null || true
    "$PYTHON_EXE" -m pip install --upgrade pip wheel setuptools

    echo "Installing web server..."
    "$PYTHON_EXE" -m pip install \
        fastapi>=0.104.0 \
        uvicorn>=0.24.0 \
        pydantic>=2.0.0

    echo "Installing TTS and IPA..."
    "$PYTHON_EXE" -m pip install \
        piper-tts>=1.2.0 \
        gruut>=2.3.0

    echo "Installing PDF processing..."
    "$PYTHON_EXE" -m pip install \
        PyMuPDF>=1.23.0 \
        pytesseract>=0.3.10 \
        Pillow>=10.0.0 \
        scipy>=1.10.0

    echo ""
    echo "✅ Core dependencies installed (OCR excluded - install via Settings UI)"
}

# Create launcher script
create_launcher() {
    echo ""
    echo "Creating launcher script..."

    cat > "$SCRIPT_DIR/launch-server.sh" << 'LAUNCHER_EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Python runtime paths (consistent across macOS and Linux)
PYTHON_HOME="$SCRIPT_DIR/python-runtime"
PYTHON_EXE="$PYTHON_HOME/bin/python3"

# Set Python environment
export PYTHONHOME="$PYTHON_HOME"
export PATH="$PYTHON_HOME/bin:$PATH"

# Linux-specific library path
if [[ "$OSTYPE" != "darwin"* ]]; then
    export LD_LIBRARY_PATH="$PYTHON_HOME/lib:${LD_LIBRARY_PATH:-}"
fi

# Add user's OCR packages to PYTHONPATH
if [[ "$OSTYPE" == "darwin"* ]]; then
    USER_DATA="$HOME/Library/Application Support/BookReader"
else
    USER_DATA="$HOME/.local/share/BookReader"
fi

export PYTHONPATH="$USER_DATA/ocr-packages:${PYTHONPATH:-}"

# Launch server
exec "$PYTHON_EXE" "$SCRIPT_DIR/server.py" "$@"
LAUNCHER_EOF

    chmod +x "$SCRIPT_DIR/launch-server.sh"
    echo "✅ Launcher script created: launch-server.sh"
}

# Execute build
echo ""
echo "Step 1/3: Setting up embedded Python runtime..."
setup_embedded_python

echo ""
echo "Step 2/3: Installing core dependencies..."
install_core_dependencies

echo ""
echo "Step 3/3: Creating launcher script..."
create_launcher

echo ""
echo "=============================================="
echo "✅ Embedded Python build complete!"
echo "=============================================="
echo ""
echo "Runtime location: $RUNTIME_DIR"
echo "Launcher script: launch-server.sh"
echo ""
echo "To test locally: ./launch-server.sh"
echo "To package with Electron: npm run make"
echo ""
echo "Note: OCR engines (PaddleOCR, EasyOCR) are NOT bundled."
echo "Users can install them via Settings UI (~800MB download)."
echo ""
