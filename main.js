const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pipeline } = require('stream/promises');
const { google } = require('googleapis');

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
const GOOGLE_DRIVE_PROVIDER_ID = 'google-drive';
const ONEDRIVE_PROVIDER_ID = 'one-drive';
const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const GOOGLE_EXPORT_CONFIG = {
  'application/vnd.google-apps.document': {
    exportMimeType: 'text/markdown',
    extension: 'md',
    sourceLabel: 'Google Docs'
  },
  'application/vnd.google-apps.presentation': {
    exportMimeType: 'text/plain',
    extension: 'txt',
    sourceLabel: 'Google Slides'
  },
  'application/vnd.google-apps.spreadsheet': {
    exportMimeType: 'application/pdf',
    extension: 'pdf',
    sourceLabel: 'Google Sheets'
  },
  'application/vnd.google-apps.drawing': {
    exportMimeType: 'application/pdf',
    extension: 'pdf',
    sourceLabel: 'Google Drawing'
  }
};

const GOOGLE_MIME_EXTENSION_MAP = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/vtt': 'vtt',
  'application/x-subrip': 'srt',
  'application/pdf': 'pdf',
  'application/epub+zip': 'epub',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac'
};

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

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

function getCloudRuntimeDir() {
  return ensureDirectory(path.join(app.getPath('userData'), 'cloud-runtime'));
}

function getGoogleDriveTokenPath() {
  return path.join(getCloudRuntimeDir(), 'google-drive-token.json');
}

function getCloudImportCacheDir() {
  return ensureDirectory(path.join(getCloudRuntimeDir(), 'imports'));
}

