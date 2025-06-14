// pages/app.jsx
import { useEffect, useRef, useState } from "react";
import { useTabAudio } from "../src/hooks/useTabAudio";

const BACKEND = "http://localhost:5001";

export default function Interview() {
  /* —— UI & session state —— */
  const [hasMounted, setHasMounted] = useState(false);
  const [sid, setSid] = useState(null);
  const [error, setError] = useState(null);

  /* —— refs —— */
  const videoRef = useRef(null);
  const pcRef = useRef(null);

  /* —— audio hook —— */
  const { start: startAudio, stop: stopAudio } = useTabAudio(
    "ws://localhost:8765"
  );

  /* gate SSR hydration mismatch */
  useEffect(() => setHasMounted(true), []);

  /* —— start interview —— */
  const handleStart = async () => {
    try {
      /* 1) create session */
      const { session_id, sdpOffer, iceServers } = await fetch(
        `${BACKEND}/api/session`,
        { method: "POST" }
      ).then((r) => r.json());
      setSid(session_id);

      /* 2) WebRTC */
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      pc.onicecandidate = ({ candidate }) =>
        candidate &&
        fetch(`${BACKEND}/api/ice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id, candidate }),
        });

      pc.ontrack = ({ streams }) => {
        if (videoRef.current) videoRef.current.srcObject = streams[0];
      };

      await pc.setRemoteDescription(sdpOffer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`${BACKEND}/api/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id, sdp: answer.sdp }),
      });

      /* 3) start audio capture + ASR */
      await startAudio();
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
  };

  /* —— stop interview —— */
  const handleStop = async () => {
    try {
      stopAudio();
      pcRef.current?.close();
      await fetch(`${BACKEND}/api/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      setSid(null);
    } catch (e) {
      setError(e.message);
    }
  };

  /* —— render —— */
  return (
    <main style={{ textAlign: "center", marginTop: "2rem" }}>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {hasMounted && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          width={640}
          height={480}
          style={{ background: "#000" }}
        />
      )}

      {!sid ? (
        <button onClick={handleStart}>Start interview</button>
      ) : (
        <button onClick={handleStop}>Stop interview</button>
      )}
    </main>
  );
}
