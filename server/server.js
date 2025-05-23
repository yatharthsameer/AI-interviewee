import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import personaRouter from './routes/personaRoutes.js';
import chatRouter from './routes/chatRouter.js';
import { initializeSpeechServer } from './controllers/speechController.js';
import dotenv from 'dotenv';
import cors from 'cors';
import { createServer } from 'http';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

app.use('/persona', personaRouter);
app.use('/openai', chatRouter);

const server = createServer(app);
initializeSpeechServer(server);

server.listen(process.env.PORT, () => {
  logger.info('Server', `Server running at http://localhost:${process.env.PORT}`);
});
