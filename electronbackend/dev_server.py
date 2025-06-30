#!/usr/bin/env python3
"""
Development server with auto-reload functionality using watchdog.
This script monitors Python files and automatically restarts the Flask server when changes are detected.
"""

import os
import sys
import time
import signal
import subprocess
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)


class ServerRestartHandler(FileSystemEventHandler):
    """Handler for file system events that triggers server restart."""

    def __init__(self, server_process):
        self.server_process = server_process
        self.last_restart = 0
        self.restart_delay = 2  # Minimum seconds between restarts

    def on_modified(self, event):
        if event.is_directory:
            return

        # Only watch Python files
        if not event.src_path.endswith(".py"):
            return

        # Ignore __pycache__ files
        if "__pycache__" in event.src_path:
            return

        current_time = time.time()
        if current_time - self.last_restart < self.restart_delay:
            return

        logger.info(f"File changed: {event.src_path}")
        self.restart_server()
        self.last_restart = current_time

    def restart_server(self):
        """Restart the Flask server."""
        try:
            logger.info("Restarting server...")

            # Kill the current server process
            if self.server_process and self.server_process.poll() is None:
                self.server_process.terminate()
                try:
                    self.server_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.server_process.kill()
                    self.server_process.wait()

            # Start a new server process
            self.server_process = subprocess.Popen(
                [sys.executable, "server.py"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )

            logger.info("Server restarted successfully")

        except Exception as e:
            logger.error(f"Error restarting server: {e}")


def start_dev_server():
    """Start the development server with auto-reload."""
    logger.info("Starting development server with auto-reload...")

    # Start the initial server process
    server_process = subprocess.Popen(
        [sys.executable, "server.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    # Create the file system observer
    event_handler = ServerRestartHandler(server_process)
    observer = Observer()

    # Watch the current directory and subdirectories for Python files
    current_dir = Path(".")
    observer.schedule(event_handler, str(current_dir), recursive=True)

    # Start watching
    observer.start()

    logger.info("Auto-reload enabled. Watching for changes...")
    logger.info("Press Ctrl+C to stop the server.")

    try:
        # Keep the script running
        while True:
            time.sleep(1)

            # Check if server process is still running
            if server_process.poll() is not None:
                logger.error("Server process died unexpectedly")
                break

    except KeyboardInterrupt:
        logger.info("Shutting down development server...")

        # Stop watching
        observer.stop()

        # Kill server process
        if server_process and server_process.poll() is None:
            server_process.terminate()
            try:
                server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server_process.kill()
                server_process.wait()

        # Wait for observer to stop
        observer.join()

        logger.info("Development server stopped.")


if __name__ == "__main__":
    start_dev_server()
