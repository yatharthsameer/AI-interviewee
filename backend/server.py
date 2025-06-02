# -*- coding: utf-8 -*-
import os, threading, uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
from heygensdk import HeyGenSDK
from conversation import Conversation
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

hg = HeyGenSDK()
conv = {}  # sid -> Conversation
lock = threading.Lock()
# load .env file
load_dotenv()

# ───────────────────────── session bootstrap ────────────────────────
@app.route("/api/session", methods=["POST"])
def new_session():
    body = request.get_json(silent=True) or {}
    avatar = body.get("avatar_id") or os.getenv("HEYGEN_AVATAR_ID")
    voice = body.get("voice_id") or os.getenv("HEYGEN_VOICE_ID")

    if not avatar or not voice:
        return jsonify(error="HEYGEN_AVATAR_ID and HEYGEN_VOICE_ID must be set"), 400

    data = hg.create_session(
        avatar_name=avatar, voice_id=voice, disable_idle_timeout=False
    )
    sid = data["session_id"]

    # ── field extraction (v2-alpha spec) ────────────────────────────
    sdp_offer = data.get("sdp")         # ← always a dict {type,sdp}
    ice       = (data.get("ice_servers") or
                 data.get("ice_servers2") or  # some plans return this
                 data.get("iceServers"))

    if not sdp_offer or not ice:
        # dump the whole payload so you can inspect it
        return jsonify(
            error="Un-recognised streaming.new response",
            payload=data
        ), 502

    with lock:
        conv[sid] = Conversation(sid, hg)

    return jsonify({
        "session_id": sid,
        "sdpOffer":   sdp_offer,        # full dict, client passes as-is
        "iceServers": ice
    })


# ────────────────────────── WebRTC helpers ──────────────────────────
@app.route("/api/ice", methods=["POST"])
def ice():
    j = request.json
    hg.add_ice_candidate(j["session_id"], j["candidate"])
    return jsonify(ok=True)


@app.route("/api/start", methods=["POST"])
def start():
    j = request.get_json(silent=True) or {}
    sid = j.get("session_id")
    sdp_str = j.get("sdp")  # this is just the answer.sdp string
    if not sid or not sdp_str:
        return jsonify(error="missing session_id or sdp"), 400

    # heygensdk now wraps that raw string into {"type":"answer","sdp":...}
    hg.start_session(sid, sdp_str)
    return jsonify(ok=True)


def _terminate_session(sid: str):
    """helper – stop HeyGen + cleanup Conversation"""
    try:
        hg.stop_session(sid)
    finally:
        with lock:
            if (c := conv.pop(sid, None)):
                # Conversation currently has no resources to release,
                # but if you add ws/threads later put it here:
                getattr(c, "close", lambda: None)()


@app.route("/api/stop",  methods=["POST"])   # kept for backward compatibility
@app.route("/api/close", methods=["POST"])   # ← new preferred endpoint
def close():
    sid = (request.json or {}).get("session_id")
    if not sid:
        return jsonify(error="session_id required"), 400
    _terminate_session(sid)
    return jsonify(closed=True)


# ──────────────────────────── TTS proxy ────────────────────────────
@app.route("/api/send_text", methods=["POST"])
def tts():
    j = request.json
    sid = j["session_id"]
    text = j.get("text", "").strip()
    use = bool(j.get("generate_ai"))

    c = conv.get(sid)
    if not c:
        return jsonify(error="session not found"), 404

    # Handle empty text case
    if not text:
        spoken = "Hey, I didn't quite get what you said. Can you repeat that for me again?"
        c.hg.send_text(sid, spoken)
        return jsonify(spoken=spoken)

    spoken = c.send(text, use_ai=use)
    return jsonify(spoken=spoken)


# ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if not (
        os.getenv("HEYGEN_API_KEY")
        and os.getenv("GEMINI_API_KEY")
        and os.getenv("HEYGEN_AVATAR_ID")
        and os.getenv("HEYGEN_VOICE_ID")
    ):
        raise RuntimeError("Set HEYGEN_* and GEMINI_API_KEY in env")
    app.run(host="0.0.0.0", port=5001, threaded=True)
