# Handoff

## Goal

Stabilize issue `#1` for YouTube import hardening in `roman4ik1985/TTV`: make failure modes honest, keep user guidance actionable, and preserve a realistic fallback path when browser cookies fail.

## Done

- Added YouTube failure classification in `stt_server.py` for:
  - locked Chromium cookie DB
  - Windows DPAPI cookie decryption failure
  - HTTP 429 / anti-bot block
  - invalid exported Netscape `cookies.txt`
  - missing or empty subtitle file
- Added fallback support for exported cookie files:
  - auto-detect `youtube_cookies.txt`, `youtube.cookies.txt`, or `cookies.txt` in the project directory
  - allow explicit override via `TTV_YOUTUBE_COOKIES_FILE`
- Improved renderer fallback text for YouTube import failures in `renderer.js`
- Updated `README.md` with:
  - exported `youtube_cookies.txt` guidance
  - current regression URL: `https://www.youtube.com/watch?v=Oi-Et9Laiok`
- Verified:
  - `npm run ci` passes
  - live `stt_server.py` run now returns a combined actionable message for Chrome lock, Edge DPAPI failure, and IP block
  - invalid exported `cookies.txt` is classified correctly

## Next Steps

1. Validate the success path with a real exported Netscape-format `youtube_cookies.txt` from a browser session that can access the target subtitles.
2. Decide whether to reduce verbosity of the combined YouTube error message in the UI while keeping technical detail in logs.
3. If the exported-cookie path works, close issue `#1` with exact reproduction steps and optionally cut `v0.1.1`.
4. If it still fails, capture one concrete failing exported-cookie sample path and exact yt-dlp error for a narrower follow-up.

## Latest Diagnostic State

- No real exported `youtube_cookies.txt` was found in typical local user locations during the follow-up pass.
- Chrome is currently running and still reproduces the locked `Cookies` database path.
- Edge still reproduces the underlying raw `yt-dlp` failure:
  - `ERROR: Failed to decrypt with DPAPI`
  - upstream reference reported by `yt-dlp`: issue `10927`
- Current conclusion:
  - the app-side hardening is in place;
  - the remaining blocker is environment-level validation of a real Netscape-format exported cookie file, not an unclassified code-path failure inside TTV.

## Key Files

- `C:\Text to Speech\stt_server.py`
- `C:\Text to Speech\renderer.js`
- `C:\Text to Speech\README.md`
- `C:\Text to Speech\wiki\log.md`
- `C:\Text to Speech\wiki\synthesis\HANDOFF_2026-07-08_YOUTUBE_ISSUE_1.md`
