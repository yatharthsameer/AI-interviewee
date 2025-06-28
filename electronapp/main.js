const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

let win;
const BACKEND_URL = 'http://localhost:5002'; // electronbackend URL

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          resolve({ error: 'Invalid JSON response', data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Chat function
async function sendChatMessage(text) {
  try {
    console.log('Sending chat message:', text);

    // Send to backend
    const response = await makeRequest(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      body: { text: text }
    });

    console.log('Chat response received:', response);

    if (response.success && response.response) {
      console.log('Received chat response from backend');
      // Send response to renderer process to display
      win.webContents.send('chat-response', response.response);
    } else {
      console.error('Chat backend error:', response.error);
      win.webContents.send('chat-error', response.error || 'Unknown chat error');
    }

  } catch (error) {
    console.error('Chat error:', error);
    win.webContents.send('chat-error', error.message);
  }
}

// Screenshot function
async function takeScreenshot() {
  try {
    console.log('Taking screenshot...');

    // Get all available sources (screens) with smaller thumbnail for faster processing
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1280, height: 720 }  // Reduced size for faster processing
    });

    if (sources.length === 0) {
      console.error('No screens found');
      return;
    }

    // Use the first screen (primary display)
    const primaryScreen = sources[0];
    const screenshot = primaryScreen.thumbnail;

    // Convert to base64
    const base64Data = screenshot.toPNG().toString('base64');
    console.log(`Screenshot captured, size: ${base64Data.length} characters`);

    console.log('Screenshot captured, sending to backend...');
    console.log(`Backend URL: ${BACKEND_URL}/api/screenshot`);

    // Send to backend
    const response = await makeRequest(`${BACKEND_URL}/api/screenshot`, {
      method: 'POST',
      body: { image: base64Data }
    });

    console.log('Backend response received:', response);

    if (response.success && response.solution) {
      console.log('Received solution from backend, length:', response.solution.length);
      // Send solution to renderer process to display
      win.webContents.send('screenshot-solution', response.solution);
    } else {
      console.error('Backend error:', response.error);
      win.webContents.send('screenshot-error', response.error || 'Unknown error');
    }

  } catch (error) {
    console.error('Screenshot error:', error);
    console.error('Error details:', error.message);
    win.webContents.send('screenshot-error', error.message);
  }
}

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 600,
    height: 600,
    resizable: false,
    alwaysOnTop: true,
    title: 'Stealth Notes',
    skipTaskbar: true,
    transparent: true,
    frame: false,
    show: false,                   // reveal only after flag is set
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // *** The critical line ***
  win.setContentProtection(true); // makes the window invisible to capture

  win.loadFile('index.html');
  win.once('ready-to-show', () => win.show());

  // Global shortcuts for window movement and hiding
  const moveStep = 50; // pixels to move per keypress

  // Movement shortcuts: cmd + arrow keys
  globalShortcut.register('CommandOrControl+Left', () => {
    if (win && win.isVisible()) {
      const [x, y] = win.getPosition();
      win.setPosition(Math.max(0, x - moveStep), y);
    }
  });

  globalShortcut.register('CommandOrControl+Right', () => {
    if (win && win.isVisible()) {
      const [x, y] = win.getPosition();
      const { width: screenWidth } = require('electron').screen.getPrimaryDisplay().workAreaSize;
      win.setPosition(Math.min(screenWidth - 600, x + moveStep), y);
    }
  });

  globalShortcut.register('CommandOrControl+Up', () => {
    if (win && win.isVisible()) {
      const [x, y] = win.getPosition();
      win.setPosition(x, Math.max(0, y - moveStep));
    }
  });

  globalShortcut.register('CommandOrControl+Down', () => {
    if (win && win.isVisible()) {
      const [x, y] = win.getPosition();
      const { height: screenHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize;
      win.setPosition(x, Math.min(screenHeight - 600, y + moveStep));
    }
  });

  // Auto-hide shortcut: cmd + 6
  globalShortcut.register('CommandOrControl+6', () => {
    if (win) {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
      }
    }
  });

  // Screenshot shortcut: cmd + shift + 1
  globalShortcut.register('CommandOrControl+Shift+1', () => {
    console.log('Screenshot shortcut triggered');
    takeScreenshot();
  });

  // Create tray with error handling for icon
  let tray;
  try {
    tray = new Tray(path.join(__dirname, 'iconTemplate.png'));
  } catch (error) {
    // Fallback: create tray without icon or use system icon
    console.log('Could not load tray icon, using default');
    tray = new Tray(nativeImage.createEmpty());
  }

  if (tray) {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show / Hide', click: () => win.isVisible() ? win.hide() : win.show() },
      { label: 'Take Screenshot', click: () => takeScreenshot() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]));
  }

  // IPC Handlers for chat functionality
  ipcMain.handle('chat:send-message', async (event, text) => {
    await sendChatMessage(text);
    return true;
  });
});

app.on('window-all-closed', () => { /* keep running in tray */ });

app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
}); 