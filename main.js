const { app, BrowserWindow, globalShortcut, clipboard, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Readable } = require('stream');
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
const ONEDRIVE_SCOPES = ['Files.Read', 'offline_access'];
const SUPPORTED_CLOUD_IMPORT_EXTENSIONS = ['txt', 'md', 'vtt', 'srt', 'pdf', 'docx', 'epub', 'mp3', 'wav', 'ogg', 'flac'];
const DEEPL_PROVIDER_ID = 'deepl';
const DEEPL_DEFAULT_API_URL = 'https://api-free.deepl.com';
const DEEPL_MAX_REQUEST_BYTES = 120 * 1024;
const LIBRETRANSLATE_PROVIDER_ID = 'libretranslate';
const LIBRETRANSLATE_DEFAULT_API_URL = 'http://127.0.0.1:5000';
const LIBRETRANSLATE_DEFAULT_MAX_CHARS = 4000;
const APP_TO_LIBRE_LANGUAGE_CODE = {
  AUTO: 'auto',
  RU: 'ru',
  UK: 'uk',
  EN: 'en',
  DE: 'de',
  FR: 'fr',
  ES: 'es',
  IT: 'it',
  PL: 'pl',
  'PT-BR': 'pb'
};
const LIBRE_TO_APP_LANGUAGE_CODE = {
  auto: 'AUTO',
  ru: 'RU',
  uk: 'UK',
  en: 'EN',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
  pt: 'PT',
  pb: 'PT-BR'
};

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

function getOneDriveTokenPath() {
  return path.join(getCloudRuntimeDir(), 'one-drive-token.json');
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

function parseScopeList(scopeValue, fallbackValue = []) {
  if (Array.isArray(scopeValue)) {
    return scopeValue.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof scopeValue === 'string') {
    return scopeValue.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean);
  }

  return [...fallbackValue];
}

function trimTrailingSlash(value, fallbackValue) {
  return String(value || fallbackValue || '').replace(/\/+$/, '');
}

