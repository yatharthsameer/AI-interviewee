// pages/index.js
import { useEffect, useRef, useState } from "react";
import { useTabAudio } from "../src/hooks/useTabAudio";

const BACKEND = "http://localhost:5001";
const WS_URL = "ws://localhost:8765";

export default function InterviewPage() {
  const [hasMounted, setHasMounted] = useState(false);   // ← gate
  const [sid, setSid] = useState(null);
  const [error, setErr] = useState(null);

  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const audio = useTabAudio(WS_URL);

  useEffect(() => setHasMounted(true), []);              // runs only client-side

  const startInterview = async () => {
    try {
      /* 1) create session */
      const { session_id, sdpOffer, iceServers } = await fetch(
        `${BACKEND}/api/session`,
        { method: "POST" }
      ).then((r) => r.json());
      setSid(session_id);
      window.__HEYGEN_SID = session_id;   // expose for the hook

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

      /* 3) start audio stream */
      await audio.start();
    } catch (e) {
      setErr(e.message);
      console.error(e);
    }
  };

  const stopInterview = async () => {
    try {
      audio.stop();
      pcRef.current?.close();
      await fetch(`${BACKEND}/api/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      setSid(null);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <main style={{ textAlign: "center", marginTop: "2rem" }}>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* render video only after mount ⇒ no hydration mismatch */}
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
        <button onClick={startInterview}>Start interview</button>
      ) : (
        <button onClick={stopInterview}>Stop interview</button>
      )}
    </main>
  );
}
