import { heygenService } from '../services/heygenService.js';
import { logger } from '../utils/logger.js';
import { persona } from '../utils/persona.js';
import geminiService from '../services/geminiService.js';

const estimateSpeakingDuration = (text) => {
  const wordCount = text.trim().split(/\s+/).length;
  return wordCount * 0.5; // seconds
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* split ~220-character chunks *on sentence boundaries*               */
const splitIntoChunks = (txt, max = 220) =>
  txt.match(new RegExp(`(.{1,${max}}[.!?])(?=\\s|$)`, 'g')) ?? [txt];


export const initializeHeygenBot = async (req, res) => {
  try {
    logger.info('HeygenController', 'Initializing Heygen bot');
    const initText = `Hello! I'm ${persona.name}. I've been initialized and I'm ready for the interview.`;
    logger.info('HeygenController', 'AI bot initialized successfully');
    res.json({
      success: true,
      message: 'Bot initialized successfully',
      data: { text: initText }
    });
  } catch (error) {
    logger.error('HeygenController', 'Bot initialization error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to initialize bot',
      error: error.message
    });
  }
};

export const createHeygenSession = async (req, res) => {
  try {
    const { avatar_name, voice_id } = req.body;
    const disable_idle_timeout = true;

    if (!avatar_name) {
      return res.status(400).json({ success: false, message: 'Missing required parameter: avatar_name' });
    }

    const sessionInfo = await heygenService.createSession(avatar_name, voice_id, disable_idle_timeout);

    if (!sessionInfo) {
      return res.status(500).json({ success: false, message: 'No session info received' });
    }

    res.json({ success: true, message: 'Session created successfully', data: sessionInfo });
  } catch (error) {
    logger.error('HeygenController', 'Session creation error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to create session', error: error.message });
  }
};

export const handleICECandidate = async (req, res) => {
  try {
    const { session_id, candidate } = req.body;

    if (!session_id || !candidate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: session_id and candidate'
      });
    }

    const response = await heygenService.handleICE(session_id, candidate);

    res.json({
      success: true,
      message: 'ICE candidate handled successfully',
      data: response
    });
  } catch (error) {
    logger.error('HeygenController', 'ICE handling error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to handle ICE candidate',
      error: error.message
    });
  }
};

export const startHeygenSession = async (req, res) => {
  try {
    const { session_id, sdp } = req.body;

    if (!session_id || !sdp) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: session_id and sdp'
      });
    }

    const response = await heygenService.startSession(session_id, sdp);

    res.json({
      success: true,
      message: 'Session started successfully',
      data: response
    });
  } catch (error) {
    logger.error('HeygenController', 'Session start error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to start session',
      error: error.message
    });
  }
};

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Poll the service every second and return only when the remote
 * clip has really finished (no more streaming). No timeouts –
 * we just look at the actual flag.
 */
// ─── wait until the remote clip has FINISHED ─────────────────────────
const waitUntilIdle = async (session_id, pollMs = 1000) => {
  while (true) {
    const status = await heygenService.getSessionStatus(session_id);

    /* session gone → give up */
    if (!status) break;

    /* we're safe to continue ONLY when avatar is no longer streaming   */
    if (status.connectionStatus !== 'streaming') break;

    await new Promise(r => setTimeout(r, pollMs));
  }
};


/* ────────────────────────────────────────────────────────────────────
 *  THE ONLY END-POINT THAT WAS FAILING
 * ────────────────────────────────────────────────────────────────── */
export const sendHeygenText = async (req, res) => {
  try {
    const { session_id, text, generate_ai_response } = req.body;
    if (!session_id || !text) {
      return res.status(400).json({ success: false, message: 'session_id & text required' });
    }

    /* ── 1. build the final reply that should be spoken ───────────── */
    let finalText = text;
    if (generate_ai_response) {
      logger.info('HeygenController', 'Generating Gemini answer');
      finalText = await geminiService.generateResponse(text);
    }

    /* ── 2. cut it into chunks small enough for TTS ───────────────── */
    const chunks = splitIntoChunks(finalText);

    /* ── 3. send each chunk **sequentially** – no overlap! ────────── */
    for (const chunk of chunks) {
      logger.info('HeygenController', '▶ sending chunk', { len: chunk.length, preview: chunk.slice(0, 80) });

      /* send to HeyGen – gets back task id & estimated duration */
       // ① block until the avatar is 100 % idle
         await waitUntilIdle(session_id);          // polls every 1 s
      
         // ② queue next task
       const { duration_ms = 8000 } =
              await heygenService.sendText(session_id, chunk);
    
        // ③ *again* wait for completion, then loop
        await waitUntilIdle(session_id);
    }

    return res.json({
      success: true,
      message: 'Avatar spoke full answer',
      data: { ai_response: finalText }
    });

  } catch (err) {
    logger.error('HeygenController', 'sendHeygenText failed', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to speak text', error: err.message });
  }
};
export const stopHeygenSession = async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: session_id'
      });
    }

    const response = await heygenService.stopSession(session_id);

    res.json({
      success: true,
      message: 'Session stopped successfully',
      data: response
    });
  } catch (error) {
    logger.error('HeygenController', 'Session stop error', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to stop session',
      error: error.message
    });
  }
};
