# Cloud Import Stage 3: OneDrive

## Goal
- Extend the Stage 2 cloud provider contract with a real OneDrive implementation.
- Keep the renderer and IPC shape stable so Google Drive and OneDrive remain parallel providers.

## Current State
- OneDrive now uses Microsoft identity platform public-client auth with auth code + PKCE through the system browser.
- The SmartReader implementation expects a localhost loopback redirect and stores the token cache under Electron user data in `cloud-runtime/one-drive-token.json`.
- Supported OneDrive imports are the same binary formats already supported by SmartReader:
  - `txt`, `md`, `vtt`, `srt`, `pdf`, `docx`, `epub`, `mp3`, `wav`, `ogg`, `flac`
- The renderer now treats OneDrive as a real provider instead of a placeholder card.

## Config
- File-based config: `onedrive_oauth_client.json` next to the app
- Env overrides:
  - `TTV_ONEDRIVE_CLIENT_ID`
  - `TTV_ONEDRIVE_TENANT`
  - `TTV_ONEDRIVE_REDIRECT_URI`
  - `TTV_ONEDRIVE_AUTHORITY_HOST`
  - `TTV_ONEDRIVE_GRAPH_BASE_URL`
  - `TTV_ONEDRIVE_SCOPES`
  - `TTV_ONEDRIVE_CONFIG_FILE`

## Key Files
- `main.js` - OneDrive config parsing, token persistence, PKCE auth, Graph list/download calls
- `renderer.js` - provider-agnostic cloud browse/search flow
- `README.md` - operator-facing OneDrive setup instructions

## Validation Target
- `npm run ci`
- Live Electron smoke:
  - upload modal opens
  - OneDrive card reveals real provider panel
  - without config, panel shows setup hint instead of dead placeholder state
  - with config, connect/list/import path should reuse the existing upload pipeline

## Follow-up
- Current OneDrive listing is intentionally narrow: root children when no query, root search when query is present.
- Shared libraries, SharePoint-specific drive routing, and retry/backoff tuning stay for a later contour if the workflow proves important.
