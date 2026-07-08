const { contextBridge, ipcRenderer, webUtils } = require('electron');

function makeEventSubscription(channel) {
  return (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('smartReader', {
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  getFilePath: (file) => webUtils.getPathForFile(file),
  readTextFile: (filePath) => ipcRenderer.invoke('read-text-file', filePath),
  readUserDictionary: () => ipcRenderer.invoke('read-user-dictionary'),
  writeUserDictionary: (dictionary) => ipcRenderer.invoke('write-user-dictionary', dictionary),
  readTextHistory: () => ipcRenderer.invoke('read-text-history'),
  upsertTextHistory: (entry) => ipcRenderer.invoke('upsert-text-history', entry),
  deleteTextHistoryEntry: (entryId) => ipcRenderer.invoke('delete-text-history-entry', entryId),
  clearTextHistory: () => ipcRenderer.invoke('clear-text-history'),
  processImport: (filePath) => ipcRenderer.invoke('process-import', filePath),
  startLiveStt: () => ipcRenderer.invoke('start-live-stt'),
  stopLiveStt: () => ipcRenderer.invoke('stop-live-stt'),
  synthesizeText: (text, gender) => ipcRenderer.invoke('synthesize-text', text, gender),
  exportText: (filePath, text) => ipcRenderer.invoke('export-text', filePath, text),
  onClipboardText: makeEventSubscription('clipboard-text'),
  onLiveSttEvent: makeEventSubscription('live-stt-event')
});
