# Cloud Import Stage 2

## Goal
- Add the first real cloud import provider to SmartReader without breaking the existing local/import pipeline.
- Keep the contract provider-based so OneDrive can be added later without reworking renderer or IPC shape.

## Current State
- Google Drive is wired end-to-end through Electron IPC and renderer UI.
- OAuth uses the desktop-app browser flow with a loopback redirect and local token persistence under Electron user data.
- Supported Google Drive imports:
  - Google Docs -> Markdown
  - Google Slides -> plain text
  - Google Sheets -> PDF
  - Google Drawings -> PDF
  - SmartReader-supported binary files already stored in Drive: `txt`, `md`, `vtt`, `srt`, `pdf`, `docx`, `epub`, `mp3`, `wav`, `ogg`, `flac`
- OneDrive stays as a planned provider on the same contract and currently exposes only placeholder state in the UI.

## Key Files
- `main.js` - provider state, Google OAuth, Drive list/download/export, cloud IPC handlers
- `preload.js` - renderer bridge for cloud provider actions
- `renderer.js` - provider panel state, list/search/import UI flow
- `index.html` - provider cards and cloud panel markup/styles
- `README.md` - operator setup for Google OAuth

## Validation
- `npm run check:js`
- `npm run ci`
- Live Electron smoke:
  - upload modal still opens
  - cloud provider cards are present in the modal
  - UI needed an extra reveal step because the provider panel can land below the current modal viewport; renderer now scrolls the panel into view after provider selection

## Follow-up
- Stage 3 can add OneDrive on the existing provider contract instead of starting from scratch.
- If cloud import becomes a primary workflow, the upload modal likely needs a denser layout so provider cards and panel fit with less vertical scrolling.