function safeReadJson(filePath, fallbackValue = null) {
  if (!fs.existsSync(filePath)) return fallbackValue;

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_error) {
    return fallbackValue;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

function mergeGoogleTokenPayload(currentTokenPayload = {}, nextTokenPayload = {}) {
  return {
    ...currentTokenPayload,
    ...nextTokenPayload,
    refresh_token: nextTokenPayload.refresh_token || currentTokenPayload.refresh_token || ''
  };
}

function getConfiguredGoogleCredentialsPath() {
  const candidates = [
    process.env.TTV_GOOGLE_OAUTH_CLIENT_FILE,
    path.join(projectDir, 'google_oauth_client.json'),
    path.join(projectDir, 'credentials.json')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadGoogleCredentialsPayload() {
  const credentialsPath = getConfiguredGoogleCredentialsPath();
  if (!credentialsPath) return null;
  return safeReadJson(credentialsPath, null);
}

function getGoogleDriveProviderState() {
  const credentialsPath = getConfiguredGoogleCredentialsPath();
  const tokenPath = getGoogleDriveTokenPath();
  const tokenPayload = safeReadJson(tokenPath, null);

  return {
    id: GOOGLE_DRIVE_PROVIDER_ID,
    name: 'Google Drive',
    configured: Boolean(credentialsPath),
    connected: Boolean(tokenPayload && (tokenPayload.refresh_token || tokenPayload.access_token)),
    credentialsPath,
    needsSetup: !credentialsPath,
    canBrowse: Boolean(credentialsPath),
    setupHint: credentialsPath
      ? ''
      : 'Добавьте Desktop OAuth client JSON как google_oauth_client.json рядом с приложением или задайте TTV_GOOGLE_OAUTH_CLIENT_FILE.'
  };
}

function getOneDriveProviderState() {
  return {
    id: ONEDRIVE_PROVIDER_ID,
    name: 'OneDrive',
    configured: false,
    connected: false,
    canBrowse: false,
    planned: true,
    setupHint: 'Контур OneDrive пока не включен. Stage 2 готовит общий provider contract.'
  };
}

function getCloudProvidersState() {
  return {
    providers: [
      getGoogleDriveProviderState(),
      getOneDriveProviderState()
    ]
  };
}

function sanitizeCloudFileName(fileName) {
  return String(fileName || 'cloud-file')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim() || 'cloud-file';
}

function getExtensionFromName(fileName) {
  const ext = path.extname(fileName || '').replace(/^\./, '').toLowerCase();
  return ext || '';
}

function isGoogleWorkspaceMimeType(mimeType) {
  return typeof mimeType === 'string' && mimeType.startsWith('application/vnd.google-apps.');
}

function getSupportedGoogleImportDescriptor(file) {
  if (!file) return null;

  const mimeType = file.mimeType || '';
  if (mimeType === 'application/vnd.google-apps.folder') return null;

  if (GOOGLE_EXPORT_CONFIG[mimeType]) {
    return {
      supported: true,
      kind: 'google-workspace',
      ...GOOGLE_EXPORT_CONFIG[mimeType]
    };
  }

  const extension = getExtensionFromName(file.name) || GOOGLE_MIME_EXTENSION_MAP[mimeType] || '';
  if (!extension) return null;

  if (!['txt', 'md', 'vtt', 'srt', 'pdf', 'docx', 'epub', 'mp3', 'wav', 'ogg', 'flac'].includes(extension)) {
    return null;
  }

  return {
    supported: true,
    kind: 'binary',
    extension,
    sourceLabel: 'Google Drive'
  };
}

function createGoogleOAuthClient(credentialsPayload) {
  const keys = credentialsPayload.installed || credentialsPayload.web;
  if (!keys?.client_id || !keys?.client_secret) {
    throw new Error('Google OAuth credentials file is invalid.');
  }

  return new google.auth.OAuth2(
    keys.client_id,
    keys.client_secret,
    Array.isArray(keys.redirect_uris) && keys.redirect_uris[0] ? keys.redirect_uris[0] : 'http://localhost'
  );
}

function attachGoogleTokenPersistence(authClient) {
  authClient.on('tokens', (nextTokenPayload) => {
    if (!nextTokenPayload) return;
    const currentTokenPayload = safeReadJson(getGoogleDriveTokenPath(), {});
    writeJson(
      getGoogleDriveTokenPath(),
      mergeGoogleTokenPayload(currentTokenPayload, nextTokenPayload)
    );
  });

  return authClient;
}

function loadSavedGoogleDriveAuth() {
  const tokenPayload = safeReadJson(getGoogleDriveTokenPath(), null);
  if (!tokenPayload) return null;

  const credentialsPayload = loadGoogleCredentialsPayload();
  if (!credentialsPayload) return null;

  const authClient = attachGoogleTokenPersistence(createGoogleOAuthClient(credentialsPayload));
  authClient.setCredentials(tokenPayload);
  return authClient;
}

async function authenticateGoogleDriveInteractively() {
  const credentialsPayload = loadGoogleCredentialsPayload();
  if (!credentialsPayload) {
    throw new Error('Google Drive credentials not configured. Add google_oauth_client.json or set TTV_GOOGLE_OAUTH_CLIENT_FILE.');
  }

  const authClient = attachGoogleTokenPersistence(createGoogleOAuthClient(credentialsPayload));
  const state = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const { codeVerifier, codeChallenge } = await authClient.generateCodeVerifierAsync();

  return new Promise((resolve, reject) => {
    let settled = false;
    const loopbackServer = http.createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
        if (requestUrl.pathname !== '/oauth2/callback') {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found.');
          return;
        }

        if (requestUrl.searchParams.get('state') !== state) {
          throw new Error('Google Drive OAuth state mismatch.');
        }

        if (requestUrl.searchParams.has('error')) {
          throw new Error(`Google Drive authorization rejected: ${requestUrl.searchParams.get('error')}`);
        }

        const code = requestUrl.searchParams.get('code');
        if (!code) {
          throw new Error('Google Drive authorization code missing.');
        }

        const tokenResult = await authClient.getToken({
          code,
          codeVerifier,
          redirect_uri: authClient.redirectUri
        });

        const tokenPayload = mergeGoogleTokenPayload({}, tokenResult.tokens || {});
        authClient.setCredentials(tokenPayload);
        writeJson(getGoogleDriveTokenPath(), tokenPayload);

        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<html><body style="font-family:Segoe UI,sans-serif;padding:24px;">Google Drive подключен. Можно вернуться в SmartReader.</body></html>');

        settled = true;
        resolve(authClient);
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(`<html><body style="font-family:Segoe UI,sans-serif;padding:24px;">Ошибка авторизации Google Drive: ${String(error.message || error)}</body></html>`);
        settled = true;
        reject(error);
      } finally {
        loopbackServer.close();
      }
    });

    loopbackServer.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    loopbackServer.listen(0, '127.0.0.1', async () => {
      const address = loopbackServer.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
      authClient.redirectUri = redirectUri;

      const authUrl = authClient.generateAuthUrl({
        access_type: 'offline',
        scope: GOOGLE_DRIVE_SCOPES,
        state,
        prompt: 'consent',
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: redirectUri
      });

      try {
        await shell.openExternal(authUrl);
      } catch (error) {
        if (!settled) {
          settled = true;
          loopbackServer.close();
          reject(error);
        }
      }
    });
  });
}

