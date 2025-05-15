import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.HEYGEN_APIKEY;
const SERVER_URL = process.env.HEYGEN_SERVER_URL || 'https://api.heygen.com';

async function getAvatars() {
  const res = await fetch(`${SERVER_URL}/v1/streaming.avatar_list`, {
    headers: { 'X-Api-Key': API_KEY }
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return data.data || [];
  } catch (e) {
    console.error('Error parsing avatar list response:', text);
    throw e;
  }
}

async function getVoices() {
  const res = await fetch(`${SERVER_URL}/v1/streaming.voice_list`, {
    headers: { 'X-Api-Key': API_KEY }
  });
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return data.data || [];
  } catch (e) {
    console.error('Error parsing voice list response:', text);
    throw e;
  }
}

(async () => {
  const avatars = await getAvatars();
  const voices = await getVoices();

  console.log('--- Streaming Avatars ---');
  avatars.forEach(a => {
    console.log(`Avatar: ${a.avatar_name} (ID: ${a.avatar_id})`);
    if (a.voice_ids && a.voice_ids.length > 0) {
      console.log('  Supported Voice IDs:', a.voice_ids.join(', '));
    }
  });

  console.log('\n--- Streaming Voices ---');
  voices.forEach(v => {
    console.log(`Voice: ${v.voice_name} (ID: ${v.voice_id})`);
  });

  // Example: Print a working pair
  const workingAvatar = avatars.find(a => a.voice_ids && a.voice_ids.length > 0);
  if (workingAvatar) {
    const workingVoiceId = workingAvatar.voice_ids[0];
    const workingVoice = voices.find(v => v.voice_id === workingVoiceId);
    console.log('\n--- Example Working Pair ---');
    console.log(`Avatar: ${workingAvatar.avatar_name} (ID: ${workingAvatar.avatar_id})`);
    if (workingVoice) {
      console.log(`Voice: ${workingVoice.voice_name} (ID: ${workingVoice.voice_id})`);
    } else {
      console.log(`Voice ID: ${workingVoiceId}`);
    }
  }
})(); 