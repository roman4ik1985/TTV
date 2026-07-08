# Handoff

## Goal

Continue `TTV / SmartReader` in a new clean chat from the post-Stage-4 baseline.

## Done

- Canonical live repo: `C:\Text to Speech`.
- Saved Codex project / old workspace metadata may still mention `C:\Text to Voice`; treat that as stale wrapper context, not the source of truth.
- Repository `roman4ik1985/TTV` is connected and `main` is pushed to `origin/main`.
- Current baseline commit: `e875513` (`feat: add stage 4 translator contour`).
- Worktree is clean.
- Closed contours already on `main`:
  - Stage 1: text history, on-screen editing, keyboard controls
  - Stage 2: Google Drive import
  - Stage 3: OneDrive import
  - Stage 4: translator contour
- Stage 4 specifics:
  - current-text translation UI exists in the editor bar
  - translation runs through Electron main/preload boundary
  - provider contract supports `DeepL` and `LibreTranslate`
  - translated text is stored as a separate history row with provenance metadata
  - `npm run ci` is green
  - live smoke passed for:
    - unconfigured provider path
    - local self-hosted `LibreTranslate` success path

## Next Step

1. Read the current repo state and `AGENTS.md`.
2. Propose `Stage 5` under the required `AGENTS.md` format:
   - `Что именно (steps, budget)`
   - `Минимальный scope (steps, budget)`
3. Keep the first Stage 5 proposal grounded in the current product line:
   - translation/productization follow-up
   - broader app UX tightening
   - another approved roadmap contour
4. Do not start implementation until the plan and execution estimate are approved.

## Key Files

- `C:\Text to Speech\AGENTS.md`
- `C:\Text to Speech\README.md`
- `C:\Text to Speech\main.js`
- `C:\Text to Speech\preload.js`
- `C:\Text to Speech\renderer.js`
- `C:\Text to Speech\index.html`
- `C:\Text to Speech\wiki\index.md`
- `C:\Text to Speech\wiki\log.md`
- `C:\Text to Speech\wiki\synthesis\TRANSLATOR_STAGE4.md`
- `C:\Text to Speech\wiki\synthesis\HANDOFF_2026-07-08_STAGE4_CLEAN_CHAT.md`
