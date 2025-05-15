import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.HEYGEN_APIKEY;
const SERVER_URL = process.env.HEYGEN_SERVER_URL || 'https://api.heygen.com';

async function testSession(avatar_name, voice_id) {
  console.log('Testing session creation with:');
  console.log('Avatar:', avatar_name);
  console.log('Voice ID:', voice_id);
  console.log('API Key:', API_KEY);
  console.log('Server URL:', SERVER_URL);

  try {
    const response = await fetch(`${SERVER_URL}/v1/streaming.new`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
      },
      body: JSON.stringify({
        quality: 'low',
        avatar_name,
        voice: { voice_id },
      }),
    });

    const text = await response.text();
    console.log('\nResponse Status:', response.status);
    console.log('Response Headers:', response.headers);
    console.log('Response Body:', text);

    try {
      const data = JSON.parse(text);
      console.log('\nParsed Response:', JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('\nCould not parse response as JSON');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Test with Pedro avatar and the provided voice ID
testSession('Pedro_CasualLook_public', 'c8e176c17f814004885fd590e03ff99f'); 