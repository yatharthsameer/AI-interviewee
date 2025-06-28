# AI Interview MVP

A comprehensive AI-powered interview system featuring multiple components for different use cases.

## 🚀 Project Overview

This project consists of three main components:

1. **Electron App** - A stealthy desktop application for taking screenshots and getting AI solutions
2. **Electron Backend** - Python Flask server providing AI analysis capabilities
3. **Heygen Avatar** - React-based web application with AI avatar for interactive conversations

## ✨ Features

### Electron App & Backend
- 📸 **Screenshot Analysis**: Take screenshots of coding questions and get instant AI solutions
- 🧠 **AI-Powered Solutions**: Uses Google Gemini AI to analyze and solve coding problems
- 🎯 **Global Shortcuts**: Quick access with keyboard shortcuts
- 🔒 **Stealth Mode**: Invisible window that doesn't appear in taskbar
- 📱 **Movable Interface**: Reposition the app window with arrow keys
- ⚡ **Real-time Processing**: Fast analysis and response times
- 🔐 **Secure**: Runs locally with your own API keys

### Heygen Avatar
- 🤖 **AI Avatar**: Interactive AI-powered avatar for conversations
- 🎭 **Real-time Streaming**: Live avatar responses using Heygen technology
- 💬 **Chat Interface**: Natural conversation flow with AI
- 🎨 **Modern UI**: Beautiful React-based user interface
- 🔄 **State Management**: Tracks avatar speaking states and conversation flow

## 🛠️ Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- Python 3.8+
- Google Gemini API key

### 1. Electron App Setup

```bash
# Navigate to the Electron app directory
cd electronapp

# Install dependencies
npm install

# Start the Electron app
npm start
```

**Global Shortcuts:**
- `Cmd+Shift+1` - Take screenshot and analyze
- `Cmd+6` - Toggle app visibility
- `Cmd+Arrow Keys` - Move app window

### 2. Electron Backend Setup

```bash
# Navigate to the backend directory
cd electronbackend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set your Gemini API key
export GEMINI_API_KEY="your_gemini_api_key_here"

# Start the server
python start_server.py
```

The backend server will run on `http://localhost:5002`

### 3. Heygen Avatar Setup

```bash
# Navigate to the Heygen project directory
cd vite-heygen

# Install dependencies
npm install

# Start the development server
npm run dev
```

The Heygen app will run on `http://localhost:5173`

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the `electronbackend` directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### API Endpoints

#### Electron Backend (`http://localhost:5002`)

- `POST /api/screenshot` - Analyze screenshots
- `POST /api/chat` - Text-based chat analysis
- `POST /api/test_gemini` - Test Gemini API connection
- `GET /api/avatar_state` - Get avatar speaking state
- `POST /api/avatar_state` - Update avatar speaking state

## 📁 Project Structure

```
ai-interview-mvp/
├── electronapp/           # Electron desktop application
│   ├── main.js           # Main Electron process
│   ├── index.html        # App interface
│   ├── preload.js        # Preload script
│   └── package.json      # Node dependencies
├── electronbackend/       # Python Flask backend
│   ├── server.py         # Main server file
│   ├── conversation.py   # Conversation management
│   ├── gemsdk.py         # Gemini AI integration
│   ├── requirements.txt  # Python dependencies
│   └── models/           # AI model files (gitignored)
├── vite-heygen/          # React Heygen avatar app
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom React hooks
│   │   └── App.jsx       # Main app component
│   └── package.json      # Node dependencies
└── backend/              # Original backend (legacy)
```

## 🚀 Usage

### Using the Electron App

1. Start the Electron backend server
2. Launch the Electron app
3. Use `Cmd+Shift+1` to take a screenshot of a coding question
4. The AI will analyze the screenshot and provide a solution
5. Use `Cmd+6` to hide/show the app as needed

### Using the Heygen Avatar

1. Start the Heygen development server
2. Open the app in your browser
3. Interact with the AI avatar through the chat interface
4. The avatar will respond with real-time streaming

## 🔒 Security Notes

- Keep your API keys secure and never commit them to version control
- The Electron app runs locally and doesn't send data to external servers
- Large model files are excluded from Git to prevent repository bloat

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Troubleshooting

### Common Issues

1. **Electron app not starting**: Make sure Node.js is installed and dependencies are installed
2. **Backend connection failed**: Verify the backend server is running on port 5002
3. **Gemini API errors**: Check your API key is set correctly
4. **Large file errors**: Ensure large model files are in `.gitignore`

### Getting Help

- Check the console logs for detailed error messages
- Verify all dependencies are installed correctly
- Ensure all required environment variables are set 