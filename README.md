# TTV / SmartReader

`TTV` is the GitHub repository and delivery baseline for the `SmartReader` Electron desktop app. The app reads Russian text aloud, imports text from files, transcribes speech, and extracts text from supported media sources.

## Features

- text-to-speech with `edge-tts`
- live dictation from microphone
- audio file transcription
- text extraction from `pdf`, `docx`, and `epub`
- cloud import from Google Drive for supported text, document, subtitle, audio, and PDF files
- subtitle extraction from supported YouTube links
- manual transcript/subtitle fallback from `.txt`, `.vtt`, `.srt`, or pasted transcript text

## Architecture

- `main.js` - trusted Electron main process, IPC handlers, file access, Python process management
- `preload.js` - isolated bridge between renderer and main process
- `renderer.js` - UI logic only, without direct Node.js access
- `tts_server.py` - text-to-speech worker
- `stt_server.py` - speech-to-text and import worker

## Security Model

- `nodeIntegration` is disabled in the renderer
- `contextIsolation` is enabled
- the renderer uses `window.smartReader` from `preload.js` instead of `require(...)`
- Python processes and filesystem operations run only through the main process

## Setup

Prerequisites:

- Node.js 22+
- Python 3.11+
- Windows environment for the packaged desktop target

1. Install Node.js dependencies:
   `npm install`
2. Install Python dependencies:
   `pip install -r requirements.txt`

## Run

- Start the desktop app:
  `npm start`

## Validation

- Local JS and Python syntax checks:
  `npm run ci`
- Windows packaging build:
  `npm run build`

## Build

- Package the Windows app:
  `npm run build`

## Notes

- The app expects `python` to be available in `PATH`.
- Pinned Python package versions are recorded in `requirements.txt`.
- Temporary runtime files are written next to the project in `temp_text.txt`, `temp_timing.json`, and `temp_voice.mp3`.
- Google Drive import uses Desktop OAuth client credentials from `google_oauth_client.json` next to the app, or from the path in `TTV_GOOGLE_OAUTH_CLIENT_FILE`.
- Google Drive tokens and imported temp files are stored under the Electron user-data runtime folder in `cloud-runtime/`.
- The current Google Drive scope is read-only (`drive.readonly`); OneDrive is not connected yet and remains a planned provider on the shared cloud-import contract.
- YouTube import now prefers `yt-dlp` with browser cookies from local Chromium browsers and falls back to `youtube-transcript-api` when browser-backed extraction is unavailable.
- If Chrome is open, Windows may lock the Chrome `Cookies` database. In that case, close Chrome and retry the YouTube import.
- If Chromium cookies cannot be decrypted on Windows, export YouTube cookies in Netscape `cookies.txt` format and place the file next to the app as `youtube_cookies.txt`, or point `TTV_YOUTUBE_COOKIES_FILE` to it.
- If YouTube keeps blocking subtitle retrieval, use the upload modal to import a saved `.vtt` / `.srt` / `.txt` transcript or paste the transcript text directly.
- The current CI baseline validates dependency install, JavaScript syntax, and Python syntax/import smoke checks on GitHub Actions.

## Google Drive Setup

1. In Google Cloud Console, create an OAuth 2.0 Desktop App client.
2. Download the client JSON.
3. Save it as `google_oauth_client.json` next to the app, or set `TTV_GOOGLE_OAUTH_CLIENT_FILE` to the downloaded file path.
4. Start the app with `npm start`, open `Загрузить файл`, choose `Google Диск`, and complete the browser-based sign-in flow.

Supported Google Drive imports:

- Google Docs -> `.md`
- Google Slides -> `.txt`
- Google Sheets -> `.pdf`
- Google Drawings -> `.pdf`
- binary files already supported by SmartReader: `txt`, `md`, `vtt`, `srt`, `pdf`, `docx`, `epub`, `mp3`, `wav`, `ogg`, `flac`
