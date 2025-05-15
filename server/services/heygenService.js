import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

class HeygenService {
  constructor() {
    this.apiKey = process.env.HEYGEN_APIKEY;
    this.serverUrl = process.env.HEYGEN_SERVER_URL || 'https://api.heygen.com';
    this.activeSessions = new Map(); // Track active sessions
    this.heartbeatInterval = null;
    this.connectionCheckInterval = null;
    this.reconnectAttempts = new Map(); // Track reconnect attempts per session
    this.maxReconnectAttempts = 3;
    logger.info('HeygenService', 'Initialized with server URL:', { serverUrl: this.serverUrl });
  }

  async attemptReconnect(session_id) {
    const attempts = this.reconnectAttempts.get(session_id) || 0;
    if (attempts >= this.maxReconnectAttempts) {
      logger.error('HeygenService', 'Max reconnect attempts reached:', { session_id });
      return false;
    }

    logger.info('HeygenService', 'Attempting to reconnect:', { 
      session_id,
      attempt: attempts + 1,
      maxAttempts: this.maxReconnectAttempts
    });

    try {
      // Get the current session
      const session = this.activeSessions.get(session_id);
      if (!session) {
        logger.error('HeygenService', 'Session not found for reconnect:', { session_id });
        return false;
      }

      // Stop the current session
      await this.stopSession(session_id);

      // Create a new session with the same parameters
      const newSession = await this.createSession(
        session.avatar_name,
        session.voice_id,
        true // disable_idle_timeout
      );

      // Update reconnect attempts
      this.reconnectAttempts.set(session_id, attempts + 1);

      logger.info('HeygenService', 'Reconnect successful:', {
        session_id,
        newSessionId: newSession.session_id
      });

      return true;
    } catch (error) {
      logger.error('HeygenService', 'Reconnect failed:', {
        session_id,
        error: error.message,
        attempt: attempts + 1
      });
      return false;
    }
  }

  startHeartbeat(session_id) {
    // Clear any existing heartbeat for this session
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Start new heartbeat
    this.heartbeatInterval = setInterval(async () => {
      try {
        const isHealthy = await this.checkSessionHealth(session_id);
        if (!isHealthy) {
          logger.error('HeygenService', 'Session health check failed:', { session_id });
          await this.stopSession(session_id);
          clearInterval(this.heartbeatInterval);
        }
      } catch (error) {
        logger.error('HeygenService', 'Heartbeat check failed:', { 
          session_id,
          error: error.message
        });
      }
    }, 5000); // Check every 5 seconds
  }

  startConnectionMonitoring(session_id) {
    // Clear any existing intervals
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    // Start connection monitoring
    this.connectionCheckInterval = setInterval(async () => {
      const session = this.activeSessions.get(session_id);
      if (!session) {
        clearInterval(this.connectionCheckInterval);
        return;
      }

      try {
        // ── 0) closed already? try to resurrect quickly ────────────────
        if (session.connectionStatus === 'closed') {
          logger.warn('HeygenService', 'Session closed – attempting auto-reconnect',
                      { session_id });
          await this.attemptReconnect(session_id);
          return;
        }

        // Check if we're waiting for a response
        if (session.pendingResponse) {
          const waitTime = Date.now() - session.lastActivity;
          logger.info('HeygenService', 'Waiting for Heygen response:', {
            session_id,
            waitTime,
            maxWaitTime: 30000 // 30 seconds max wait
          });

          if (waitTime > 30000) {
            logger.error('HeygenService', 'Response wait timeout:', {
              session_id,
              waitTime
            });
            session.pendingResponse = false;
            session.connectionStatus = 'connected';
          }
        }

        // ── 1) still streaming – check for stalls ─────────────────────
        if (session.connectionStatus === 'streaming') {
          const streamingTime = Date.now() - session.streamingStartTime;
          const expectedProgress = (streamingTime / session.estimatedDuration) * 100;
          
          logger.info('HeygenService', 'Streaming status:', {
            session_id,
            streamingTime,
            estimatedDuration: session.estimatedDuration,
            remainingTime: session.estimatedDuration - streamingTime,
            expectedProgress: `${expectedProgress.toFixed(2)}%`,
            lastActivity: new Date(session.lastActivity).toISOString()
          });

          // Check for streaming stalls
          const minWaitTime = Math.min(15000, session.estimatedDuration * 0.2);
          if (streamingTime > minWaitTime && expectedProgress < 5) {
            logger.warn('HeygenService', 'Streaming stall detected:', {
              session_id,
              streamingTime,
              expectedProgress
            });
            
            // Attempt reconnection
            const reconnected = await this.attemptReconnect(session_id);
            if (reconnected) {
              logger.info('HeygenService', 'Streaming resumed after reconnect:', { session_id });
            }
          }
        }
      } catch (error) {
        logger.error('HeygenService', 'Connection monitoring error:', {
          session_id,
          error: error.message
        });
      }
    }, 5000); // Check every 5 seconds
  }

