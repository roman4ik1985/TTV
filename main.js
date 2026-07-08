const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('disable-features', 'RequireUserActivationForMediaPlayback');

const projectDir = __dirname;
const preloadPath = path.join(projectDir, 'preload.js');
const sttScriptPath = path.join(projectDir, 'stt_server.py');
const ttsScriptPath = path.join(projectDir, 'tts_server.py');
const tempTextPath = path.join(projectDir, 'temp_text.txt');
const tempTimingPath = path.join(projectDir, 'temp_timing.json');
const userDictPath = path.join(projectDir, 'user_dict.json');
const textHistoryPath = path.join(projectDir, 'text_history.json');
const MAX_HISTORY_ENTRIES = 25;

let mainWindow;
let liveSttProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 650,
    title: 'Умный Читатель',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile('index.html');
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function spawnPython(scriptPath, args = []) {
  return spawn('python', [scriptPath, ...args], {
    cwd: projectDir,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

function runPythonScript(scriptPath, args = []) {
  return new Promise((resolve) => {
    const child = spawnPython(scriptPath, args);
    let stdout = '';
    let stderr = '';
    let settled = false;

    function finish(payload) {
      if (settled) return;
      settled = true;
      resolve(payload);
    }

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      finish({
        code: -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: error.message
      });
    });

    child.on('close', (code) => {
      finish({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function readUserDictionary() {
  if (!fs.existsSync(userDictPath)) return {};
  const raw = fs.readFileSync(userDictPath, 'utf-8');
  return JSON.parse(raw);
}

function countWords(text) {
  return (text || '').trim().split(/\s+/).filter((word) => word.length > 0).length;
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry.text !== 'string') return null;

  const text = entry.text.trim();
  if (!text) return null;

  const source = typeof entry.source === 'string' && entry.source.trim() ? entry.source.trim() : 'Текст';
  const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : source;
  const createdAt = typeof entry.createdAt === 'string' && entry.createdAt.trim() ? entry.createdAt : new Date().toISOString();
  const updatedAt = typeof entry.updatedAt === 'string' && entry.updatedAt.trim() ? entry.updatedAt : createdAt;

  return {
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    text,
    source,
    label,
    createdAt,
    updatedAt,
    charCount: text.length,
    wordCount: countWords(text)
  };
}

function readTextHistory() {
  if (!fs.existsSync(textHistoryPath)) return [];

  const raw = fs.readFileSync(textHistoryPath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(normalizeHistoryEntry)
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, MAX_HISTORY_ENTRIES);
}

function writeTextHistory(entries) {
  const normalizedEntries = Array.isArray(entries) ? entries.map(normalizeHistoryEntry).filter(Boolean) : [];
  fs.writeFileSync(
    textHistoryPath,
    JSON.stringify(normalizedEntries.slice(0, MAX_HISTORY_ENTRIES), null, 2),
    'utf-8'
  );
}

function upsertTextHistoryEntry(entry) {
  const history = readTextHistory();
  const existingEntry = history.find((item) => item.id === entry?.id) || null;
  const normalizedEntry = normalizeHistoryEntry({
    ...entry,
    createdAt: existingEntry?.createdAt || entry?.createdAt,
    updatedAt: new Date().toISOString()
  });

  if (!normalizedEntry) {
    throw new Error('История текста: не удалось сохранить пустую запись.');
  }

  const nextHistory = history.filter((item) => item.id !== normalizedEntry.id && item.text !== normalizedEntry.text);
  nextHistory.unshift(normalizedEntry);
  writeTextHistory(nextHistory);

  return {
    savedEntry: normalizedEntry,
    history: readTextHistory()
  };
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('show-save-dialog', async () => {
    return dialog.showSaveDialog({
      title: 'Сохранить надиктованный текст',
      defaultPath: 'smart_reader_text.txt',
      filters: [{ name: 'Текстовые файлы', extensions: ['txt'] }]
    });
  });

  ipcMain.handle('read-text-file', async (_event, filePath) => {
    try {
      return { ok: true, text: fs.readFileSync(filePath, 'utf-8') };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('read-user-dictionary', async () => {
    try {
      return { ok: true, dictionary: readUserDictionary() };
    } catch (error) {
      return { ok: false, error: error.message, dictionary: {} };
    }
  });

  ipcMain.handle('write-user-dictionary', async (_event, dictionary) => {
    try {
      fs.writeFileSync(userDictPath, JSON.stringify(dictionary, null, 2), 'utf-8');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('read-text-history', async () => {
    try {
      return { ok: true, history: readTextHistory() };
    } catch (error) {
      return { ok: false, error: error.message, history: [] };
    }
  });

  ipcMain.handle('upsert-text-history', async (_event, entry) => {
    try {
      const result = upsertTextHistoryEntry(entry);
      return { ok: true, history: result.history, savedEntry: result.savedEntry };
    } catch (error) {
      return { ok: false, error: error.message, history: [] };
    }
  });

  ipcMain.handle('delete-text-history-entry', async (_event, entryId) => {
    try {
      const nextHistory = readTextHistory().filter((item) => item.id !== entryId);
      writeTextHistory(nextHistory);
      return { ok: true, history: readTextHistory() };
    } catch (error) {
      return { ok: false, error: error.message, history: [] };
    }
  });

  ipcMain.handle('clear-text-history', async () => {
    try {
      writeTextHistory([]);
      return { ok: true, history: [] };
    } catch (error) {
      return { ok: false, error: error.message, history: [] };
    }
  });

  ipcMain.handle('process-import', async (_event, filePath) => {
    return runPythonScript(sttScriptPath, [filePath]);
  });

  ipcMain.handle('start-live-stt', async () => {
    if (liveSttProcess) {
      return { ok: false, error: 'Распознавание уже запущено.' };
    }

    const process = spawnPython(sttScriptPath);
    let stdoutBuffer = '';
    let stderrBuffer = '';
    liveSttProcess = process;

    process.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const messages = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = messages.pop();

      messages.forEach((entry) => {
        const message = entry.trim();
        if (!message) return;

        if (message === 'READY_TO_LISTEN') {
          sendToRenderer('live-stt-event', { type: 'ready' });
        } else if (message.startsWith('PARTIAL:')) {
          sendToRenderer('live-stt-event', {
            type: 'partial',
            text: message.replace('PARTIAL:', '').trim()
          });
        } else if (message === 'PROCESSING_FINISHED') {
          sendToRenderer('live-stt-event', { type: 'finished' });
        } else if (message.startsWith('ERROR:')) {
          sendToRenderer('live-stt-event', {
            type: 'error',
            message: message.replace('ERROR:', '').trim()
          });
        } else {
          sendToRenderer('live-stt-event', { type: 'raw', message });
        }
      });
    });

    process.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
    });

    process.on('error', (error) => {
      sendToRenderer('live-stt-event', {
        type: 'spawn-error',
        message: error.message
      });
      liveSttProcess = null;
    });

    process.on('close', (code) => {
      sendToRenderer('live-stt-event', {
        type: 'close',
        code,
        stderr: stderrBuffer.trim(),
        trailingMessage: stdoutBuffer.trim()
      });
      liveSttProcess = null;
    });

    return { ok: true };
  });

  ipcMain.handle('stop-live-stt', async () => {
    if (!liveSttProcess) {
      return { ok: false, error: 'Распознавание не запущено.' };
    }

    try {
      liveSttProcess.stdin.write('stop\n');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('synthesize-text', async (_event, text, gender) => {
    try {
      fs.writeFileSync(tempTextPath, text, 'utf-8');
    } catch (error) {
      return { code: -1, stdout: '', stderr: '', error: error.message, timings: [] };
    }

    const result = await runPythonScript(ttsScriptPath, [tempTextPath, gender]);

    if (result.stdout.includes('SUCCESS')) {
      try {
        result.timings = JSON.parse(fs.readFileSync(tempTimingPath, 'utf-8'));
      } catch (error) {
        result.timings = [];
        result.timingError = error.message;
      }
    } else {
      result.timings = [];
    }

    return result;
  });

  ipcMain.handle('export-text', async (_event, filePath, text) => {
    try {
      fs.writeFileSync(filePath, text, 'utf-8');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  globalShortcut.register('CommandOrControl+Shift+T', () => {
    const text = clipboard.readText();
    if (text && mainWindow) {
      mainWindow.show();
      sendToRenderer('clipboard-text', text);
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  if (liveSttProcess) {
    liveSttProcess.kill();
    liveSttProcess = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
