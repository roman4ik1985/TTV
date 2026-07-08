# Translator Stage 4

## Goal
- Add a first translation contour for the current SmartReader text buffer.
- Keep secrets and network calls out of the renderer by using the existing Electron main/preload boundary.

## Current State
- Stage 4 now supports two providers behind one renderer contract: `DeepL` and `LibreTranslate`.
- Translation runs through `main.js` and `preload.js`, not through direct renderer fetches.
- The editor bar now contains:
  - source language selector
  - target language selector
  - `🌐 Перевести`
- A translated result is saved as a separate history row instead of overwriting the original text automatically.

## Config
- File-based config: `translator_config.json` next to the app
- Env overrides:
  - `TTV_TRANSLATOR_CONFIG_FILE`
  - `TTV_TRANSLATOR_PROVIDER`
  - `TTV_DEEPL_AUTH_KEY`
  - `TTV_DEEPL_API_URL`
  - `TTV_LIBRETRANSLATE_API_URL`
  - `TTV_LIBRETRANSLATE_API_KEY`
  - `TTV_LIBRETRANSLATE_MAX_CHARS_PER_REQUEST`
  - `TTV_TRANSLATOR_DEFAULT_SOURCE_LANGUAGE`
  - `TTV_TRANSLATOR_DEFAULT_TARGET_LANGUAGE`

## Implementation Notes
- Provider choice for Stage 4 is intentionally narrow at the UI level: one current-text action, no paragraph diff UI, no provider picker on screen.
- DeepL request size is bounded, so the main process splits oversized text into sequential chunks before translation.
- LibreTranslate uses the same renderer flow but routes through a provider-specific HTTP adapter and chunking path in `main.js`.
- History rows preserve optional translation metadata (`sourceLanguage`, `targetLanguage`, `translationProvider`, `originHistoryId`) even though the current UI still mainly displays `source` and preview text.

## Key Files
- `main.js` - translator config, provider dispatch, chunking, provider HTTP requests, IPC handlers
- `preload.js` - translation bridge
- `renderer.js` - language controls, translate action, history integration
- `index.html` - editor-bar translation controls
- `README.md` - operator setup

## Validation
- `npm run ci`
- Live Electron smoke target:
  - translation controls render in the editor bar
  - without provider config, translate action fails with a setup message while preserving the current text
  - with config, translated text appears as a new history row
  - verified once with a local self-hosted `LibreTranslate` endpoint on `http://127.0.0.1:5000`: current text translated through the unchanged UI and persisted as a separate history row

## Follow-up
- A later contour can add more providers on the same main-process contract if translation becomes a core workflow.
- If users start translating very large imported books often, chunking quality and batching strategy should be tuned with real examples.
