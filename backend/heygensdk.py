# -*- coding: utf-8 -*-
import os, requests, typing as _t
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('heygen')

Json = _t.Dict[str, _t.Any]


class HeyGenSDK:
    """Wrapper around /v1/streaming.* endpoints."""

    def __init__(self, api_key: str | None = None):
        self.key = api_key or os.getenv("HEYGEN_API_KEY")
        if not self.key:
            logger.error("HEYGEN_API_KEY not set")
            raise RuntimeError("HEYGEN_API_KEY not set")
        self.base = "https://api.heygen.com"
        self.h = {"X-Api-Key": self.key, "Content-Type": "application/json"}
        logger.info("HeyGenSDK initialized")

    # ───────────────────────────── create ────────────────────────────
    def create_session(
        self,
        *,
        avatar_name: str,
        voice_id: str,
        quality: str = "high",
        disable_idle_timeout: bool = False,
    ) -> Json:
        logger.info(f"Creating session with avatar={avatar_name}, voice={voice_id}")
        body = {
            "quality": quality,
            "avatar_name": avatar_name,
            "voice": {"voice_id": voice_id},
            "disable_idle_timeout": disable_idle_timeout,
        }
        r = requests.post(f"{self.base}/v1/streaming.new",
                          headers=self.h, json=body, timeout=50)
        if r.status_code >= 400:
            logger.error(f"streaming.new error {r.status_code} → {r.text}")
            r.raise_for_status()
        data = r.json()["data"]
        logger.info(f"Session created: {data.get('session_id')}")
        return data

    # ─────────────────────────── signaling ───────────────────────────
    def add_ice_candidate(self, session_id: str, candidate: Json) -> None:
        logger.debug(f"Adding ICE candidate for session {session_id}")
        r = requests.post(
            f"{self.base}/v1/streaming.ice",
            headers=self.h,
            json={"session_id": session_id, "candidate": candidate},
            timeout=50,
        )
        r.raise_for_status()
        logger.debug("ICE candidate added successfully")

    def start_session(self, session_id: str, sdp_answer: str) -> Json:
        """
        POST /v1/streaming.start → { connection_id, ... }
        HeyGen now expects the entire SDP object (with a 'type' field), not just a bare string.
        So we wrap the raw answer string into { type: "answer", sdp: <string> }.
        """
        logger.info(f"Starting session {session_id}")
        payload = {
            "session_id": session_id,
            "sdp": {
                "type": "answer",
                "sdp": sdp_answer
            }
        }
        r = requests.post(
            f"{self.base}/v1/streaming.start", headers=self.h, json=payload, timeout=50
        )
        r.raise_for_status()
        data = r.json()["data"]
        logger.info(f"Session started successfully: {data}")
        return data

    # ────────────────────────── TTS tasks ────────────────────────────
    def send_text(self, session_id: str, text: str) -> Json:
        logger.info(f"Sending text to session {session_id}: {text[:50]}...")
        logger.info("Complete transcript being sent to HeyGen:\n%s", text)  # Log the complete transcript
        r = requests.post(
            f"{self.base}/v1/streaming.task",
            headers=self.h,
            json={"session_id": session_id, "text": text},
            timeout=50,
        )
        r.raise_for_status()
        data = r.json()["data"]
        logger.info(f"Text sent successfully. Task ID: {data.get('task_id')}")
        return data

    # ───────────────────────────── misc ──────────────────────────────
    def stop_session(self, session_id: str) -> None:
        logger.info(f"Stopping session {session_id}")
        r = requests.post(
            f"{self.base}/v1/streaming.stop",
            headers=self.h,
            json={"session_id": session_id},
            timeout=50,
        )
        r.raise_for_status()
        logger.info(f"Session {session_id} stopped successfully")

    def get_status(self, session_id: str) -> Json:
        logger.debug(f"Getting status for session {session_id}")
        r = requests.get(
            f"{self.base}/v1/streaming.status",
            headers=self.h,
            params={"session_id": session_id},
            timeout=50,
        )
        r.raise_for_status()
        data = r.json()["data"]
        logger.debug(f"Session status: {data}")
        return data

    def __del__(self):
        try:
            if hasattr(self, 'sid'):
                logger.info(f"Cleaning up session {self.sid}")
                self.stop_session(self.sid)
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
