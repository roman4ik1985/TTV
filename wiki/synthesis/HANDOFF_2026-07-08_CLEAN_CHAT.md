# Handoff

## Goal

Continue work on `TTV / SmartReader` from the current clean baseline in a new clean chat.

## Done

- The live project is `C:\Text to Speech`.
- GitHub repository `roman4ik1985/TTV` is already connected.
- Baseline release `v0.1.0` is published.
- GitHub Actions baseline CI is green.
- Current repository state is clean: `main` is synchronized with `origin/main`.
- The previously attempted YouTube hardening / handoff contour was explicitly reverted, so the new chat should treat the current code as the source of truth.

## Next Steps

1. Reconfirm the next contour before implementation under `AGENTS.md`.
2. Choose one of the open follow-up contours:
   - `#1` YouTube import hardening
   - `#2` import UX tightening
   - `#3` PDF edge cases
3. If resuming `#1`, start from the current unreworked YouTube path and build a fresh approved plan before changing code.

## Key Files

- `C:\Text to Speech\README.md`
- `C:\Text to Speech\package.json`
- `C:\Text to Speech\.github\workflows\ci.yml`
- `C:\Text to Speech\stt_server.py`
- `C:\Text to Speech\renderer.js`
- `C:\Text to Speech\wiki\log.md`
- `C:\Text to Speech\wiki\synthesis\HANDOFF_2026-07-08_CLEAN_CHAT.md`
