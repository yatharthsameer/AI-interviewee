const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to communicate
// with the main process securely
contextBridge.exposeInMainWorld('electronAPI', {
    // Listen for screenshot solution from main process
    onScreenshotSolution: (callback) => {
        ipcRenderer.on('screenshot-solution', (event, solution) => {
            callback(solution);
        });
    },

    // Listen for screenshot errors from main process
    onScreenshotError: (callback) => {
        ipcRenderer.on('screenshot-error', (event, error) => {
            callback(error);
        });
    },

    // Chat functionality
    sendChatMessage: (text) => ipcRenderer.invoke('chat:send-message', text),

    onChatResponse: (callback) => {
        ipcRenderer.on('chat-response', (event, response) => {
            callback(response);
        });
    },

    onChatError: (callback) => {
        ipcRenderer.on('chat-error', (event, error) => {
            callback(error);
        });
    },

    // Remove listeners when needed
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

// nothing fancy yet – isolated world so the renderer is sandboxed 