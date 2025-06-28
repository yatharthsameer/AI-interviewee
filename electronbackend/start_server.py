#!/usr/bin/env python3
"""
Start the Electron Backend Server
This runs the Flask server on port 5002 for the Electron app screenshot analysis.
"""

import os
import sys
from server import APP

if __name__ == "__main__":
    print("🚀 Starting Electron Backend Server...")
    print("📡 Server will run on http://localhost:5002")
    print("🔑 Make sure GEMINI_API_KEY is set in your environment")
    print("📸 Ready to analyze screenshots!")
    print("-" * 50)

    # Check if API key is set
    if not os.getenv("GEMINI_API_KEY"):
        print("❌ ERROR: GEMINI_API_KEY environment variable not set!")
        print("Please set your Gemini API key and try again.")
        sys.exit(1)

    APP.run(host="0.0.0.0", port=5002, debug=True)
