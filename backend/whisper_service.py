# backend/whisper_service.py

import threading
import time
import logging
import os

import numpy as np
from pywhispercpp.model import Model  # pip install pywhispercpp

log = logging.getLogger(__name__)
log.setLevel(logging.INFO)


class WhisperService:
    def __init__(self, model_name: str = "base.en", models_dir: str = None):
        """
        Wraps whisper.cpp via pywhispercpp.

        model_name: Either one of the built-in model identifiers
                    (e.g. "tiny", "base.en", "small", etc.) or
                    a path to a local .bin file.
        models_dir:  Directory where models are cached/downloaded.
        """
        start = time.time()
        self.model = Model(model=model_name, models_dir=models_dir)
        log.info(f"Loaded Whisper model '{model_name}' in {time.time() - start:.2f}s")

        # Make sure all transcribe calls are serialized
        self.lock = threading.Lock()

    def transcribe(self, audio_bytes: bytes) -> str:
        """
        Transcribe a single chunk of 16-bit PCM audio.

        Expects:
          - mono, 16 kHz, int16 PCM in audio_bytes.

        Returns the concatenated text of all segments.
        """
        with self.lock:
            start = time.time()
            try:
                # Convert raw bytes to a NumPy array of int16
                audio_np = np.frombuffer(audio_bytes, dtype=np.int16)
                # Run transcription
                segments = self.model.transcribe(audio_np)
                # Concatenate segment texts
                text = "".join(seg.text for seg in segments).strip()
            except Exception as e:
                log.error(f"Whisper transcription error: {e}")
                return ""
            finally:
                log.info(f"Whisper chunk processed in {time.time() - start:.2f}s")
        return text

    def flush(self) -> str:
        """
        If you need any final text at end-of-stream, you could
        implement it here (pywhispercpp does not buffer across calls).
        For now, no-op.
        """
        return ""
