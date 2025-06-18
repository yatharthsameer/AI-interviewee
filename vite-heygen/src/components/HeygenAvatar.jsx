import { useRef, useState, useCallback, useEffect } from "react";
import { useTabAudio } from "../hooks/useTabAudio";

const HEYGEN_API_KEY = import.meta.env.VITE_HEYGEN_API_KEY || "";
// const AVATAR_NAME = "7d89c5d221a843afab7f7412afcd743b"; // Yatharth Sameer avatar ID
const AVATAR_NAME = "Wayne_20240711"; // from HeyGen docs demo

const WS_URL = "ws://localhost:8765";
const BACKEND = "http://localhost:5001";

export default function HeygenAvatar() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const videoRef = useRef(null);
  const avatarRef = useRef(null);
  const taskTypeRef = useRef(null); // To store TaskType after dynamic import
  const accumulatedResponseIntervalRef = useRef(null);
  const interruptionTimeoutRef = useRef(null);

  // Notify backend about avatar speaking state
  const notifyAvatarState = useCallback(async (speaking) => {
    try {
      await fetch(`${BACKEND}/api/avatar_state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaking }),
      });
    } catch (err) {
      console.error("[HeygenAvatar] Failed to notify avatar state:", err);
    }
  }, []);

  // Poll for accumulated responses
  const startAccumulatedResponsePolling = useCallback(() => {
    if (accumulatedResponseIntervalRef.current) {
      clearInterval(accumulatedResponseIntervalRef.current);
    }

    accumulatedResponseIntervalRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${BACKEND}/api/check_accumulated`);
        const { available, spoken } = await resp.json();

        if (available && spoken) {
          console.log(
            "[HeygenAvatar] Processing accumulated response:",
            spoken
          );

          // Stop polling
          if (accumulatedResponseIntervalRef.current) {
            clearInterval(accumulatedResponseIntervalRef.current);
            accumulatedResponseIntervalRef.current = null;
          }

          // Speak the accumulated response
          if (avatarRef.current) {
            await avatarRef.current
              .speak({
                text: spoken,
                taskType: taskTypeRef.current || undefined,
              })
              .catch((e) => {
                console.error("[HeygenAvatar] Avatar speak error:", e);
              });
          }
        }
      } catch (err) {
        console.error(
          "[HeygenAvatar] Failed to check accumulated response:",
          err
        );
      }
    }, 500); // Check every 500ms
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (accumulatedResponseIntervalRef.current) {
        clearInterval(accumulatedResponseIntervalRef.current);
      }
    };
  }, []);

  // Interrupt handler
  const handleInterruption = useCallback(async () => {
    // Stop avatar speech immediately
    if (avatarRef.current) {
      try {
        await avatarRef.current.stopAvatar();
      } catch (e) {
        console.warn("[HeygenAvatar] Error stopping avatar on interruption", e);
      }
    }
    setAvatarSpeaking(false);
    notifyAvatarState(false);
    // Notify backend to start 5s accumulation window
    await fetch(`${BACKEND}/api/interrupt`, { method: "POST" });
    // Start polling for accumulated response after 5s
    if (interruptionTimeoutRef.current)
      clearTimeout(interruptionTimeoutRef.current);
    interruptionTimeoutRef.current = setTimeout(() => {
      startAccumulatedResponsePolling();
    }, 5100); // 5.1s to ensure backend timer elapses
  }, [notifyAvatarState, startAccumulatedResponsePolling]);

  // Callback for when STT returns a final transcript
  const onFinalSTT = useCallback(
    async (text) => {
      // If avatar is speaking, treat as interruption
      if (avatarSpeaking) {
        await handleInterruption();
        // Buffer the current speech segment (backend will accumulate)
        // Do not send to /api/send_text now; backend will handle accumulation
        return;
      }
      try {
        // 1. Send transcript to backend for Gemini response
        const resp = await fetch(`${BACKEND}/api/send_text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, generate_ai: true }),
        });
        const { spoken, buffered } = await resp.json();

        if (buffered) {
          console.log("[HeygenAvatar] Speech buffered while avatar speaking");
          return;
        }

        console.log("[HeygenAvatar] About to speak:", spoken);
        if (!spoken) {
          console.warn("[HeygenAvatar] No spoken text received from backend.");
          return;
        }
        if (!avatarRef.current) {
          console.error("[HeygenAvatar] Avatar instance not ready.");
          return;
        }

        // Notify backend that avatar is starting to speak
        setAvatarSpeaking(true);
        notifyAvatarState(true);

        await avatarRef.current
          .speak({
            text: spoken,
            taskType: taskTypeRef.current || undefined,
          })
          .catch((e) => {
            console.error("[HeygenAvatar] Avatar speak error:", e);
          })
          .finally(() => {
            // Notify backend that avatar finished speaking
            setAvatarSpeaking(false);
            notifyAvatarState(false);
            startAccumulatedResponsePolling();
          });
      } catch (err) {
        setError(err.message);
      }
    },
    [
      avatarSpeaking,
      handleInterruption,
      notifyAvatarState,
      startAccumulatedResponsePolling,
    ]
  );

  // Cleanup interruption timer on unmount
  useEffect(() => {
    return () => {
      if (interruptionTimeoutRef.current) {
        clearTimeout(interruptionTimeoutRef.current);
      }
    };
  }, []);

  // Audio hook
  const audio = useTabAudio(onFinalSTT);

  async function startInterview() {
    try {
      // Dynamically import the ESM-only package on the client
      const mod = await import("@heygen/streaming-avatar");
      const {
        default: StreamingAvatar,
        AvatarQuality,
        StreamingEvents,
        TaskType,
      } = mod;
      taskTypeRef.current = TaskType.REPEAT;

      // fetch short-lived token
      const { data } = await fetch(
        "https://api.heygen.com/v1/streaming.create_token",
        { method: "POST", headers: { "x-api-key": HEYGEN_API_KEY } }
      ).then((r) => r.json());

      // create & start StreamingAvatar
      const avatar = new StreamingAvatar({ token: data.token });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (e) => {
        videoRef.current.srcObject = e.detail;
        videoRef.current.play().catch(() => {});
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        videoRef.current.srcObject = null;
        setRunning(false);
        setAvatarSpeaking(false);
        notifyAvatarState(false);
      });

      await avatar.createStartAvatar({
        avatarName: AVATAR_NAME,
        quality: AvatarQuality.Medium,
        videoElement: videoRef.current,
      });

      // Start audio capture and STT
      await audio.start(WS_URL);
      setRunning(true);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  }

  async function stopInterview() {
    try {
      await avatarRef.current?.stopAvatar();
      audio.stop();
      videoRef.current.srcObject = null;
      setAvatarSpeaking(false);
      notifyAvatarState(false);

      if (accumulatedResponseIntervalRef.current) {
        clearInterval(accumulatedResponseIntervalRef.current);
        accumulatedResponseIntervalRef.current = null;
      }
    } catch (_) {}
    setRunning(false);
  }

  return (
    <main style={{ textAlign: "center", marginTop: "2rem" }}>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        width={1000}
        height={600}
        style={{
          background: "#000",
          display: "block",
          margin: "0 auto",
          borderRadius: "8px",
          boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
        }}
      />
      <div style={{ marginTop: "1rem" }}>
        {avatarSpeaking && (
          <p style={{ color: "orange", fontWeight: "bold" }}>
            Avatar is speaking... (speech will be buffered)
          </p>
        )}
        {!running ? (
          <button onClick={startInterview}>Start interview</button>
        ) : (
          <button onClick={stopInterview}>Stop interview</button>
        )}
      </div>
    </main>
  );
}
