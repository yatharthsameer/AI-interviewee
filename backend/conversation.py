# conversation.py ── Gemini persona wrapper (no TTS here)

from __future__ import annotations
import re, random, html, logging, threading, time
from gemsdk import GeminiSDK
from persona import persona

log = logging.getLogger("conversation")

# sentence boundary
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
_CODE_BLOCK = re.compile(r"```.*?```", re.S)
_INLINE_CODE = re.compile(r"`[^`]+`")
_EXTRA_PUNCT = re.compile(r"[!?,]{2,}")


class Conversation:
    """Keeps chat history & generates Gemini replies."""

    def __init__(self) -> None:
        self.llm = GeminiSDK()
        self.hist: list[dict] = []  # {"role","content"}
        self.persona_prompt = self._make_persona_prompt()

        # Speech accumulation state
        self._avatar_speaking = False
        self._speech_buffer = []
        self._buffer_lock = threading.Lock()
        self._processing_timer = None

        log.info("Conversation initialised")

    # ────────────────────────────────────────────────────────────────
    @staticmethod
    def _make_persona_prompt() -> str:
        """Assemble a rich, single-shot system/persona prompt."""
        return (
            f"You are {persona.name}, a {persona.education.year}-year Dual Degree student "
            f"at {persona.education.institution} with a GPA of {persona.education.gpa}. "
            f"You're studying {persona.education.degree}. "
            "You have extensive experience in full-stack development, distributed systems, and MLOps, "
            "with notable achievements including AIR 423 in JEE Advanced among 2M+ candidates and being a Candidate Master on Codeforces (max rating 1950). "
            "You've worked at companies like Sprinklr, Mercor, Merlin AI, and Narrato AI, building scalable systems and AI platforms. "
            "Your key projects include JusticeSearch (distributed legal search engine), NeuralCoder (GPT-4 fine-tuned CP assistant), "
            "and multi-tenant AI hiring platforms. You're proficient in Go, C++, Python, Java, TypeScript, and various cloud technologies. "
            "Speak casually, 1-3 sentences, occasionally hesitating with "
            '"um…", "let me think…". Use STAR for behavioral answers. '
            "When discussing technical topics, draw from your experience with "
            "distributed systems, cloud platforms (GCP, AWS), machine learning, and full-stack development. "
            "Never output markdown or code fences. "
            "This is supposed to be an interview, so be concise and to the point, keeping your response natural, conversational."
            "You are a software engineer with 5 years of experience in the industry."
            "Keep every answer under 300 characters."
        )

    # ────────────────────────────────────────────────────────────────
    def _add_hesitation(self, txt: str) -> str:
        if random.random() < 0.3:
            pref = random.choice(
                ["um… ", "let me think… ", "right… ", "hmm… ", "well… "]
            )
            return pref + txt[0].lower() + txt[1:]
        return txt

    def _clean(self, txt: str) -> str:
        txt = _CODE_BLOCK.sub(" ", txt)
        txt = _INLINE_CODE.sub(" ", txt)
        txt = html.unescape(txt)
        txt = _EXTRA_PUNCT.sub(lambda m: m.group(0)[0], txt)
        txt = txt.replace("\n", " ")
        return re.sub(r"\s{2,}", " ", txt).strip()

    # ────────────────────────────────────────────────────────────────
    def set_avatar_speaking(self, speaking: bool) -> None:
        """Update avatar speaking state and handle speech buffer."""
        with self._buffer_lock:
            was_speaking = self._avatar_speaking
            self._avatar_speaking = speaking

            if was_speaking and not speaking:
                # Avatar just finished speaking, schedule buffer processing
                self._schedule_buffer_processing()
            elif not was_speaking and speaking:
                # Avatar just started speaking, cancel any pending processing
                if self._processing_timer:
                    self._processing_timer.cancel()
                    self._processing_timer = None

        log.info(f"Avatar speaking state: {speaking}")

    def _schedule_buffer_processing(self) -> None:
        """Schedule processing of accumulated speech after a delay."""
        if self._processing_timer:
            self._processing_timer.cancel()

        self._processing_timer = threading.Timer(1.5, self._process_speech_buffer)
        self._processing_timer.start()
        log.info("Scheduled speech buffer processing in 1.5 seconds")

    def _process_speech_buffer(self) -> None:
        """Process accumulated speech buffer."""
        with self._buffer_lock:
            if not self._speech_buffer:
                log.info("Speech buffer empty, nothing to process")
                return

            # Combine all accumulated speech
            combined_text = " ".join(self._speech_buffer)
            self._speech_buffer.clear()
            log.info(f"Processing accumulated speech: {combined_text[:100]}...")

        # Generate response to accumulated speech (bypass speaking state check)
        if not combined_text:
            return

        # Add to history and generate response
        self.hist.append({"role": "user", "content": combined_text})
        raw = next(
            self.llm.stream(
                self.hist,
                persona_prompt=self.persona_prompt,
                max_context=20,
            )
        )
        raw = self._add_hesitation(raw)
        response = self._clean(raw)
        self.hist.append({"role": "assistant", "content": response})

        # Limit response length
        if len(response) > 390:
            response = response[:390] + "..."

        log.info(f"Generated response to accumulated speech: {response[:100]}...")

        # Store the response for retrieval
        self._last_accumulated_response = response

    def get_accumulated_response(self) -> str | None:
        """Get the response to accumulated speech if available."""
        response = getattr(self, "_last_accumulated_response", None)
        if response:
            delattr(self, "_last_accumulated_response")
        return response

    # ────────────────────────────────────────────────────────────────
    def reply(self, user_text: str, *, use_ai: bool = True) -> str:
        if not user_text:
            return "Hey, I didn't quite catch that – could you repeat?"

        with self._buffer_lock:
            if self._avatar_speaking:
                # Avatar is speaking, buffer this speech
                self._speech_buffer.append(user_text)
                log.info(f"Buffered speech while avatar speaking: {user_text[:50]}...")
                return ""  # Return empty to indicate buffering
            else:
                # Avatar not speaking, process immediately
                log.info(f"Processing speech immediately: {user_text[:50]}...")

        if use_ai:
            self.hist.append({"role": "user", "content": user_text})
            raw = next(
                self.llm.stream(
                    self.hist,
                    persona_prompt=self.persona_prompt,
                    max_context=20,
                )
            )
            raw = self._add_hesitation(raw)
            reply = self._clean(raw)
            self.hist.append({"role": "assistant", "content": reply})
        else:
            reply = self._clean(user_text)

        # Limit response length to prevent unnecessarily long responses
        if len(reply) > 390:
            reply = reply[:390] + "..."

        return reply

    def interrupt(self):
        """Handle an interruption: stop avatar, clear buffer, and start 5s accumulation window."""
        with self._buffer_lock:
            # Clear any pending buffer and cancel timers
            self._speech_buffer.clear()
            if self._processing_timer:
                self._processing_timer.cancel()
                self._processing_timer = None
            self._avatar_speaking = True  # treat as speaking during accumulation
        log.info("Interruption detected: starting 5s accumulation window.")
        # After 5 seconds, treat as done speaking and process buffer
        self._processing_timer = threading.Timer(
            5.0, self._end_interruption_accumulation
        )
        self._processing_timer.start()

    def _end_interruption_accumulation(self):
        with self._buffer_lock:
            self._avatar_speaking = False
        self._schedule_buffer_processing()
