import { useEffect, useRef } from "react";

/**
 *   const audio = useTabAudio(onFinal, onVoiceActivity);
 *   await audio.start();
 *   ...
 *   audio.stop();
 */
export function useTabAudio(onFinal, onVoiceActivity) {
    const wsRef = useRef(null);
    const ctxRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);

    const cleanup = () => {
        clearInterval(timerRef.current);
        wsRef.current?.close(1000, "stopped");
        ctxRef.current?.close();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        wsRef.current = ctxRef.current = streamRef.current = null;
    };

    /* unmount cleanup */
    useEffect(() => cleanup, []);

    const start = async (wsUrl) => {
        if (wsRef.current) return; // already running

        /* 1. capture (tab audio preferred) */
        let stream;
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: { echoCancellation: false },
            });
            console.log("[useTabAudio] Got tab audio stream");
        } catch {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("[useTabAudio] Got mic audio stream");
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

        ws.onopen = () => {
            console.log(`[useTabAudio] WebSocket connected to ${wsUrl}`);
        };
        ws.onerror = (e) => {
            console.error("[useTabAudio] WebSocket error", e);
        };
        ws.onclose = (e) => {
            console.log("[useTabAudio] WebSocket closed", e);
        };

        worklet.port.onmessage = ({ data }) => {
            if (ws.readyState === 1) {
                ws.send(data);
                // Log every 20th chunk to avoid spam
                if (!worklet._sendCount) worklet._sendCount = 0;
                worklet._sendCount++;
                if (worklet._sendCount % 20 === 0) {
                    console.log("[useTabAudio] Sent audio chunk to backend");
                }
            }
        };

        // Handle both voice activity and transcript messages
        ws.onmessage = (e) => {
            const data = JSON.parse(e.data || "{}");

            if (data.type === "voice_activity") {
                // Real-time voice activity update
                console.log("[useTabAudio] Voice activity:", data.speaking ? "STARTED" : "STOPPED");
                if (onVoiceActivity) {
                    onVoiceActivity(data.speaking);
                }
            } else if (data.type === "transcript" && data.final && data.text) {
                // Final transcript
                console.log("[useTabAudio] Received transcript from backend:", data.text);
                onFinal(data.text);
            } else if (data.final && data.text) {
                // Backward compatibility for old format
                console.log("[useTabAudio] Received transcript from backend:", data.text);
                onFinal(data.text);
            }
        };
    };

    const stop = () => cleanup();

    return { start, stop, connected: () => !!wsRef.current };
} 