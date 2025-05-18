import React, { useState, useRef } from 'react';
import { FaMicrophone, FaStop } from 'react-icons/fa';

interface SpeechInputProps {
  sessionId: string;
  onTranscript: (text: string) => void;
}

const SpeechInput: React.FC<SpeechInputProps> = ({ sessionId, onTranscript }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isRecordingRef = useRef(false);
  const headerSentRef = useRef(false); // Track if we've sent the WAV header

  const cleanupAudio = () => {
    console.log('Cleaning up audio resources');
    
    // Stop processor
    if (processorRef.current && sourceRef.current) {
      try {
        sourceRef.current.disconnect();
        processorRef.current.disconnect();
      } catch (e) {
        console.error('Error disconnecting audio nodes:', e);
      }
    }
    
    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        console.error('Error closing audio context:', e);
      }
      audioContextRef.current = null;
    }
    
    // Reset refs
    processorRef.current = null;
    sourceRef.current = null;
    isRecordingRef.current = false;
    headerSentRef.current = false; // Reset header sent flag
  };

  const startRecording = async () => {
    if (isRecording || isConnecting) return;
    
    setIsConnecting(true);
    console.log('Starting recording process');

    try {
      // 1. Establish WebSocket connection
      const socket = new WebSocket('ws://localhost:3000');
      wsRef.current = socket;
      
      socket.onopen = () => {
        console.log('WebSocket connected - sending start message');
        
        // 2. Send start message with session ID
        socket.send(JSON.stringify({
          type: 'start',
          session_id: sessionId
        }));
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received message:', data);
          
          if (data.transcript) {
            onTranscript(data.transcript);
          } else if (data.type === 'start_ack') {
            console.log('Received start acknowledgment, beginning audio capture');
            startAudioCapture(socket);
          } else if (data.error) {
            console.error('Server error:', data.error);
            stopRecording();
          }
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        stopRecording();
      };
      
      socket.onclose = () => {
        console.log('WebSocket closed');
        stopRecording();
      };
    } catch (error) {
      console.error('Error setting up connection:', error);
      setIsConnecting(false);
    }
  };

  const startAudioCapture = async (socket: WebSocket) => {
    try {
      // 1. Get audio stream with higher quality settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Turn off echo cancellation for clearer speech
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      streamRef.current = stream;
      console.log('Got audio stream:', stream.getAudioTracks()[0].label);
      
      // Add volume meter for debugging
      const audioTrack = stream.getAudioTracks()[0];
      console.log('Audio track settings:', audioTrack.getSettings());
      console.log('Audio track constraints:', audioTrack.getConstraints());
      
      // 2. Create audio context
      const context = new AudioContext({
        sampleRate: 16000,
        latencyHint: 'interactive'
      });
      audioContextRef.current = context;
      console.log('Created audio context:', context.sampleRate);
      
      // 3. Create source node
      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      // Create analyzer node for monitoring volume
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 2048;
      source.connect(analyzer);
      
      // Set up volume monitoring
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const checkVolume = () => {
        if (isRecordingRef.current) {
          analyzer.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
          console.log('Audio volume level:', average.toFixed(2));
          setTimeout(checkVolume, 500);
        }
      };
      checkVolume();
      
      // 4. Create processor node
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      // Set recording state BEFORE connecting nodes
      isRecordingRef.current = true;
      headerSentRef.current = false; // Reset header sent flag
      setIsRecording(true);
      setIsConnecting(false);
      
      // 5. Handle audio processing
      processor.onaudioprocess = (e) => {
        if (socket.readyState === WebSocket.OPEN && isRecordingRef.current) {
          const audioData = e.inputBuffer.getChannelData(0);
          const dataLength = audioData.length;
          const pcmData = new Int16Array(dataLength);
          
          // Convert to PCM with proper scaling
          let maxSample = 0;
          for (let i = 0; i < dataLength; i++) {
            // Normalize and scale
            const s = Math.max(-1, Math.min(1, audioData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            maxSample = Math.max(maxSample, Math.abs(pcmData[i]));
          }
          
          // Log if audio is too quiet
          if (maxSample < 1000) { // Very low volume threshold
            console.warn('Audio level is very low:', maxSample);
          }
          
          // Send audio data
          try {
            // For the first chunk, send a complete WAV file with header
            if (!headerSentRef.current) {
              // Create WAV header
              const wavHeader = new ArrayBuffer(44);
              const view = new DataView(wavHeader);
              
              // RIFF identifier
              view.setUint8(0, 'R'.charCodeAt(0));
              view.setUint8(1, 'I'.charCodeAt(0));
              view.setUint8(2, 'F'.charCodeAt(0));
              view.setUint8(3, 'F'.charCodeAt(0));
              
              // Use a larger file size estimation since we'll be appending data
              const totalSize = 36 + 1000000; // Large enough for ~15 seconds at 16kHz mono
              view.setUint32(4, totalSize, true);
              
              // WAVE identifier
              view.setUint8(8, 'W'.charCodeAt(0));
              view.setUint8(9, 'A'.charCodeAt(0));
              view.setUint8(10, 'V'.charCodeAt(0));
              view.setUint8(11, 'E'.charCodeAt(0));
              
              // Format chunk identifier
              view.setUint8(12, 'f'.charCodeAt(0));
              view.setUint8(13, 'm'.charCodeAt(0));
              view.setUint8(14, 't'.charCodeAt(0));
              view.setUint8(15, ' '.charCodeAt(0));
              
              // Format chunk length
              view.setUint32(16, 16, true);
              
              // Sample format (raw)
              view.setUint16(20, 1, true);
              
              // Channel count
              view.setUint16(22, 1, true);
              
              // Sample rate
              view.setUint32(24, 16000, true);
              
              // Byte rate (sample rate * block align)
              view.setUint32(28, 16000 * 2, true);
              
              // Block align (channel count * bytes per sample)
              view.setUint16(32, 2, true);
              
              // Bits per sample
              view.setUint16(34, 16, true);
              
              // Data chunk identifier
              view.setUint8(36, 'd'.charCodeAt(0));
              view.setUint8(37, 'a'.charCodeAt(0));
              view.setUint8(38, 't'.charCodeAt(0));
              view.setUint8(39, 'a'.charCodeAt(0));
              
              // Data chunk length - use a large size for the data chunk
              view.setUint32(40, 1000000, true);
              
              // Combine header and PCM data
              const wavData = new Uint8Array(wavHeader.byteLength + pcmData.byteLength);
              wavData.set(new Uint8Array(wavHeader), 0);
              wavData.set(new Uint8Array(pcmData.buffer), wavHeader.byteLength);
              
              socket.send(wavData.buffer);
              headerSentRef.current = true;
              
              console.log('Sent initial audio chunk with WAV header:', {
                size: wavData.byteLength,
                maxLevel: maxSample,
                timestamp: new Date().toISOString()
              });
            } else {
              // For subsequent chunks, just send the PCM data without header
              socket.send(pcmData.buffer);
              
              console.log('Sent audio PCM data:', {
                size: pcmData.byteLength,
                maxLevel: maxSample,
                timestamp: new Date().toISOString()
              });
            }
          } catch (error) {
            console.error('Error sending audio data:', error);
          }
        }
      };
      
      // 6. Connect nodes
      source.connect(processor);
      processor.connect(context.destination);
      
      console.log('Recording started successfully');
    } catch (error) {
      console.error('Error starting audio capture:', error);
      stopRecording();
    }
  };

  const stopRecording = () => {
    console.log('Stopping recording');
    
    // Send stop message if connection is open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
      wsRef.current.close();
    }
    
    // Reset WebSocket
    wsRef.current = null;
    
    // Clean up audio resources
    cleanupAudio();
    
    // Update state
    setIsRecording(false);
    setIsConnecting(false);
  };

  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      className={`speech-button ${isRecording ? 'recording' : ''}`}
      title={isRecording ? 'Stop Recording' : 'Start Recording'}
      disabled={isConnecting}
    >
      {isConnecting ? '...' : isRecording ? <FaStop /> : <FaMicrophone />}
    </button>
  );
};

export default SpeechInput; 