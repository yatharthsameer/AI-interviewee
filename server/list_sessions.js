import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.HEYGEN_APIKEY;
const SERVER_URL = process.env.HEYGEN_SERVER_URL || 'https://api.heygen.com';

async function listSessions() {
  try {
    const response = await fetch(`${SERVER_URL}/v1/streaming.list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
      },
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

listSessions(); 