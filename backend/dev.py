#!/usr/bin/env python3
import os
import sys
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import subprocess
import signal

class ServerRestartHandler(FileSystemEventHandler):
    def __init__(self):
        self.process = None
        self.restart_server()

    def restart_server(self):
        if self.process:
            print("\n🔄 Restarting server...")
            os.killpg(os.getpgid(self.process.pid), signal.SIGTERM)
            time.sleep(1)  # Give it time to shut down

        print("\n🚀 Starting server...")
        self.process = subprocess.Popen(
            [sys.executable, "server.py"],
            preexec_fn=os.setsid,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )

        # Start a thread to print server output
        import threading
        def print_output():
            for line in iter(self.process.stdout.readline, ''):
                print(line, end='')
            self.process.stdout.close()

        threading.Thread(target=print_output, daemon=True).start()

    def on_modified(self, event):
        if event.src_path.endswith('.py'):
            self.restart_server()

if __name__ == "__main__":
    handler = ServerRestartHandler()
    observer = Observer()
    observer.schedule(handler, path='.', recursive=False)
    observer.start()

    print("👀 Watching for file changes...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        if handler.process:
            os.killpg(os.getpgid(handler.process.pid), signal.SIGTERM)
    observer.join() 