  async createSession(avatar_name, voice_id, disable_idle_timeout) {
    logger.info('HeygenService', 'Creating session with:', { 
      avatar_name, 
      voice_id, 
      apiKey: this.apiKey ? '***' : 'missing', 
      serverUrl: this.serverUrl 
    });

    if (!this.apiKey) {
      logger.error('HeygenService', 'API key is missing');
      throw new Error('API key is not configured');
    }

    try {
      /* pass disable_idle_timeout ⇒ Heygen won't auto-close after 15 s */
      const requestBody = {
        quality: config.heygen.defaultQuality,
        avatar_name,
        voice: { voice_id },
        disable_idle_timeout
      };
      logger.info('HeygenService', 'Sending request to Heygen API:', { 
        endpoint: '/v1/streaming.new',
        requestBody: JSON.stringify(requestBody, null, 2)
      });

      const response = await fetch(`${this.serverUrl}/v1/streaming.new`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      logger.info('HeygenService', 'Received response status:', { status: response.status });
      const responseText = await response.text();
      logger.info('HeygenService', 'Raw response:', { responseText });

      let data;
      try {
        data = JSON.parse(responseText);
        logger.info('HeygenService', 'Parsed response:', { data: JSON.stringify(data, null, 2) });
      } catch (e) {
        logger.error('HeygenService', 'Failed to parse response as JSON:', { error: e.message });
        throw new Error('Invalid response from Heygen API');
      }

      if (response.status === 500 || data.code === 10013) {
        logger.error('HeygenService', 'Heygen API error:', { 
          message: data.message,
          code: data.code,
          status: response.status
        });
        throw new Error(data.message || 'Failed to create session');
      }

      if (!data.data) {
        logger.error('HeygenService', 'No data field in response');
        throw new Error('Invalid response format from Heygen API');
      }

      // Track active session
      this.activeSessions.set(data.data.session_id, {
        startTime: Date.now(),
        lastActivity: Date.now(),
        status: 'active',
        connectionStatus: 'initializing',
        avatar_name,
        voice_id
      });

      // Reset reconnect attempts for new session
      this.reconnectAttempts.set(data.data.session_id, 0);

      logger.info('HeygenService', 'Successfully created session:', { 
        sessionId: data.data.session_id,
        activeSessions: this.activeSessions.size
      });

      return data.data;
    } catch (error) {
      logger.error('HeygenService', 'Error creating session:', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async startSession(session_id, sdp) {
    logger.info('HeygenService', 'Starting session:', { session_id });
    try {
      const response = await fetch(`${this.serverUrl}/v1/streaming.start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ session_id, sdp }),
      });

      const data = await response.json();
      logger.info('HeygenService', 'Start session response:', { 
        status: response.status,
        data: JSON.stringify(data, null, 2)
      });

      if (response.status === 500) {
        logger.error('HeygenService', 'Failed to start session:', { 
          status: response.status,
          data: JSON.stringify(data, null, 2)
        });
        throw new Error('Failed to start session');
      }

      // Update session status
      const session = this.activeSessions.get(session_id);
      if (session) {
        session.connectionStatus = 'connected';
        session.lastActivity = Date.now();
        logger.info('HeygenService', 'Session connection established:', { 
          session_id,
          connectionStatus: session.connectionStatus
        });
      }

      // Start heartbeat monitoring
      this.startHeartbeat(session_id);

      return data.data;
    } catch (error) {
      logger.error('HeygenService', 'Error starting session:', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async handleICE(session_id, candidate) {
    logger.info('HeygenService', 'Handling ICE candidate:', { session_id });
    try {
      const response = await fetch(`${this.serverUrl}/v1/streaming.ice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ session_id, candidate }),
      });

      const data = await response.json();
      logger.info('HeygenService', 'ICE candidate response:', { 
        status: response.status,
        data: JSON.stringify(data, null, 2)
      });

      if (response.status === 500) {
        logger.error('HeygenService', 'Failed to handle ICE candidate:', { 
          status: response.status,
          data: JSON.stringify(data, null, 2)
        });
        throw new Error('Failed to handle ICE candidate');
      }
      return data;
    } catch (error) {
      logger.error('HeygenService', 'Error handling ICE candidate:', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async sendText(session_id, text) {
    logger.info('HeygenService', 'Sending text to Heygen:', { 
      session_id,
      textLength: text.length,
      textPreview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
    });

    // Check if session is active
    const session = this.activeSessions.get(session_id);
    if (!session) {
      logger.error('HeygenService', 'Attempting to send text to inactive session:', { session_id });
      throw new Error('Session is not active');
    }

    if (session.connectionStatus === 'closed') {
      throw new Error('WebRTC session already closed remotely');
    }

    if (session.connectionStatus !== 'connected' && session.connectionStatus !== 'streaming') {
      logger.error('HeygenService', 'Attempting to send text with inactive connection:', { 
        session_id,
        connectionStatus: session.connectionStatus
      });
      throw new Error('WebRTC connection is not active');
    }

    try {
      const response = await fetch(`${this.serverUrl}/v1/streaming.task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ session_id, text }),
      });

      const data = await response.json();

      if (response.status === 400 && data.code === 10005) {
        session.connectionStatus = 'closed';
        logger.warn('HeygenService', 'Remote session closed (10005)', { session_id });
        throw new Error('Session closed remotely');
      }

      logger.info('HeygenService', 'Send text response:', { 
        status: response.status,
        data: JSON.stringify(data, null, 2)
      });

      if (response.status === 500) {
        logger.error('HeygenService', 'Failed to send text:', { 
          status: response.status,
          data: JSON.stringify(data, null, 2)
        });
        throw new Error('Failed to send text');
      }

      // Update session activity
      session.lastActivity = Date.now();
      session.lastTaskId = data.data?.task_id;
      session.estimatedDuration = data.data?.duration_ms;
      session.connectionStatus = 'streaming';
      session.streamingStartTime = Date.now();

      logger.info('HeygenService', 'Session activity updated:', {
        session_id,
        taskId: session.lastTaskId,
        estimatedDuration: session.estimatedDuration,
        timeSinceLastActivity: Date.now() - session.lastActivity,
        connectionStatus: session.connectionStatus,
        streamingStartTime: session.streamingStartTime
      });

      return data.data;
    } catch (error) {
      logger.error('HeygenService', 'Error sending text:', { 
        error: error.message,
        stack: error.stack,
        session_id,
        sessionStatus: session?.status,
        connectionStatus: session?.connectionStatus
      });
      throw error;
    }
  }

  async stopSession(session_id) {
    logger.info('HeygenService', 'Stopping session:', { 
      session_id,
      sessionStatus: this.activeSessions.get(session_id)?.status,
      connectionStatus: this.activeSessions.get(session_id)?.connectionStatus
    });

    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    try {
      const response = await fetch(`${this.serverUrl}/v1/streaming.stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify({ session_id }),
      });

      const data = await response.json();
      logger.info('HeygenService', 'Stop session response:', { 
        status: response.status,
        data: JSON.stringify(data, null, 2)
      });

      if (response.status === 500) {
        logger.error('HeygenService', 'Failed to stop session:', { 
          status: response.status,
          data: JSON.stringify(data, null, 2)
        });
        throw new Error('Failed to stop session');
      }

      // Remove session from tracking
      this.activeSessions.delete(session_id);
      logger.info('HeygenService', 'Session removed from tracking:', { 
        session_id,
        remainingSessions: this.activeSessions.size
      });

      return data.data;
    } catch (error) {
      logger.error('HeygenService', 'Error stopping session:', { 
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async checkSessionHealth(session_id) {
    const session = this.activeSessions.get(session_id);
    if (!session) {
      logger.error('HeygenService', 'Session not found:', { session_id });
      return false;
    }

    const timeSinceLastActivity = Date.now() - session.lastActivity;
    logger.info('HeygenService', 'Session health check:', {
      session_id,
      status: session.status,
      connectionStatus: session.connectionStatus,
      timeSinceLastActivity,
      lastTaskId: session.lastTaskId,
      estimatedDuration: session.estimatedDuration
    });

    // If we're streaming, use the estimated duration
    if (session.connectionStatus === 'streaming' && session.estimatedDuration) {
      const timeSinceStreamingStart = Date.now() - session.streamingStartTime;
      const isWithinDuration = timeSinceStreamingStart < session.estimatedDuration;
      
      if (!isWithinDuration) {
        logger.info('HeygenService', 'Streaming completed:', {
          session_id,
          estimatedDuration: session.estimatedDuration,
          actualDuration: timeSinceStreamingStart
        });
        // Reset connection status after streaming completes
        session.connectionStatus = 'connected';
        session.lastActivity = Date.now();
        return true;
      }
      return true; // Keep session alive while streaming
    }

    // For non-streaming states, use the regular timeout
    return timeSinceLastActivity < 30000; // Consider session dead after 30 seconds of inactivity
  }

  async getSessionStatus(session_id) {
    const session = this.activeSessions.get(session_id);
    if (!session) {
      logger.warn('HeygenService', 'Session not found for status check:', { session_id });
      return null;
    }
    return {
      connectionStatus: session.connectionStatus,
      lastActivity: session.lastActivity,
      streamingStartTime: session.streamingStartTime,
      estimatedDuration: session.estimatedDuration
    };
  }
}

export const heygenService = new HeygenService();