async function getGoogleDriveAuth(options = {}) {
  const interactive = Boolean(options.interactive);
  const state = getGoogleDriveProviderState();

  if (!state.configured) {
    throw new Error(state.setupHint);
  }

  let authClient = loadSavedGoogleDriveAuth();
  if (!authClient && interactive) {
    authClient = await authenticateGoogleDriveInteractively();
  }

  if (!authClient) {
    const error = new Error('Google Drive authorization is required.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  try {
    await google.drive({ version: 'v3', auth: authClient }).about.get({ fields: 'user(displayName,emailAddress)' });
    if (authClient.credentials?.refresh_token || authClient.credentials?.access_token) {
      writeJson(getGoogleDriveTokenPath(), authClient.credentials);
    }
    return authClient;
  } catch (error) {
    const message = String(error?.message || error || '');
    if (/invalid_grant|invalid_request|unauthorized_client|token/i.test(message)) {
      if (fs.existsSync(getGoogleDriveTokenPath())) fs.unlinkSync(getGoogleDriveTokenPath());
      if (interactive) {
        return authenticateGoogleDriveInteractively();
      }
      const authError = new Error('Google Drive authorization expired. Reconnect the account.');
      authError.code = 'AUTH_REQUIRED';
      throw authError;
    }
    throw error;
  }
}

function escapeGoogleDriveQueryValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listGoogleDriveFiles(query = '', pageToken = '') {
  const auth = await getGoogleDriveAuth({ interactive: false });
  const drive = google.drive({ version: 'v3', auth });
  const queryFilters = ["trashed = false", "mimeType != 'application/vnd.google-apps.folder'"];

  if (query.trim()) {
    queryFilters.push(`name contains '${escapeGoogleDriveQueryValue(query.trim())}'`);
  }

  const result = await drive.files.list({
    pageSize: 20,
    pageToken: pageToken || undefined,
    orderBy: 'modifiedTime desc',
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, iconLink)',
    q: queryFilters.join(' and '),
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  const files = (result.data.files || [])
    .map((file) => {
      const descriptor = getSupportedGoogleImportDescriptor(file);
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
        size: file.size,
        webViewLink: file.webViewLink,
        iconLink: file.iconLink,
        supported: Boolean(descriptor),
        importKind: descriptor?.kind || 'unsupported',
        extension: descriptor?.extension || '',
        sourceLabel: descriptor?.sourceLabel || 'Google Drive'
      };
    })
    .filter((file) => file.supported);

  return {
    files,
    nextPageToken: result.data.nextPageToken || ''
  };
}

async function streamGoogleDriveFileToPath(readable, targetPath) {
  await pipeline(readable, fs.createWriteStream(targetPath));
  return targetPath;
}

async function importGoogleDriveFile(fileId) {
  const auth = await getGoogleDriveAuth({ interactive: false });
  const drive = google.drive({ version: 'v3', auth });
  const metadataResult = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, modifiedTime, size, fileExtension'
  });

  const file = metadataResult.data;
  const descriptor = getSupportedGoogleImportDescriptor(file);
  if (!descriptor) {
    throw new Error('Этот файл Google Drive пока не поддерживается для импорта в SmartReader.');
  }

  const timestamp = Date.now();
  const safeBaseName = sanitizeCloudFileName(path.parse(file.name || 'cloud-file').name);
  const outputFileName = `${safeBaseName}-${timestamp}.${descriptor.extension}`;
  const outputFilePath = path.join(getCloudImportCacheDir(), outputFileName);

  if (descriptor.kind === 'google-workspace') {
    const exportResponse = await drive.files.export(
      {
        fileId,
        mimeType: descriptor.exportMimeType
      },
      {
        responseType: 'stream'
      }
    );
    await streamGoogleDriveFileToPath(exportResponse.data, outputFilePath);
  } else {
    const downloadResponse = await drive.files.get(
      {
        fileId,
        alt: 'media'
      },
      {
        responseType: 'stream'
      }
    );
    await streamGoogleDriveFileToPath(downloadResponse.data, outputFilePath);
  }

  return {
    filePath: outputFilePath,
    fileName: outputFileName,
    sourceLabel: descriptor.sourceLabel
  };
}

