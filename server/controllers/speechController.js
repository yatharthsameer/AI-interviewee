import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger.js';
import { transcribeAudio, handleSpokenInput } from '../services/speechService.js';
import { writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let wss;
const sessions = new Map();

export const initializeSpeechServer = (server) => {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        logger.info('SpeechServer', 'New WebSocket connection established');
        let sessionId = null;

        // Handle incoming messages
        ws.on('message', async (message) => {
            try {
                // Handle JSON control messages (start/stop)
                if (typeof message === 'string' || message instanceof Buffer && message.length < 200) {
                    try {
                        const msgStr = message.toString();
                        if (msgStr.startsWith('{') && msgStr.endsWith('}')) {
                            const data = JSON.parse(msgStr);

                            logger.info('SpeechServer', 'Received control message', {
                                type: data.type,
                                sessionId: data.session_id
                            });

                            if (data.type === 'start' && data.session_id) {
                                // Start speech recognition session
                                sessionId = data.session_id;
                                ws.sessionId = sessionId;

                                // Create file stream for audio data
                                const tempFilePath = path.join(__dirname, '..', 'temp', `audio-${sessionId}.wav`);
                                const writeStream = createWriteStream(tempFilePath);

                                // Initialize session with write stream
                                sessions.set(sessionId, {
                                    ws,
                                    writeStream,
                                    tempFilePath,
                                    hasReceivedAudio: false,
                                    headerWritten: false // Track if we've written the header
                                });

                                // Send acknowledgment to client
                                logger.info('SpeechServer', 'Speech session started, sending ack', {
                                    sessionId,
                                    filePath: tempFilePath
                                });

                                ws.send(JSON.stringify({
                                    type: 'start_ack',
                                    session_id: sessionId
                                }));
                            } else if (data.type === 'stop') {
                                // Stop recording and process the audio
                                if (!sessionId) {
                                    logger.warn('SpeechServer', 'Received stop without session ID');
                                    return;
                                }

                                const session = sessions.get(sessionId);
                                if (!session) {
                                    logger.warn('SpeechServer', 'No active session found', { sessionId });
                                    return;
                                }

                                logger.info('SpeechServer', 'Processing recorded audio', {
                                    sessionId,
                                    filePath: session.tempFilePath
                                });

                                try {
                                    // Close write stream if it's still open
                                    if (session.writeStream && !session.writeStream.writableEnded) {
                                        await new Promise((resolve) => session.writeStream.end(resolve));
                                        logger.info('SpeechServer', 'Audio file stream closed', {
                                            filePath: session.tempFilePath
                                        });
                                    }

                                    if (!session.hasReceivedAudio) {
                                        logger.warn('SpeechServer', 'No audio data received', { sessionId });
                                        ws.send(JSON.stringify({
                                            error: 'No audio data recorded. Please try again.'
                                        }));
                                        return;
                                    }

                                    try {
                                        // Process with whisper
                                        const transcript = await transcribeAudio(session.tempFilePath);

                                        if (transcript && transcript !== '[BLANK_AUDIO]') {
                                            logger.info('SpeechServer', 'Received transcript', {
                                                transcript,
                                                sessionId
                                            });

                                            // Send transcript to client
                                            ws.send(JSON.stringify({ transcript }));

                                            // Process with AI
                                            await handleSpokenInput(sessionId, transcript);
                                        } else {
                                            logger.warn('SpeechServer', 'No speech detected in audio', { sessionId });
                                            ws.send(JSON.stringify({
                                                error: 'No speech detected. Please check your microphone and try speaking louder.'
                                            }));
                                        }
                                    } catch (whisperError) {
                                        logger.error('SpeechServer', 'Whisper processing error', {
                                            error: whisperError.message,
                                            sessionId
                                        });

                                        ws.send(JSON.stringify({
                                            error: `Speech processing error: ${whisperError.message}`
                                        }));
                                    }
                                } catch (error) {
                                    logger.error('SpeechServer', 'Error processing audio', {
                                        error: error.message,
                                        sessionId
                                    });

                                    ws.send(JSON.stringify({
                                        error: `Failed to process audio: ${error.message}`
                                    }));
                                } finally {
                                    // Clean up files
                                    try {
                                        const txtPath = `${session.tempFilePath}.txt`;
                                        // Clean up temp files
                                        try {
                                            await writeFile('/dev/null', ''); // Ensure fs/promises is loaded
                                            const fs = await import('fs/promises');
                                            await fs.unlink(session.tempFilePath);
                                            await fs.unlink(txtPath);
                                        } catch (e) {
                                            logger.warn('SpeechServer', 'Failed to clean up temp files', { error: e.message });
                                        }
                                    } catch (e) {
                                        // Ignore cleanup errors
                                    }

                                    // Clean up session
                                    sessions.delete(sessionId);
                                }
                            }
                            return;
                        }
                    } catch (e) {
                        // Not a valid JSON message, will treat as binary data
                        logger.warn('SpeechServer', 'Failed to parse message as JSON', { error: e.message });
                    }
                }

                // Handle binary audio data
                if (typeof message === 'object' && message instanceof Buffer) {
                    const currentSessionId = ws.sessionId;
                    logger.info('SpeechServer', 'Processing binary data', {
                        messageSize: message.length,
                        sessionIdExists: !!currentSessionId
                    });

                    if (!currentSessionId) {
                        logger.warn('SpeechServer', 'Received audio data without session ID');
                        return;
                    }

                    const session = sessions.get(currentSessionId);
                    if (!session) {
                        logger.warn('SpeechServer', 'Received audio data without active session', {
                            sessionId: currentSessionId,
                            sessionsCount: sessions.size,
                            availableSessions: Array.from(sessions.keys())
                        });
                        return;
                    }

                    // Check if session was already stopped
                    if (!session.writeStream || session.writeStream.writableEnded) {
                        logger.warn('SpeechServer', 'Received audio after stop', {
                            sessionId: currentSessionId
                        });
                        return;
                    }

                    try {
                        // Convert ArrayBuffer to Buffer if needed
                        const audioBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message);

                        // Log audio data stats
                        logger.info('SpeechServer', 'Received audio data', {
                            totalSize: audioBuffer.length,
                            sessionId: currentSessionId
                        });

                        // Check if this chunk contains a WAV header (starts with "RIFF")
                        if (audioBuffer.length >= 44 &&
                            audioBuffer[0] === 'R'.charCodeAt(0) &&
                            audioBuffer[1] === 'I'.charCodeAt(0) &&
                            audioBuffer[2] === 'F'.charCodeAt(0) &&
                            audioBuffer[3] === 'F'.charCodeAt(0)) {

                            // If this is the first chunk, write the complete WAV header
                            if (!session.headerWritten) {
                                // Write header (first 44 bytes)
                                session.writeStream.write(audioBuffer.slice(0, 44));
                                session.headerWritten = true;
                                logger.info('SpeechServer', 'WAV header written', { sessionId: currentSessionId });

                                // Write the audio data that follows the header
                                session.writeStream.write(audioBuffer.slice(44));
                            } else {
                                // For subsequent chunks, skip the WAV header
                                session.writeStream.write(audioBuffer.slice(44));
                                logger.info('SpeechServer', 'Skipped duplicate WAV header', { sessionId: currentSessionId });
                            }
                        } else {
                            // This chunk doesn't have a header, write as is
                            session.writeStream.write(audioBuffer);
                        }

                        session.hasReceivedAudio = true;

                    } catch (error) {
                        logger.error('SpeechServer', 'Error processing audio data', { error: error.message });
                    }
                    return;
                }
            } catch (error) {
                logger.error('SpeechServer', 'Error processing message', {
                    error: error.message
                });

                ws.send(JSON.stringify({
                    error: `Error processing message: ${error.message}`
                }));
            }
        });

        // Handle connection close
        ws.on('close', () => {
            logger.info('SpeechServer', 'WebSocket connection closed');

            const currentSessionId = ws.sessionId;
            if (currentSessionId) {
                const session = sessions.get(currentSessionId);
                if (session && session.writeStream) {
                    // Close write stream if still open
                    if (!session.writeStream.writableEnded) {
                        session.writeStream.end();
                    }
                }

                // Clean up session
                sessions.delete(currentSessionId);
            }
        });
    });
}; 