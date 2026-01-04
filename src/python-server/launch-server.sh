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
