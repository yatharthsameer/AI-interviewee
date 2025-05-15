import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

async function listAndCloseSessions() {
  const apiKey = process.env.HEYGEN_APIKEY;
  const serverUrl = process.env.HEYGEN_SERVER_URL || 'https://api.heygen.com';

  if (!apiKey) {
    logger.error('Script', 'API key is missing');
    process.exit(1);
  }

  try {
    // List active sessions
    const response = await fetch(`${serverUrl}/v1/streaming.list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
    });

    const data = await response.json();
    logger.info('Script', 'Active sessions:', { 
      count: data.data?.length || 0,
      sessions: data.data
    });

    // Close all active sessions
    if (data.data && data.data.length > 0) {
      for (const session of data.data) {
        logger.info('Script', 'Closing session:', { sessionId: session.session_id });
        
        const closeResponse = await fetch(`${serverUrl}/v1/streaming.stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey,
          },
          body: JSON.stringify({ session_id: session.session_id }),
        });

        const closeData = await closeResponse.json();
        logger.info('Script', 'Close session response:', { 
          sessionId: session.session_id,
          status: closeResponse.status,
          data: closeData
        });
      }
    }

    logger.info('Script', 'All sessions closed');
  } catch (error) {
    logger.error('Script', 'Error:', { 
      error: error.message,
      stack: error.stack
    });
  }
}

// Run the script
listAndCloseSessions(); 