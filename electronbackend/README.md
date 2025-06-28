# Electron Backend Server

This backend server provides screenshot analysis capabilities for the Stealth Notes Electron app using Google Gemini AI.

## Setup

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set Environment Variables**:
   ```bash
   export GEMINI_API_KEY="your_gemini_api_key_here"
   ```

3. **Start the Server**:
   ```bash
   python start_server.py
   ```
   
   Or directly:
   ```bash
   python server.py
   ```

## API Endpoints

### `/api/screenshot` (POST)
Analyzes a screenshot and provides a solution.

**Request Body**:
```json
{
  "image": "base64_encoded_image_data"
}
```

**Response**:
```json
{
  "solution": "AI-generated solution and code",
  "success": true
}
```

**Error Response**:
```json
{
  "error": "Error message",
  "success": false
}
```

## Usage with Electron App

1. Start this backend server (runs on port 5002)
2. Start the Electron app
3. Press `Cmd+Shift+1` to take a screenshot
4. The screenshot will be analyzed by Gemini AI
5. The solution will appear in the Electron app

## Features

- 📸 **Screenshot Analysis**: Uses Gemini Vision to analyze coding questions
- 🧠 **AI Solutions**: Provides code solutions and explanations
- 🔒 **Secure**: Runs locally with your own API key
- ⚡ **Fast**: Quick analysis and response times 