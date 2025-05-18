import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateResponse } from './geminiService.js';
import { heygenService } from './heygenService.js';
import { logger } from '../utils/logger.js';
import { promises as fs } from 'fs';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
const whisperPath = path.join(__dirname, '../whisper.cpp/build/bin/whisper-cli');
const modelPath = path.join(__dirname, '../whisper.cpp/models/ggml-base.en.bin');
const tempDir = path.join(__dirname, '../temp');

// Verify files exist and create temp directory
async function initialize() {
    try {
        await fs.access(whisperPath);
        await fs.access(modelPath);
        logger.info('SpeechService', 'Whisper binary and model files verified');

        // Ensure temp directory exists
        try {
            await fs.mkdir(tempDir, { recursive: true });
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }

    } catch (error) {
        logger.error('SpeechService', 'Error verifying whisper files', { error: error.message });
        throw new Error(`Whisper files not found: ${error.message}`);
    }
}

// Initialize right away
initialize().catch(err => {
    logger.error('SpeechService', 'Initialization failed', { error: err.message });
});

/**
 * Transcribe an audio file using whisper
 * @param {string} audioFilePath - Path to the WAV file
 * @returns {Promise<string>} - The transcribed text
 */
export const transcribeAudio = async (audioFilePath) => {
    return new Promise((resolve, reject) => {
        try {
            logger.info('SpeechService', 'Transcribing audio file', { audioFilePath });

            // Define whisper arguments
            const args = [
                '--model', modelPath,
                '--language', 'en',
                '--output-txt',
                '--no-timestamps',
                '--beam-size', '5',
                '--best-of', '5',
                '--no-speech-thold', '0.3',
                '--threads', '4',
                audioFilePath
            ];

            logger.info('SpeechService', 'Running whisper command', {
                command: whisperPath,
                args: args.join(' ')
            });

            // Spawn whisper process
            const whisperProcess = spawn(whisperPath, args);

            let stdout = '';
            let stderr = '';

            // Collect stdout data
            whisperProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            // Collect stderr data
            whisperProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            // Handle process completion
            whisperProcess.on('close', async (code) => {
                if (code !== 0) {
                    logger.error('SpeechService', 'Whisper process failed', {
                        code,
                        stderr
                    });
                    return reject(new Error(`Whisper failed with code ${code}: ${stderr}`));
                }

                // Log whisper output for debugging
                if (stderr) {
                    logger.info('SpeechService', 'Whisper stderr output', { stderr });
                }

                if (stdout) {
                    logger.info('SpeechService', 'Whisper stdout output', { stdout });
                }

                try {
                    // Read the output text file - whisper adds .txt to the full file name
                    const txtPath = `${audioFilePath}.txt`;
                    const transcript = await fs.readFile(txtPath, 'utf8');

                    // If transcript is just [BLANK_AUDIO], log warning
                    if (transcript.trim() === '[BLANK_AUDIO]') {
                        logger.warn('SpeechService', 'Blank audio detected, consider:');
                        logger.warn('SpeechService', '1. Checking microphone permissions');
                        logger.warn('SpeechService', '2. Speaking louder');
                        logger.warn('SpeechService', '3. Reducing background noise');
                    }

                    resolve(transcript.trim());
                } catch (error) {
                    logger.error('SpeechService', 'Error reading transcript file', {
                        error: error.message,
                        txtPath: `${audioFilePath}.txt`
                    });
                    reject(error);
                }
            });

            // Handle process error
            whisperProcess.on('error', (error) => {
                logger.error('SpeechService', 'Whisper process error', { error: error.message });
                reject(error);
            });

        } catch (error) {
            logger.error('SpeechService', 'Error transcribing audio', { error: error.message, stack: error.stack });
            reject(error);
        }
    });
};

export const handleSpokenInput = async (sessionId, text) => {
    try {
        logger.info('SpeechService', 'Processing spoken input', { text, sessionId });

        // Generate AI response
        const response = await generateResponse(text);

        // Send response to avatar
        await heygenService.sendText(sessionId, response);

        return response;
    } catch (error) {
        logger.error('SpeechService', 'Error handling spoken input', {
            error: error.message,
            sessionId
        });
        throw error;
    }
}; 