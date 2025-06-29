# server.py ── ultra-slim backend (Gemini + OpenAI)

import os, logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from conversation import Conversation
from dotenv import load_dotenv
import base64
from gemsdk import GeminiClient
from openai_client import OpenAIClient
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

# Initialize OpenAI client (optional - only if API key is provided)
OPENAI_CLIENT = None
try:
    if os.getenv("CHATGPT_API_KEY"):
        OPENAI_CLIENT = OpenAIClient()
        log.info("OpenAI client initialized successfully")
    else:
        log.warning("CHATGPT_API_KEY not found - OpenAI features will be disabled")
except Exception as e:
    log.error(f"Failed to initialize OpenAI client: {e}")
    log.warning("OpenAI features will be disabled")


# Model routing helper
def get_ai_client_and_model(model_name):
    """Return appropriate client and model name for the given model."""
    if model_name.startswith("gpt-"):
        if not OPENAI_CLIENT:
            raise ValueError("OpenAI client not available. Please set CHATGPT_API_KEY.")
        return OPENAI_CLIENT, model_name
    elif model_name.startswith("gemini-"):
        return GEMINI_CLIENT, model_name
    else:
        # Default to Gemini
        return GEMINI_CLIENT, "gemini-1.5-flash"


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

        # Get text, image, and model from request
        user_text = j.get("text", "").strip()
        image_data = j.get("image")
        model_name = j.get("model", "gemini-1.5-flash")

        if not user_text and not image_data:
            log.error("No text or image provided in request")
            return jsonify(error="No text or image provided"), 400

        log.info(
            f"Received chat - Text: {'Yes' if user_text else 'No'}, Image: {'Yes' if image_data else 'No'}, Model: {model_name}"
        )
        if user_text:
            log.info(f"Text content: {user_text[:100]}...")
        if image_data:
            log.info(f"Image data length: {len(image_data)} characters")

        try:
            # Get appropriate client and model
            ai_client, actual_model = get_ai_client_and_model(model_name)
            log.info(
                f"Using AI client: {type(ai_client).__name__} with model: {actual_model}"
            )

            if model_name.startswith("gpt-"):
                # OpenAI/ChatGPT handling
                if user_text and image_data:
                    # Both text and image
                    response_text = ai_client.analyze_image_with_text(
                        user_text, image_data, actual_model
                    )
                elif image_data:
                    # Image only
                    response_text = ai_client.analyze_image_only(
                        image_data, actual_model
                    )
                else:
                    # Text only
                    response_text = ai_client.analyze_text(user_text, actual_model)

            else:
                # Gemini handling (existing logic)
                genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
                model = genai.GenerativeModel(actual_model)

                # Prepare content based on what we have
                content = []

                if user_text and image_data:
                    # Both text and image
                    content.append(user_text)
                    # Process image
                    image_data_clean = (
                        image_data.split(",")[1]
                        if image_data.startswith("data:image")
                        else image_data
                    )
                    image_bytes = base64.b64decode(image_data_clean)
                    image = Image.open(BytesIO(image_bytes))
                    # Resize if needed
                    max_dimension = 1024
                    if max(image.size) > max_dimension:
                        ratio = max_dimension / max(image.size)
                        new_size = (
                            int(image.size[0] * ratio),
                            int(image.size[1] * ratio),
                        )
                        image = image.resize(new_size, Image.Resampling.LANCZOS)
                    if image.mode != "RGB":
                        image = image.convert("RGB")
                    content.append(image)
                    log.info(
                        f"Prepared multimodal content: text + image ({image.size})"
                    )

                elif image_data:
                    # Image only
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
                        new_size = (
                            int(image.size[0] * ratio),
                            int(image.size[1] * ratio),
                        )
                        image = image.resize(new_size, Image.Resampling.LANCZOS)
                    if image.mode != "RGB":
                        image = image.convert("RGB")
                    content.append(image)
                    log.info(f"Prepared image-only content: image ({image.size})")

                else:
                    # Text only
                    content.append(user_text)
                    log.info("Prepared text-only content")

                # Send to Gemini
                response = model.generate_content(content)
                response_text = response.text

            if response_text:
                log.info("Successfully received chat response from AI")
                log.info(f"Response length: {len(response_text)}")
                log.info(f"Response preview: {response_text[:100]}...")

                return jsonify(response=response_text, success=True)
            else:
                log.error("Empty response from AI for chat")
                return jsonify(error="Empty response from AI", success=False)

        except Exception as ai_error:
            log.error(f"AI chat analysis failed: {ai_error}")
            import traceback

            log.error(f"Full traceback: {traceback.format_exc()}")
            return jsonify(error=f"Failed to analyze: {str(ai_error)}", success=False)

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

        # Get image data and model - can be single image or array of images
        image_data = j.get("image")
        images_data = j.get("images", [])
        model_name = j.get("model", "gemini-1.5-flash")

        # Support both single image and multiple images
        if image_data and not images_data:
            images_data = [image_data]
        elif not images_data:
            log.error("No image data provided in request")
            return jsonify(error="No image data provided"), 400

        log.info(
            f"Received {len(images_data)} screenshot(s) for analysis with model: {model_name}"
        )

        # Prepare prompt based on number of images
        if len(images_data) == 1:
            prompt = "Solve this question, and give me the code for the same."
        else:
            prompt = f"Analyze these {len(images_data)} screenshots which show different parts of the same coding question. Solve the complete question and provide the code solution."

        log.info(f"Using prompt: {prompt}")

        try:
            # Get appropriate client and model
            ai_client, actual_model = get_ai_client_and_model(model_name)
            log.info(
                f"Using AI client: {type(ai_client).__name__} with model: {actual_model}"
            )

            if model_name.startswith("gpt-"):
                # OpenAI/ChatGPT handling
                log.info("Calling OpenAI for screenshot analysis...")
                response = ai_client.analyze_multiple_images(
                    images_base64=images_data, prompt=prompt, model=actual_model
                )
            else:
                # Gemini handling (existing logic)
                log.info("Calling GeminiClient.analyze_multiple_images...")
                response = GEMINI_CLIENT.analyze_multiple_images(
                    images_base64=images_data, prompt=prompt
                )

            log.info("Successfully analyzed screenshots with AI")
            log.info(f"Response length: {len(response)}")
            log.info(f"Response preview: {response[:200]}...")

            return jsonify(solution=response, success=True)

        except Exception as ai_error:
            log.error(f"AI analysis failed: {ai_error}")
            log.error(f"Exception type: {type(ai_error).__name__}")
            import traceback

            log.error(f"Full traceback: {traceback.format_exc()}")
            return jsonify(error=f"Failed to analyze image: {str(ai_error)}"), 500

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