async function connectCloudProvider(providerId) {
  if (providerId === GOOGLE_DRIVE_PROVIDER_ID) {
    await getGoogleDriveAuth({ interactive: true });
    return { ok: true, provider: getGoogleDriveProviderState() };
  }

  if (providerId === ONEDRIVE_PROVIDER_ID) {
    return {
      ok: false,
      provider: getOneDriveProviderState(),
      error: 'OneDrive will be enabled in a follow-up contour.'
    };
  }

  return {
    ok: false,
    error: `Unknown cloud provider: ${providerId}`
  };
}

async function listCloudProviderFiles(providerId, query, pageToken) {
  if (providerId === GOOGLE_DRIVE_PROVIDER_ID) {
    try {
      const result = await listGoogleDriveFiles(query, pageToken);
      return { ok: true, provider: getGoogleDriveProviderState(), ...result };
    } catch (error) {
      return {
        ok: false,
        provider: getGoogleDriveProviderState(),
        error: error.code === 'AUTH_REQUIRED'
          ? 'Google Drive authorization is required. Connect the account first.'
          : error.message
      };
    }
  }

  if (providerId === ONEDRIVE_PROVIDER_ID) {
    return {
      ok: false,
      provider: getOneDriveProviderState(),
      error: 'OneDrive listing is not enabled yet.'
    };
  }

  return {
    ok: false,
    error: `Unknown cloud provider: ${providerId}`
  };
}

async function importCloudProviderFile(providerId, fileId) {
  if (providerId === GOOGLE_DRIVE_PROVIDER_ID) {
    try {
      const result = await importGoogleDriveFile(fileId);
      return { ok: true, provider: getGoogleDriveProviderState(), ...result };
    } catch (error) {
      return {
        ok: false,
        provider: getGoogleDriveProviderState(),
        error: error.code === 'AUTH_REQUIRED'
          ? 'Google Drive authorization expired. Reconnect the account and retry.'
          : error.message
      };
    }
  }

  if (providerId === ONEDRIVE_PROVIDER_ID) {
    return {
      ok: false,
      provider: getOneDriveProviderState(),
      error: 'OneDrive import is not enabled yet.'
    };
  }

  return {
    ok: false,
    error: `Unknown cloud provider: ${providerId}`
  };
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

  ipcMain.handle('get-cloud-providers-state', async () => {
    try {
      return { ok: true, ...getCloudProvidersState() };
    } catch (error) {
      return { ok: false, error: error.message, providers: [] };
    }
  });

  ipcMain.handle('connect-cloud-provider', async (_event, providerId) => {
    return connectCloudProvider(providerId);
  });

  ipcMain.handle('list-cloud-files', async (_event, providerId, query, pageToken) => {
    return listCloudProviderFiles(providerId, query, pageToken);
  });

  ipcMain.handle('import-cloud-file', async (_event, providerId, fileId) => {
    return importCloudProviderFile(providerId, fileId);
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
