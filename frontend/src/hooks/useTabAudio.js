// src/hooks/useTabAudio.js
import { useEffect, useRef } from "react";

/**
 *   const audio = useTabAudio("ws://localhost:8765");
 *   await audio.start();
 *   ...
 *   audio.stop();
 */
export function useTabAudio(wsUrl) {
    const wsRef = useRef(null);
    const ctxRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const BACKEND = "http://localhost:5001";

    const cleanup = () => {
        clearInterval(timerRef.current);
        wsRef.current?.close(1000, "stopped");
        ctxRef.current?.close();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        wsRef.current = ctxRef.current = streamRef.current = null;
    };

    /* unmount cleanup */
    useEffect(() => cleanup, []);

    const start = async () => {
        if (wsRef.current) return; // already running

        /* 1. capture (tab audio preferred) */
        let stream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: { echoCancellation: false },
            });
        } catch {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        stream.getVideoTracks().forEach((t) => t.stop());
        streamRef.current = stream;

        /* 2. audio graph */
        const ctx = new AudioContext({ sampleRate: 48_000 });
        ctxRef.current = ctx;
        await ctx.audioWorklet.addModule("/pcm-downsampler.js");

        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        src.connect(gain).connect(analyser);

        timerRef.current = setInterval(() => {
            const buf = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(buf);
            const rms =
                Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length) + 1e-6;
            gain.gain.setTargetAtTime(
                Math.min(5, Math.max(1, 0.2 / rms)),
                ctx.currentTime,
                0.01
            );
        }, 200);

        const worklet = new AudioWorkletNode(ctx, "downsampler");
        gain.connect(worklet);

        /* 3. WebSocket */
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        let lastSentAt = 0;

        worklet.port.onmessage = ({ data }) => {
            ws.readyState === 1 && ws.send(data);
        };

        // Send transcripts to backend for AI response generation
        ws.onmessage = async (e) => {
            const { text, final } = JSON.parse(e.data);
            if (!final || !text) return;

            try {
                await fetch(`${BACKEND}/api/send_text`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        session_id: window.__HEYGEN_SID,
                        text,
                        generate_ai: true,
                    }),
                });
            } catch (err) {
                console.error("send_text error", err);
            }
        };
    };

    const stop = () => cleanup();

    return { start, stop, connected: () => !!wsRef.current };
}
