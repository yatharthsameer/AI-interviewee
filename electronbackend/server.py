# server.py ── ultra-slim backend (Gemini only)

import os, logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from conversation import Conversation
from dotenv import load_dotenv
import base64
from gemsdk import GeminiClient
import google.generativeai as genai
from PIL import Image
from io import BytesIO

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
CORS(APP)  # allow browser → 5002 (changed port to avoid conflict)
CHAT = Conversation()  # one shared convo (good enough for an MVP)
GEMINI_CLIENT = GeminiClient()  # For screenshot analysis


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


@APP.get("/api/avatar_state")
def api_get_avatar_state():
    """Get current avatar speaking state."""
    return jsonify(speaking=CHAT._avatar_speaking)


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


@APP.post("/api/test_gemini")
def api_test_gemini():
    """Test Gemini API with a simple text request."""
    try:
        log.info("Testing Gemini API with text-only request...")

        # Simple text test
        test_model = genai.GenerativeModel("gemini-1.5-flash")
        response = test_model.generate_content("Say hello and confirm you're working!")

        if response.text:
            log.info(f"Gemini API test successful: {response.text}")
            return jsonify(success=True, response=response.text)
        else:
            log.error("Gemini API test failed: empty response")
            return jsonify(success=False, error="Empty response from Gemini")

    except Exception as e:
        log.error(f"Gemini API test failed: {e}")
        return jsonify(success=False, error=str(e))


@APP.post("/api/chat")
def api_chat():
    """Analyze text and/or image and provide a short answer."""
    try:
        log.info("=== Chat API called ===")
        j = request.get_json(force=True, silent=True) or {}

        # Get text and image from request
        user_text = j.get("text", "").strip()
        image_data = j.get("image")

        if not user_text and not image_data:
            log.error("No text or image provided in request")
            return jsonify(error="No text or image provided"), 400

        log.info(
            f"Received chat - Text: {'Yes' if user_text else 'No'}, Image: {'Yes' if image_data else 'No'}"
        )
        if user_text:
            log.info(f"Text content: {user_text[:100]}...")
        if image_data:
            log.info(f"Image data length: {len(image_data)} characters")

        try:
            log.info("Calling Gemini for chat analysis...")

            # Configure Gemini
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            model = genai.GenerativeModel("gemini-1.5-flash")

            # Prepare content based on what we have
            content = []

            if user_text and image_data:
                # Both text and image
                prompt = f"Analyze this image and text together and answer what is asked for in short. Text: {user_text}"
                content.append(prompt)

                # Process image
                image_data_clean = (
                    image_data.split(",")[1]
                    if image_data.startswith("data:image")
                    else image_data
                )
                image_bytes = base64.b64decode(image_data_clean)
                image = Image.open(BytesIO(image_bytes))

                # Resize if needed (same as screenshot logic)
                max_dimension = 1024
                if max(image.size) > max_dimension:
                    ratio = max_dimension / max(image.size)
                    new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                    image = image.resize(new_size, Image.Resampling.LANCZOS)

                if image.mode != "RGB":
                    image = image.convert("RGB")

                content.append(image)
                log.info(f"Prepared multimodal content: text + image ({image.size})")

            elif image_data:
                # Image only
                prompt = "Analyze this image and answer what is asked for in short"
                content.append(prompt)

                # Process image (same logic as above)
                image_data_clean = (
                    image_data.split(",")[1]
                    if image_data.startswith("data:image")
                    else image_data
                )
                image_bytes = base64.b64decode(image_data_clean)
                image = Image.open(BytesIO(image_bytes))

                max_dimension = 1024
                if max(image.size) > max_dimension:
                    ratio = max_dimension / max(image.size)
                    new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
                    image = image.resize(new_size, Image.Resampling.LANCZOS)

                if image.mode != "RGB":
                    image = image.convert("RGB")

                content.append(image)
                log.info(f"Prepared image-only content: image ({image.size})")

            else:
                # Text only
                prompt = f"Analyze this text and answer what is asked for in short: {user_text}"
                content.append(prompt)
                log.info("Prepared text-only content")

            # Send to Gemini
            response = model.generate_content(content)

            if response.text:
                log.info("Successfully received chat response from Gemini")
                log.info(f"Response length: {len(response.text)}")
                log.info(f"Response preview: {response.text[:100]}...")

                return jsonify(response=response.text, success=True)
            else:
                log.error("Empty response from Gemini for chat")
                return jsonify(error="Empty response from AI", success=False)

        except Exception as gemini_error:
            log.error(f"Gemini chat analysis failed: {gemini_error}")
            import traceback

            log.error(f"Full traceback: {traceback.format_exc()}")
            return jsonify(
                error=f"Failed to analyze: {str(gemini_error)}", success=False
            )

    except Exception as e:
        log.error(f"Chat API error: {e}")
        import traceback

        log.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify(error=str(e), success=False)


@APP.post("/api/screenshot")
def api_screenshot():
    """Analyze screenshot(s) and provide solution."""
    try:
        log.info("=== Screenshot API called ===")
        j = request.get_json(force=True, silent=True) or {}

        # Get image data - can be single image or array of images
        image_data = j.get("image")
        images_data = j.get("images", [])

        # Support both single image and multiple images
        if image_data and not images_data:
            images_data = [image_data]
        elif not images_data:
            log.error("No image data provided in request")
            return jsonify(error="No image data provided"), 400

        log.info(f"Received {len(images_data)} screenshot(s) for analysis")

        # Send to Gemini for analysis
        if len(images_data) == 1:
            prompt = "Solve this question, and give me the code for the same."
        else:
            prompt = f"Analyze these {len(images_data)} screenshots which show different parts of the same coding question. Solve the complete question and provide the code solution."

        log.info(f"Using prompt: {prompt}")

        try:
            log.info("Calling GeminiClient.analyze_multiple_images...")
            response = GEMINI_CLIENT.analyze_multiple_images(
                images_base64=images_data, prompt=prompt
            )

            log.info("Successfully analyzed screenshots with Gemini")
            log.info(f"Response length: {len(response)}")
            log.info(f"Response preview: {response[:200]}...")

            return jsonify(solution=response, success=True)

        except Exception as gemini_error:
            log.error(f"Gemini analysis failed: {gemini_error}")
            log.error(f"Exception type: {type(gemini_error).__name__}")
            import traceback

            log.error(f"Full traceback: {traceback.format_exc()}")
            return jsonify(error=f"Failed to analyze image: {str(gemini_error)}"), 500

    except Exception as e:
        log.error(f"Screenshot API error: {e}")
        log.error(f"Exception type: {type(e).__name__}")
        import traceback

        log.error(f"Full traceback: {traceback.format_exc()}")
        return jsonify(error=str(e)), 500


# ────────── run ───────────────────
if __name__ == "__main__":
    log.info("★ Electron backend ready on http://0.0.0.0:5002")
    APP.run(host="0.0.0.0", port=5002, threaded=True)
