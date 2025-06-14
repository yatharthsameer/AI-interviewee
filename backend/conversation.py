# backend/conversation.py

# -*- coding: utf-8 -*-
import time
import threading
import re
import random
import html
import logging
from heygensdk import HeyGenSDK
from gemsdk import GeminiSDK
from persona import persona

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("conversation")

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")  # sentence boundary
# strip fenced code blocks  ``` … ```
_CODE_BLOCK = re.compile(r"```.*?```", re.S)
# strip inline back‐ticked fragments  `like this`
_INLINE_CODE = re.compile(r"`[^`]+`")
# collapse runs of punctuation like "!!" to "!"
_EXTRA_PUNCT = re.compile(r"[!?,]{2,}")


class Conversation:
    """
    Tracks chat history & streams Gemini output to HeyGen sequentially.
    """

    def __init__(self, session_id: str, hg: HeyGenSDK):
        self.sid = session_id
        self.hg = hg
        self.llm = GeminiSDK()
        self.hist: list[dict] = []  # {"role": "user" | "assistant", "content": ...}
        # build *once*; cheaper than re-building every turn
        self._persona_prompt = self._make_persona_prompt()
        logger.info(f"Initialized conversation for session {session_id}")

    # ------------------------------------------------------------------
    @staticmethod
    def _make_persona_prompt() -> str:
        """Assemble a rich, single-shot system/persona prompt."""
        return (
            f"You are {persona.name}, a {persona.education.year}-year Dual Degree student "
            f"at {persona.education.institution} with a GPA of {persona.education.gpa}. "
            f"You're studying {persona.education.degree}. "
            "You have extensive experience in full-stack development, distributed systems, and MLOps, "
            "with notable achievements including AIR 423 in JEE Advanced and being an Expert on Codeforces. "
            "Speak casually, 1-3 sentences, occasionally hesitating with "
            '"um…", "let me think…". Use STAR for behavioral answers. '
            "When discussing technical topics, draw from your experience with "
            "Python, Go, Java, TypeScript, and various frameworks like Spring Boot, Next.js, and PyTorch. "
            "Never output markdown or code fences."
        )

    # ------------------------------------------------------------------
    def _idle(self, poll=1.0):
        """
        Block until HeyGen's avatar is not streaming any audio/video.
        """
        while True:
            try:
                st = self.hg.get_status(self.sid)
            except Exception:
                break  # treat any HTTP error as "idle"
            flag = (
                st.get("connectionStatus")
                or st.get("connection_status")
                or st.get("status")
            )
            if flag != "streaming":
                break
            time.sleep(poll)

    # ------------------------------------------------------------------
    def _add_hesitation(self, text: str) -> str:
        """
        Prepend a short hesitation ~30% of the time.
        """
        if random.random() < 0.3:
            prefix = random.choice(["um… ", "let me think… ", "right… "])
            return prefix + text[0].lower() + text[1:]
        return text

    # ------------------------------------------------------------------
    def _clean_for_tts(self, txt: str) -> str:
        """
        Remove markdown, code fences, extra punctuation, collapse whitespace,
        and unescape HTML entities—so HeyGen's TTS speaks cleanly.
        """
        txt = _CODE_BLOCK.sub(" ", txt)
        txt = _INLINE_CODE.sub(" ", txt)
        txt = html.unescape(txt)
        txt = _EXTRA_PUNCT.sub(lambda m: m.group(0)[0], txt)  # "!!" → "!"
        txt = txt.replace("\n", " ")
        txt = re.sub(r"\s{2,}", " ", txt).strip()
        return txt

    # ------------------------------------------------------------------
    def send(self, user_text: str, *, use_ai: bool = False) -> str:
        """
        Called by server /api/send_text.  Returns the final "spoken" string.
        """
        logger.info(f"Received user text: {user_text}")

        # Handle empty text case
        if not user_text.strip():
            logger.info("Empty text received, sending default response")
            return "Hey, I didn't quite get what you said. Can you repeat that for me again?"

        if use_ai:
            logger.info("Generating AI response using Gemini")
            self.hist.append({"role": "user", "content": user_text})
            # single (full) reply returned in one chunk
            reply = next(
                self.llm.stream(
                    self.hist,
                    persona_prompt=self._persona_prompt,
                    max_context=20,
                )
            )
            logger.info(f"Gemini response: {reply}")
            reply = self._add_hesitation(reply)
            self.hist.append({"role": "assistant", "content": reply})
        else:
            logger.info("Using user text directly (no AI generation)")
            reply = user_text

        reply = self._clean_for_tts(reply)
        logger.info(f"Cleaned text for TTS: {reply}")

        # split ≤180-char chunks on sentence boundary
        chunks, buf = [], ""
        for sent in _SENT_SPLIT.split(reply):
            if len(buf) + len(sent) + 1 > 150:
                if buf:
                    chunks.append(buf.strip())
                buf = sent
            else:
                buf += (" " if buf else "") + sent
        if buf:
            chunks.append(buf.strip())

        logger.info(f"Split into {len(chunks)} chunks for HeyGen")
        for i, ch in enumerate(chunks, 1):
            logger.info(f"Sending chunk {i}/{len(chunks)} to HeyGen: {ch}")
            self._idle()
            self.hg.send_text(self.sid, ch)
            self._idle()  # wait again – ensures serial queue

        return reply
