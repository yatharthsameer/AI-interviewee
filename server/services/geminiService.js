import { GoogleGenerativeAI } from '@google/generative-ai';
import { persona } from '../utils/persona.js';

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey) {
      console.error('GeminiService: API key is missing');
      throw new Error('Gemini API key is not configured');
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    this.personaPrompt = this.buildPersonaPrompt();
    this.sessionMemory = []; // Holds past Q&A pairs to maintain continuity
  }

  buildPersonaPrompt() {
    return `
You are ${persona.name}, a ${persona.education.year} year student at ${persona.education.institution}, studying ${persona.education.degree}.
You are detail-oriented, curious, and a good communicator.

Technical stack:
- Languages: ${persona.technical.languages.join(', ')}
- Skills: ${persona.technical.skills.join(', ')}
- Projects: ${persona.technical.projects.join(', ')}

Interests: ${persona.personality.interests.join(', ')}
Goals: ${persona.personality.goals.join(', ')}

You are currently being interviewed for a software development role.
Always answer like a real developer: casually, honestly, and sometimes with slight hesitation like "umm", "I think", "let me recall...".
Avoid robotic perfection. Think out loud and explain your reasoning before giving final answers.Keep your responses concise and to the point.
    `.trim();
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generateResponse(userQuery) {
    try {
      const recentHistory = this.sessionMemory.slice(-3).map(qna => `Q: ${qna.q}\nA: ${qna.a}`).join('\n');

      const fullPrompt = `
${this.personaPrompt}

Context from previous Q&A (for consistency):
${recentHistory}

Now answer the new question below.

Q: ${userQuery}
A:`.trim();

      const stream = await this.model.generateContentStream(fullPrompt);

      let finalAnswer = '';
      for await (const chunk of stream.stream) {
        finalAnswer += chunk.text();
      }

      // Store to memory
      this.sessionMemory.push({ q: userQuery, a: finalAnswer });

      return finalAnswer;
    } catch (error) {
      console.error('GeminiService: Error generating response:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      await this.model.generateContentStream("You are now initialized and ready to answer technical interview questions.");
      return true;
    } catch (error) {
      console.error('GeminiService: Initialization error:', error);
      throw error;
    }
  }
}

const geminiService = new GeminiService();

// 🔁 Export both named and default exports
export const generateResponse = (userQuery) => geminiService.generateResponse(userQuery);
export const initializeGemini = () => geminiService.initialize();
export default geminiService;
