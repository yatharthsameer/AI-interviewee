#!/bin/bash

# Development server script for electronbackend
# This script starts the Flask server with auto-reload functionality

echo "Starting electronbackend development server with auto-reload..."
echo "Press Ctrl+C to stop the server."
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed or not in PATH"
    exit 1
fi

# Check if required packages are installed
echo "Checking dependencies..."
python3 -c "import watchdog" 2>/dev/null || {
    echo "Installing watchdog..."
    pip install watchdog
}

# Start the development server
python3 dev_server.py 