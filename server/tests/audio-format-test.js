/**
 * Simple test script to verify WAV file format processing
 * This simulates the process of concatenating audio chunks with headers
 * Run with: node audio-format-test.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure paths
const tempDir = path.join(__dirname, '..', 'temp');
const testOutputPath = path.join(tempDir, 'test-audio.wav');
const whisperPath = path.join(__dirname, '../whisper.cpp/build/bin/whisper-cli');
const modelPath = path.join(__dirname, '../whisper.cpp/models/ggml-base.en.bin');

// Create a WAV header
function createWavHeader(dataLength) {
    const wavHeader = Buffer.alloc(44);

    // RIFF identifier
    wavHeader.write('RIFF', 0);

    // File length
    wavHeader.writeUInt32LE(36 + dataLength, 4);

    // WAVE identifier
    wavHeader.write('WAVE', 8);

    // Format chunk identifier
    wavHeader.write('fmt ', 12);

    // Format chunk length
    wavHeader.writeUInt32LE(16, 16);

    // Sample format (raw)
    wavHeader.writeUInt16LE(1, 20);

    // Channel count
    wavHeader.writeUInt16LE(1, 22);

    // Sample rate
    wavHeader.writeUInt32LE(16000, 24);

    // Byte rate (sample rate * block align)
    wavHeader.writeUInt32LE(16000 * 2, 28);

    // Block align (channel count * bytes per sample)
    wavHeader.writeUInt16LE(2, 32);

    // Bits per sample
    wavHeader.writeUInt16LE(16, 34);

    // Data chunk identifier
    wavHeader.write('data', 36);

    // Data chunk length
    wavHeader.writeUInt32LE(dataLength, 40);

    return wavHeader;
}

// Create test audio (a simple sine wave)
function createTestAudioData(sampleCount, frequency) {
    const pcmData = Buffer.alloc(sampleCount * 2); // 16-bit = 2 bytes per sample

    for (let i = 0; i < sampleCount; i++) {
        // Generate sine wave
        const sample = Math.sin(2 * Math.PI * frequency * i / 16000);
        // Scale to 16-bit and convert to Int16
        const value = Math.floor(sample * 32767);
        // Write sample to buffer
        pcmData.writeInt16LE(value, i * 2);
    }

    return pcmData;
}

// Test cases
async function runTests() {
    try {
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        console.log('=== Testing Audio Format Processing ===');

        // Test 1: Create a proper WAV file with single header
        console.log('\nTest 1: Creating proper WAV file with single header');
        const audioDuration = 3; // seconds
        const sampleCount = 16000 * audioDuration;
        const audioData = createTestAudioData(sampleCount, 440); // 440Hz = A4 note

        // Create complete WAV file with header
        const fileStream = fs.createWriteStream(testOutputPath);
        fileStream.write(createWavHeader(audioData.length));
        fileStream.write(audioData);
        fileStream.end();

        console.log(`Created test file: ${testOutputPath}`);
        console.log(`Duration: ${audioDuration} seconds`);
        console.log(`Sample rate: 16kHz, mono, 16-bit`);

        // Test 2: Simulate header-only-once approach
        console.log('\nTest 2: Testing header-only-once approach');
        const testOutputPath2 = path.join(tempDir, 'test-audio-chunks.wav');
        const fileStream2 = fs.createWriteStream(testOutputPath2);

        // Create multiple chunks (simulate websocket streaming)
        const chunkSize = 16000; // 1 second of audio at 16kHz
        const chunkCount = 3;

        // Write initial header with estimated size for all chunks
        const totalDataSize = chunkSize * 2 * chunkCount; // 2 bytes per sample, 3 chunks
        fileStream2.write(createWavHeader(totalDataSize));

        // Write chunks
        for (let i = 0; i < chunkCount; i++) {
            console.log(`Writing chunk ${i + 1}`);
            const chunkData = createTestAudioData(chunkSize, 440 + (i * 110)); // Vary frequency
            fileStream2.write(chunkData);
        }

        fileStream2.end();
        console.log(`Created chunked test file: ${testOutputPath2}`);

        // Test with Whisper
        console.log('\nProcessing test files with Whisper...');

        const processWithWhisper = (filePath) => {
            return new Promise((resolve, reject) => {
                console.log(`Processing ${path.basename(filePath)}`);

                const args = [
                    '--model', modelPath,
                    '--language', 'en',
                    '--output-txt',
                    '--no-timestamps',
                    '--beam-size', '5',
                    '--best-of', '5',
                    '--no-speech-thold', '0.3',
                    filePath
                ];

                const whisperProcess = spawn(whisperPath, args);
                let stdout = '';
                let stderr = '';

                whisperProcess.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                whisperProcess.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                whisperProcess.on('close', (code) => {
                    if (code !== 0) {
                        console.error(`Whisper failed with code ${code}: ${stderr}`);
                        reject(new Error(`Whisper failed with code ${code}: ${stderr}`));
                        return;
                    }

                    // Read the output text file
                    const txtPath = `${filePath}.txt`;
                    try {
                        const transcript = fs.readFileSync(txtPath, 'utf8').trim();
                        console.log(`Transcript for ${path.basename(filePath)}: "${transcript}"`);

                        // Clean up
                        fs.unlinkSync(txtPath);

                        resolve(transcript);
                    } catch (err) {
                        reject(err);
                    }
                });

                whisperProcess.on('error', (error) => {
                    reject(error);
                });
            });
        };

        // Process both test files
        await processWithWhisper(testOutputPath);
        await processWithWhisper(testOutputPath2);

        console.log('\n=== Tests completed ===');
    } catch (error) {
        console.error('Test error:', error);
    }
}

runTests(); 