function getConfiguredOneDriveConfigPath() {
  const candidates = [
    process.env.TTV_ONEDRIVE_CONFIG_FILE,
    path.join(projectDir, 'onedrive_oauth_client.json')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadConfiguredOneDriveConfig() {
  const configPath = getConfiguredOneDriveConfigPath();
  if (!configPath) return { configPath: '', payload: {} };
  return {
    configPath,
    payload: safeReadJson(configPath, {}) || {}
  };
}

function getOneDriveOAuthConfig() {
  const { configPath, payload } = loadConfiguredOneDriveConfig();
  const scopes = parseScopeList(
    process.env.TTV_ONEDRIVE_SCOPES,
    parseScopeList(payload.scopes, ONEDRIVE_SCOPES)
  );

  return {
    configPath,
    clientId: String(process.env.TTV_ONEDRIVE_CLIENT_ID || payload.clientId || payload.client_id || '').trim(),
    tenant: String(process.env.TTV_ONEDRIVE_TENANT || payload.tenant || 'common').trim() || 'common',
    authorityHost: trimTrailingSlash(process.env.TTV_ONEDRIVE_AUTHORITY_HOST || payload.authorityHost, 'https://login.microsoftonline.com'),
    redirectUri: String(process.env.TTV_ONEDRIVE_REDIRECT_URI || payload.redirectUri || 'http://localhost/oauth2/callback').trim() || 'http://localhost/oauth2/callback',
    graphBaseUrl: trimTrailingSlash(process.env.TTV_ONEDRIVE_GRAPH_BASE_URL || payload.graphBaseUrl, 'https://graph.microsoft.com/v1.0'),
    scopes: Array.from(new Set(scopes.length > 0 ? scopes : ONEDRIVE_SCOPES))
  };
}

function getConfiguredTranslatorConfigPath() {
  const candidates = [
    process.env.TTV_TRANSLATOR_CONFIG_FILE,
    path.join(projectDir, 'translator_config.json')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadConfiguredTranslatorConfig() {
  const configPath = getConfiguredTranslatorConfigPath();
  if (!configPath) return { configPath: '', payload: {} };
  return {
    configPath,
    payload: safeReadJson(configPath, {}) || {}
  };
}

function normalizeTranslatorProviderId(value) {
  const providerId = String(value || '').trim().toLowerCase();
  if (providerId === LIBRETRANSLATE_PROVIDER_ID) return LIBRETRANSLATE_PROVIDER_ID;
  return DEEPL_PROVIDER_ID;
}

function getTranslatorBaseConfig(payload = {}) {
  return {
    provider: normalizeTranslatorProviderId(process.env.TTV_TRANSLATOR_PROVIDER || payload.provider),
    configPath: '',
    defaultSourceLanguage: String(process.env.TTV_TRANSLATOR_DEFAULT_SOURCE_LANGUAGE || payload.defaultSourceLanguage || 'AUTO').trim().toUpperCase() || 'AUTO',
    defaultTargetLanguage: String(process.env.TTV_TRANSLATOR_DEFAULT_TARGET_LANGUAGE || payload.defaultTargetLanguage || 'EN').trim().toUpperCase() || 'EN'
  };
}

function getDeepLTranslatorState(payload = {}, baseState) {
  const providerConfig = payload.deepl && typeof payload.deepl === 'object' ? payload.deepl : {};
  const apiUrl = trimTrailingSlash(
    process.env.TTV_DEEPL_API_URL || providerConfig.apiUrl || payload.apiUrl || payload.baseUrl,
    DEEPL_DEFAULT_API_URL
  );
  const authKey = String(process.env.TTV_DEEPL_AUTH_KEY || providerConfig.authKey || payload.authKey || '').trim();
  const configured = Boolean(authKey);

  return {
    ...baseState,
    provider: DEEPL_PROVIDER_ID,
    providerName: 'DeepL',
    configured,
    apiUrl,
    authKey,
    setupHint: configured
      ? ''
      : 'Добавьте translator_config.json с provider=deepl и authKey (или задайте TTV_DEEPL_AUTH_KEY) для DeepL API.'
  };
}

function getLibreTranslateTranslatorState(payload = {}, baseState) {
  const providerConfig = payload.libretranslate && typeof payload.libretranslate === 'object' ? payload.libretranslate : {};
  const apiUrl = trimTrailingSlash(
    process.env.TTV_LIBRETRANSLATE_API_URL || providerConfig.apiUrl || payload.apiUrl || payload.baseUrl,
    LIBRETRANSLATE_DEFAULT_API_URL
  );
  const apiKey = String(process.env.TTV_LIBRETRANSLATE_API_KEY || providerConfig.apiKey || payload.apiKey || '').trim();
  const maxCharsPerRequest = Number(
    process.env.TTV_LIBRETRANSLATE_MAX_CHARS_PER_REQUEST
    || providerConfig.maxCharsPerRequest
    || payload.maxCharsPerRequest
    || LIBRETRANSLATE_DEFAULT_MAX_CHARS
  );

  return {
    ...baseState,
    provider: LIBRETRANSLATE_PROVIDER_ID,
    providerName: 'LibreTranslate',
    configured: Boolean(apiUrl),
    apiUrl,
    apiKey,
    maxCharsPerRequest: Number.isFinite(maxCharsPerRequest) && maxCharsPerRequest > 0
      ? Math.floor(maxCharsPerRequest)
      : LIBRETRANSLATE_DEFAULT_MAX_CHARS,
    setupHint: apiUrl
      ? ''
      : 'Добавьте translator_config.json с provider=libretranslate и apiUrl (или задайте TTV_LIBRETRANSLATE_API_URL).'
  };
}

function getTranslatorProviderState() {
  const { configPath, payload } = loadConfiguredTranslatorConfig();
  const baseState = {
    ...getTranslatorBaseConfig(payload),
    configPath
  };

  if (baseState.provider === LIBRETRANSLATE_PROVIDER_ID) {
    return getLibreTranslateTranslatorState(payload, baseState);
  }

  return getDeepLTranslatorState(payload, baseState);
}

function getPublicTranslationState() {
  const { authKey, apiKey, ...publicState } = getTranslatorProviderState();
  return publicState;
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
    supportsSearch: true,
    setupHint: credentialsPath
      ? ''
      : 'Добавьте Desktop OAuth client JSON как google_oauth_client.json рядом с приложением или задайте TTV_GOOGLE_OAUTH_CLIENT_FILE.'
  };
}

function getOneDriveProviderState() {
  const config = getOneDriveOAuthConfig();
  const tokenPayload = safeReadJson(getOneDriveTokenPath(), null);
  const isConfigured = Boolean(config.clientId);

  return {
    id: ONEDRIVE_PROVIDER_ID,
    name: 'OneDrive',
    configured: isConfigured,
    connected: Boolean(tokenPayload && (tokenPayload.refresh_token || tokenPayload.access_token)),
    configPath: config.configPath,
    needsSetup: !isConfigured,
    canBrowse: isConfigured,
    supportsSearch: true,
    setupHint: isConfigured
      ? ''
      : 'Добавьте OneDrive public client config как onedrive_oauth_client.json рядом с приложением или задайте TTV_ONEDRIVE_CLIENT_ID.'
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

function getSupportedBinaryImportDescriptor(fileName, mimeType, sourceLabel) {
  const extension = getExtensionFromName(fileName) || GOOGLE_MIME_EXTENSION_MAP[mimeType] || '';
  if (!extension || !SUPPORTED_CLOUD_IMPORT_EXTENSIONS.includes(extension)) {
    return null;
  }

  return {
    supported: true,
    kind: 'binary',
    extension,
    sourceLabel
  };
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

  return getSupportedBinaryImportDescriptor(file.name, mimeType, 'Google Drive');
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

function createPkcePair() {
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function mergeOneDriveTokenPayload(currentTokenPayload = {}, nextTokenPayload = {}) {
  const expiresIn = Number(nextTokenPayload.expires_in || currentTokenPayload.expires_in || 0);
  return {
    ...currentTokenPayload,
    ...nextTokenPayload,
    refresh_token: nextTokenPayload.refresh_token || currentTokenPayload.refresh_token || '',
    expires_at: expiresIn > 0 ? Date.now() + (expiresIn * 1000) : currentTokenPayload.expires_at || 0
  };
}

function isOneDriveAccessTokenFresh(tokenPayload) {
  const expiresAt = Number(tokenPayload?.expires_at || 0);
  return Boolean(tokenPayload?.access_token) && expiresAt > (Date.now() + 60_000);
}

function getOneDriveTokenEndpoint(config) {
  return `${config.authorityHost}/${config.tenant}/oauth2/v2.0/token`;
}

function getOneDriveAuthorizeEndpoint(config) {
  return `${config.authorityHost}/${config.tenant}/oauth2/v2.0/authorize`;
}

function assertSupportedOneDriveRedirectUri(config) {
  let redirectUrl;
  try {
    redirectUrl = new URL(config.redirectUri);
  } catch (_error) {
    throw new Error('OneDrive redirect URI is invalid. Use an http://localhost path.');
  }

  if (!['localhost', '127.0.0.1'].includes(redirectUrl.hostname) || redirectUrl.protocol !== 'http:') {
    throw new Error('OneDrive redirect URI must use http://localhost or http://127.0.0.1 for the current SmartReader loopback flow.');
  }

  return redirectUrl;
}

async function requestOneDriveToken(config, params) {
  const response = await fetch(getOneDriveTokenEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || 'OneDrive token request failed.');
    error.code = payload.error || 'TOKEN_REQUEST_FAILED';
    throw error;
  }

  return payload;
}

function writeOneDriveTokenPayload(tokenPayload) {
  writeJson(getOneDriveTokenPath(), tokenPayload);
  return tokenPayload;
}

async function refreshOneDriveAccessToken(config, currentTokenPayload) {
  if (!currentTokenPayload?.refresh_token) {
    const error = new Error('OneDrive refresh token is missing.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const tokenResult = await requestOneDriveToken(config, {
    client_id: config.clientId,
    grant_type: 'refresh_token',
    refresh_token: currentTokenPayload.refresh_token,
    scope: config.scopes.join(' ')
  });

  const nextTokenPayload = mergeOneDriveTokenPayload(currentTokenPayload, tokenResult);
  writeOneDriveTokenPayload(nextTokenPayload);
  return nextTokenPayload;
}

async function authenticateOneDriveInteractively() {
  const config = getOneDriveOAuthConfig();
  if (!config.clientId) {
    throw new Error('OneDrive client ID is not configured. Add onedrive_oauth_client.json or set TTV_ONEDRIVE_CLIENT_ID.');
  }

  const registeredRedirectUrl = assertSupportedOneDriveRedirectUri(config);
  const state = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const { codeVerifier, codeChallenge } = createPkcePair();

  return new Promise((resolve, reject) => {
    let settled = false;
    let activeRedirectUri = '';
    const loopbackServer = http.createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', `http://${registeredRedirectUrl.hostname}`);
        if (requestUrl.pathname !== registeredRedirectUrl.pathname) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found.');
          return;
        }

        if (requestUrl.searchParams.get('state') !== state) {
          throw new Error('OneDrive OAuth state mismatch.');
        }

        if (requestUrl.searchParams.has('error')) {
          throw new Error(`OneDrive authorization rejected: ${requestUrl.searchParams.get('error')}`);
        }

        const code = requestUrl.searchParams.get('code');
        if (!code) {
          throw new Error('OneDrive authorization code missing.');
        }

        const tokenResult = await requestOneDriveToken(config, {
          client_id: config.clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: activeRedirectUri,
          code_verifier: codeVerifier,
          scope: config.scopes.join(' ')
        });

        const tokenPayload = mergeOneDriveTokenPayload({}, tokenResult);
        writeOneDriveTokenPayload(tokenPayload);

        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<html><body style="font-family:Segoe UI,sans-serif;padding:24px;">OneDrive подключен. Можно вернуться в SmartReader.</body></html>');

        settled = true;
        resolve(tokenPayload);
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(`<html><body style="font-family:Segoe UI,sans-serif;padding:24px;">Ошибка авторизации OneDrive: ${String(error.message || error)}</body></html>`);
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
      const redirectUri = `${registeredRedirectUrl.protocol}//${registeredRedirectUrl.hostname}:${port}${registeredRedirectUrl.pathname}`;
      activeRedirectUri = redirectUri;
      const authUrl = new URL(getOneDriveAuthorizeEndpoint(config));

      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_mode', 'query');
      authUrl.searchParams.set('scope', config.scopes.join(' '));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('prompt', 'select_account');

      try {
        await shell.openExternal(authUrl.toString());
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

async function oneDriveGraphRequest(resourcePathOrUrl, options = {}) {
  const { config, accessToken, method = 'GET', query = null, headers = {}, body = null } = options;
  const requestUrl = resourcePathOrUrl.startsWith('http')
    ? new URL(resourcePathOrUrl)
    : new URL(`${config.graphBaseUrl}${resourcePathOrUrl}`);

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      requestUrl.searchParams.set(key, value);
    });
  }

  const response = await fetch(requestUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...headers
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      payload = {};
    }

    const error = new Error(payload?.error?.message || text || `Microsoft Graph request failed with HTTP ${response.status}.`);
    error.code = payload?.error?.code || `HTTP_${response.status}`;
    error.status = response.status;
    error.retryAfter = response.headers.get('retry-after') || '';
    throw error;
  }

  return response;
}

async function getOneDriveSession(options = {}) {
  const interactive = Boolean(options.interactive);
  const providerState = getOneDriveProviderState();
  const config = getOneDriveOAuthConfig();

  if (!providerState.configured) {
    throw new Error(providerState.setupHint);
  }

  let tokenPayload = safeReadJson(getOneDriveTokenPath(), null);
  if (!tokenPayload && interactive) {
    tokenPayload = await authenticateOneDriveInteractively();
  }

  if (!tokenPayload) {
    const error = new Error('OneDrive authorization is required.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  try {
    if (!isOneDriveAccessTokenFresh(tokenPayload)) {
      tokenPayload = await refreshOneDriveAccessToken(config, tokenPayload);
    }

    await oneDriveGraphRequest('/me/drive', {
      config,
      accessToken: tokenPayload.access_token,
      query: { $select: 'id,driveType,webUrl' }
    });

    return {
      config,
      tokenPayload
    };
  } catch (error) {
    const message = String(error?.message || error || '');
    const shouldReset = error?.status === 401 || /invalid_grant|invalid_request|interaction_required|token/i.test(message);

    if (shouldReset) {
      if (fs.existsSync(getOneDriveTokenPath())) fs.unlinkSync(getOneDriveTokenPath());
      if (interactive) {
        return {
          config,
          tokenPayload: await authenticateOneDriveInteractively()
        };
      }
      const authError = new Error('OneDrive authorization expired. Reconnect the account.');
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

function escapeOneDriveSearchValue(value) {
  return String(value || '').replace(/'/g, "''");
}

function getSupportedOneDriveImportDescriptor(file) {
  if (!file || file.folder) return null;
  return getSupportedBinaryImportDescriptor(file.name, file.file?.mimeType || '', 'OneDrive');
}

function mapOneDriveFile(file) {
  const descriptor = getSupportedOneDriveImportDescriptor(file);
  return {
    id: file.id,
    name: file.name,
    modifiedTime: file.lastModifiedDateTime,
    size: file.size,
    webViewLink: file.webUrl,
    supported: Boolean(descriptor),
    importKind: descriptor?.kind || 'unsupported',
    extension: descriptor?.extension || '',
    sourceLabel: descriptor?.sourceLabel || 'OneDrive'
  };
}

async function listOneDriveFiles(query = '', pageToken = '') {
  const { config, tokenPayload } = await getOneDriveSession({ interactive: false });
  let response;

  if (pageToken) {
    response = await oneDriveGraphRequest(pageToken, {
      config,
      accessToken: tokenPayload.access_token
    });
  } else if (query.trim()) {
    const searchPath = `/me/drive/root/search(q='${escapeOneDriveSearchValue(query.trim())}')`;
    response = await oneDriveGraphRequest(searchPath, {
      config,
      accessToken: tokenPayload.access_token,
      query: {
        $top: '20',
        $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference'
      }
    });
  } else {
    response = await oneDriveGraphRequest('/me/drive/root/children', {
      config,
      accessToken: tokenPayload.access_token,
      query: {
        $top: '20',
        $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference'
      }
    });
  }

  const payload = await response.json();
  const files = (payload.value || [])
    .map(mapOneDriveFile)
    .filter((file) => file.supported)
    .sort((left, right) => String(right.modifiedTime || '').localeCompare(String(left.modifiedTime || '')));

  return {
    files,
    nextPageToken: payload['@odata.nextLink'] || ''
  };
}

async function streamWebResponseToPath(response, targetPath) {
  if (!response.body) {
    throw new Error('Cloud file response has no body.');
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(targetPath));
  return targetPath;
}

async function importOneDriveFile(fileId) {
  const { config, tokenPayload } = await getOneDriveSession({ interactive: false });
  const metadataResponse = await oneDriveGraphRequest(`/me/drive/items/${encodeURIComponent(fileId)}`, {
    config,
    accessToken: tokenPayload.access_token,
    query: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder,@microsoft.graph.downloadUrl'
    }
  });

  const file = await metadataResponse.json();
  const descriptor = getSupportedOneDriveImportDescriptor(file);
  if (!descriptor) {
    throw new Error('Этот файл OneDrive пока не поддерживается для импорта в SmartReader.');
  }

  const downloadUrl = file['@microsoft.graph.downloadUrl'];
  if (!downloadUrl) {
    throw new Error('OneDrive did not return a download URL for this file.');
  }

  const timestamp = Date.now();
  const safeBaseName = sanitizeCloudFileName(path.parse(file.name || 'cloud-file').name);
  const outputFileName = `${safeBaseName}-${timestamp}.${descriptor.extension}`;
  const outputFilePath = path.join(getCloudImportCacheDir(), outputFileName);
  const downloadResponse = await fetch(downloadUrl);

  if (!downloadResponse.ok) {
    throw new Error(`OneDrive download failed with HTTP ${downloadResponse.status}.`);
  }

  await streamWebResponseToPath(downloadResponse, outputFilePath);

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
    await getOneDriveSession({ interactive: true });
    return { ok: true, provider: getOneDriveProviderState() };
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
    try {
      const result = await listOneDriveFiles(query, pageToken);
      return { ok: true, provider: getOneDriveProviderState(), ...result };
    } catch (error) {
      return {
        ok: false,
        provider: getOneDriveProviderState(),
        error: error.code === 'AUTH_REQUIRED'
          ? 'OneDrive authorization is required. Connect the account first.'
          : error.message
      };
    }
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
    try {
      const result = await importOneDriveFile(fileId);
      return { ok: true, provider: getOneDriveProviderState(), ...result };
    } catch (error) {
      return {
        ok: false,
        provider: getOneDriveProviderState(),
        error: error.code === 'AUTH_REQUIRED'
          ? 'OneDrive authorization expired. Reconnect the account and retry.'
          : error.message
      };
    }
  }

  return {
    ok: false,
    error: `Unknown cloud provider: ${providerId}`
  };
}

function splitTextByByteLimit(text, maxRequestBytes) {
  const normalizedText = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalizedText) return [];
  if (Buffer.byteLength(normalizedText, 'utf8') <= maxRequestBytes) return [normalizedText];

  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let currentChunk = '';

  function pushChunk(nextChunk) {
    if (nextChunk && nextChunk.trim()) chunks.push(nextChunk.trim());
  }

  function flushCurrent() {
    pushChunk(currentChunk);
    currentChunk = '';
  }

  function splitOversizedParagraph(paragraph) {
    const sentences = paragraph
      .split(/(?<=[.!?。！？])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      const parts = [];
      let offset = 0;
      while (offset < paragraph.length) {
        let end = Math.min(paragraph.length, offset + 2000);
        while (end < paragraph.length && Buffer.byteLength(paragraph.slice(offset, end), 'utf8') > maxRequestBytes) {
          end -= 100;
        }
        if (end <= offset) end = Math.min(paragraph.length, offset + 1000);
        parts.push(paragraph.slice(offset, end).trim());
        offset = end;
      }
      return parts.filter(Boolean);
    }

    const sentenceChunks = [];
    let sentenceChunk = '';
    sentences.forEach((sentence) => {
      const candidate = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
      if (Buffer.byteLength(candidate, 'utf8') > maxRequestBytes) {
        if (sentenceChunk) sentenceChunks.push(sentenceChunk.trim());
        sentenceChunk = sentence;
      } else {
        sentenceChunk = candidate;
      }
    });
    if (sentenceChunk) sentenceChunks.push(sentenceChunk.trim());
    return sentenceChunks.filter(Boolean);
  }

  paragraphs.forEach((paragraph) => {
    const paragraphText = paragraph.trim();
    if (!paragraphText) return;

    if (Buffer.byteLength(paragraphText, 'utf8') > maxRequestBytes) {
      flushCurrent();
      splitOversizedParagraph(paragraphText).forEach((part) => pushChunk(part));
      return;
    }

    const candidate = currentChunk ? `${currentChunk}\n\n${paragraphText}` : paragraphText;
    if (Buffer.byteLength(candidate, 'utf8') > maxRequestBytes) {
      flushCurrent();
      currentChunk = paragraphText;
    } else {
      currentChunk = candidate;
    }
  });

  flushCurrent();
  return chunks;
}

function splitTextByCharacterLimit(text, maxChars) {
  const normalizedText = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalizedText) return [];
  if (normalizedText.length <= maxChars) return [normalizedText];

  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let currentChunk = '';

  function pushChunk(nextChunk) {
    if (nextChunk && nextChunk.trim()) chunks.push(nextChunk.trim());
  }

  function flushCurrent() {
    pushChunk(currentChunk);
    currentChunk = '';
  }

  function splitOversizedParagraph(paragraph) {
    const sentences = paragraph
      .split(/(?<=[.!?。！？])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      const parts = [];
      let offset = 0;
      while (offset < paragraph.length) {
        parts.push(paragraph.slice(offset, offset + maxChars).trim());
        offset += maxChars;
      }
      return parts.filter(Boolean);
    }

    const sentenceChunks = [];
    let sentenceChunk = '';
    sentences.forEach((sentence) => {
      const candidate = sentenceChunk ? `${sentenceChunk} ${sentence}` : sentence;
      if (candidate.length > maxChars) {
        if (sentenceChunk) sentenceChunks.push(sentenceChunk.trim());
        sentenceChunk = sentence;
      } else {
        sentenceChunk = candidate;
      }
    });
    if (sentenceChunk) sentenceChunks.push(sentenceChunk.trim());
    return sentenceChunks.filter(Boolean);
  }

  paragraphs.forEach((paragraph) => {
    if (paragraph.length > maxChars) {
      flushCurrent();
      splitOversizedParagraph(paragraph).forEach((part) => pushChunk(part));
      return;
    }

    const candidate = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) {
      flushCurrent();
      currentChunk = paragraph;
    } else {
      currentChunk = candidate;
    }
  });

  flushCurrent();
  return chunks;
}

function mapAppLanguageCodeToLibre(languageCode, kind) {
  const normalizedLanguageCode = String(languageCode || '').trim().toUpperCase();
  const providerLanguageCode = APP_TO_LIBRE_LANGUAGE_CODE[normalizedLanguageCode];
  if (providerLanguageCode) return providerLanguageCode;

  throw new Error(`LibreTranslate не поддерживает выбранный ${kind}: ${normalizedLanguageCode || 'UNKNOWN'}.`);
}

function mapLibreLanguageCodeToApp(languageCode, fallbackLanguageCode) {
  const normalizedLanguageCode = String(languageCode || '').trim().toLowerCase();
  if (LIBRE_TO_APP_LANGUAGE_CODE[normalizedLanguageCode]) {
    return LIBRE_TO_APP_LANGUAGE_CODE[normalizedLanguageCode];
  }

  return String(fallbackLanguageCode || '').trim().toUpperCase() || 'AUTO';
}

async function translateWithDeepL(text, sourceLanguage, targetLanguage) {
  const translatorState = getTranslatorProviderState();
  if (!translatorState.configured) {
    throw new Error(translatorState.setupHint);
  }

  const textChunks = splitTextByByteLimit(text, DEEPL_MAX_REQUEST_BYTES);
  if (textChunks.length === 0) {
    throw new Error('Нет текста для перевода.');
  }

  const translatedChunks = [];
  let detectedSourceLanguage = sourceLanguage === 'AUTO' ? '' : sourceLanguage;

  for (const textChunk of textChunks) {
    const requestBody = {
      text: [textChunk],
      target_lang: targetLanguage
    };

    if (sourceLanguage !== 'AUTO') {
      requestBody.source_lang = sourceLanguage;
    }

    const response = await fetch(`${translatorState.apiUrl}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${translatorState.authKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = payload?.message || payload?.detail || `DeepL translation failed with HTTP ${response.status}.`;
      throw new Error(details);
    }

    const translation = Array.isArray(payload.translations) ? payload.translations[0] : null;
    if (!translation?.text) {
      throw new Error('DeepL вернул пустой результат перевода.');
    }

    translatedChunks.push(translation.text);
    if (!detectedSourceLanguage && translation.detected_source_language) {
      detectedSourceLanguage = translation.detected_source_language;
    }
  }

  return {
    text: translatedChunks.join('\n\n').trim(),
    provider: translatorState.providerName,
    sourceLanguage: detectedSourceLanguage || sourceLanguage,
    targetLanguage
  };
}

async function translateWithLibreTranslate(text, sourceLanguage, targetLanguage) {
  const translatorState = getTranslatorProviderState();
  if (!translatorState.configured) {
    throw new Error(translatorState.setupHint);
  }

  const libreSourceLanguage = mapAppLanguageCodeToLibre(sourceLanguage, 'язык источника');
  const libreTargetLanguage = mapAppLanguageCodeToLibre(targetLanguage, 'язык перевода');
  const textChunks = splitTextByCharacterLimit(text, translatorState.maxCharsPerRequest || LIBRETRANSLATE_DEFAULT_MAX_CHARS);
  if (textChunks.length === 0) {
    throw new Error('Нет текста для перевода.');
  }

  const translatedChunks = [];
  let detectedSourceLanguage = sourceLanguage === 'AUTO' ? '' : sourceLanguage;

  for (const textChunk of textChunks) {
    const requestBody = {
      q: textChunk,
      source: libreSourceLanguage,
      target: libreTargetLanguage,
      format: 'text'
    };

    if (translatorState.apiKey) {
      requestBody.api_key = translatorState.apiKey;
    }

    const response = await fetch(`${translatorState.apiUrl}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = payload?.error || payload?.message || `LibreTranslate translation failed with HTTP ${response.status}.`;
      throw new Error(details);
    }

    if (!payload?.translatedText) {
      throw new Error('LibreTranslate вернул пустой результат перевода.');
    }

    translatedChunks.push(String(payload.translatedText).trim());
    if (!detectedSourceLanguage && payload?.detectedLanguage?.language) {
      detectedSourceLanguage = mapLibreLanguageCodeToApp(payload.detectedLanguage.language, sourceLanguage);
    }
  }

  return {
    text: translatedChunks.join('\n\n').trim(),
    provider: translatorState.providerName,
    sourceLanguage: detectedSourceLanguage || sourceLanguage,
    targetLanguage
  };
}

async function translateText(request = {}) {
  const text = String(request.text || '').trim();
  if (!text) {
    throw new Error('Нечего переводить: текущий текст пуст.');
  }

  const translatorState = getTranslatorProviderState();
  const sourceLanguage = String(request.sourceLanguage || translatorState.defaultSourceLanguage || 'AUTO').trim().toUpperCase() || 'AUTO';
  const targetLanguage = String(request.targetLanguage || translatorState.defaultTargetLanguage || 'EN').trim().toUpperCase() || 'EN';

  if (sourceLanguage === targetLanguage) {
    throw new Error('Источник и язык перевода совпадают. Выберите другой целевой язык.');
  }

  if (translatorState.provider === DEEPL_PROVIDER_ID) {
    return translateWithDeepL(text, sourceLanguage, targetLanguage);
  }

  if (translatorState.provider === LIBRETRANSLATE_PROVIDER_ID) {
    return translateWithLibreTranslate(text, sourceLanguage, targetLanguage);
  }

  throw new Error(`Неподдерживаемый provider перевода: ${translatorState.provider}`);
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
    sourceLanguage: typeof entry.sourceLanguage === 'string' && entry.sourceLanguage.trim() ? entry.sourceLanguage.trim().toUpperCase() : '',
    targetLanguage: typeof entry.targetLanguage === 'string' && entry.targetLanguage.trim() ? entry.targetLanguage.trim().toUpperCase() : '',
    translationProvider: typeof entry.translationProvider === 'string' && entry.translationProvider.trim() ? entry.translationProvider.trim() : '',
    originHistoryId: typeof entry.originHistoryId === 'string' && entry.originHistoryId.trim() ? entry.originHistoryId.trim() : '',
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

  const nextHistory = history.filter((item) => {
    if (item.id === normalizedEntry.id) return false;
    const isSameContent = item.text === normalizedEntry.text
      && item.source === normalizedEntry.source
      && item.sourceLanguage === normalizedEntry.sourceLanguage
      && item.targetLanguage === normalizedEntry.targetLanguage;
    return !isSameContent;
  });
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

  ipcMain.handle('get-translation-state', async () => {
    try {
      return { ok: true, state: getPublicTranslationState() };
    } catch (error) {
      return { ok: false, error: error.message, state: getPublicTranslationState() };
    }
  });

  ipcMain.handle('translate-text', async (_event, request) => {
    try {
      return { ok: true, ...await translateText(request) };
    } catch (error) {
      return { ok: false, error: error.message };
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
