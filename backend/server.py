# server.py ── ultra-slim backend (Gemini only)

import os, logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from conversation import Conversation
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log = logging.getLogger("server")

# ────────── sanity check ──────────
if not os.getenv("GEMINI_API_KEY"):
    raise RuntimeError("GEMINI_API_KEY must be set in env")

# ────────── app / state ──────────
APP = Flask(__name__)
CORS(APP)  # allow browser → 5001
CHAT = Conversation()  # one shared convo (good enough for an MVP)


# ────────── endpoints ────────────
@APP.post("/api/send_text")
def api_send_text():
    j = request.get_json(force=True, silent=True) or {}
    text = (j.get("text") or "").strip()
    use_ai = bool(j.get("generate_ai"))  # front-end always sends true

    spoken = CHAT.reply(text, use_ai=use_ai)

    # If empty response, it means speech was buffered
    if not spoken:
        return jsonify(spoken="", buffered=True)

    return jsonify(spoken=spoken, buffered=False)


@APP.post("/api/avatar_state")
def api_avatar_state():
    """Update avatar speaking state."""
    j = request.get_json(force=True, silent=True) or {}
    speaking = bool(j.get("speaking", False))

    CHAT.set_avatar_speaking(speaking)
    return jsonify(success=True)


@APP.get("/api/check_accumulated")
def api_check_accumulated():
    """Check if there's an accumulated response ready."""
    response = CHAT.get_accumulated_response()
    if response:
        return jsonify(spoken=response, available=True)
    return jsonify(available=False)


@APP.post("/api/interrupt")
def api_interrupt():
    """Handle an interruption: stop avatar, clear buffer, and start 5s accumulation window."""
    CHAT.interrupt()
    return jsonify(success=True)


# ────────── run ───────────────────
if __name__ == "__main__":
    log.info("★ Gemini-only backend ready on http://0.0.0.0:5001")
    APP.run(host="0.0.0.0", port=5001, threaded=True)
