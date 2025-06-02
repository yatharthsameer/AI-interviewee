# backend/gemsdk.py

"""
Wrapper around the official google-generativeai SDK (pip install google-generativeai>=0.5).
This file exposes a synchronous .stream(...) method that internally drives a one-shot
Gemini streaming call (chat.send_message with stream=True) and yields each incremental chunk.

Now exposes::

    stream(hist, *, persona_prompt: str, max_context=20) -> Iterator[str]

`persona_prompt` is injected as the very first "user" turn so Gemini
stays in-character.
"""

from __future__ import annotations
import os
import asyncio
import logging
import google.generativeai as genai

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("gemini")

# A single chat‐message format: {"role": "user"|"assistant", "content": "…"}
_Msg = dict[str, str]


class GeminiSDK:
    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        key = api_key or os.getenv("GEMINI_API_KEY")
        if not key:
            logger.error("GEMINI_API_KEY not set")
            raise RuntimeError("GEMINI_API_KEY not set")

        # Default to a valid model in v1beta
        self.model_name = model or os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
        logger.info(f"Initializing GeminiSDK with model: {self.model_name}")

        genai.configure(api_key=key)
        self._model = genai.GenerativeModel(
            self.model_name,
            generation_config={
                "temperature": 0.8,
                "top_p": 0.95,
                "top_k": 40,
                "max_output_tokens": 256,
            },
        )

        # ① RICH “system prompt” that includes persona + resume bullets
        #    You can extend this block with real bullet points from your candidate.
        self._system_instruction = """
You are “Alex Morgan,” a third-year Software Engineering student at StateTech.
Your resume bullets:
  • Intern @ AcmeCorp (Summer 2024): Built Flask REST services, containerized with Docker, collaborated in a 5-person agile team.
  • Front-End Intern @ DataViz Inc. (Jan–Jun 2023): Developed React/Redux dashboards, wrote Jest tests, ran A/B experiments.
  • University Projects: Chatbot in Python (NLTK), Swift iOS campus navigation app, open-source Django plugin.
Speaking style:
  • Keep behavioral answers in STAR format (Situation, Task, Action, Result).
  • Answer all questions in 1–3 short sentences—no markdown, no bullet points.
  • Occasionally start with a brief hesitation (e.g. “um…”, “let me think…”).
  • Speak naturally, as if you're in a live video interview.
Now answer the interviewer's questions as this candidate.
""".strip()
        logger.info("GeminiSDK initialized successfully")

    def _to_genai(self, hist: list[_Msg]) -> list[dict]:
        """
        Convert our {"role", "content"} history into the format that
        google-generativeai expects: {"role": "...", "parts":[{"text": ...}]}.
        """
        logger.debug(f"Converting {len(hist)} messages to Gemini format")
        out: list[dict] = []
        for m in hist:
            out.append(
                {
                    "role": "user" if m["role"] == "user" else "model",
                    "parts": [{"text": m["content"]}],
                }
            )
        return out

    def stream(
        self,
        hist: list[_Msg],
        *,
        persona_prompt: str,
        max_context: int = 20,
    ):
        """
        Yield **exactly one** final reply (iterator of len==1) – same
        contract as before, but with an injected persona prompt.
        """

        # ▸ 1. split history → context + current Q
        if not hist or hist[-1]["role"] != "user":
            raise ValueError("Last message must be a user question")
        current_q = hist[-1]["content"]
        context   = hist[:-1]

        # ▸ 2. build start_chat() history
        turns = (
            [{"role": "user",
              "parts": [{"text": persona_prompt}]}] +
            self._to_genai(context[-max_context:])
        )
        chat = self._model.start_chat(history=turns)

        # ▸ 3. one-shot generate (blocking)
        reply = chat.send_message(current_q).text
        logger.info("Gemini reply: %s", reply[:120] + ("…" if len(reply) > 120 else ""))

        yield reply  # keep Conversation contract
