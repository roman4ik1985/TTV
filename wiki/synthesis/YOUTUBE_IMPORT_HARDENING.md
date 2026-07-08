# YouTube Import Hardening

## Current Fallback Order

1. `yt-dlp` with local Chromium browser cookies
2. `yt-dlp` with exported Netscape-format `youtube_cookies.txt`
3. `youtube-transcript-api`
4. Manual `.vtt` / `.srt` / `.txt` or pasted transcript fallback

## Exported Cookies

- Preferred filename next to the app: `youtube_cookies.txt`
- Alternate path: set `TTV_YOUTUBE_COOKIES_FILE`
- Expected format: Netscape `cookies.txt`

## Classified Failure Classes

- browser cookie DB locked
- browser cookie decryption failed on Windows
- HTTP 429 even with cookies
- exported cookie file invalid format
- exported cookie subtitle file missing or empty
- transcript API IP-blocked
- subtitles unavailable in `ru` / `en`

## Regression Reference URL

- Reference diagnostics URL with visible `ru` / `en` subtitle tracks:
  `https://www.youtube.com/watch?v=Oi-Et9Laiok`

This URL is useful for manual checks, but it is not used in CI because live YouTube behavior and IP reputation are unstable.

## Validation Boundary

The repo now has deterministic smoke coverage for app-side classification and exported-cookie fallback routing.

What is still external:

- a real exported Netscape cookie file that can access the target subtitles
- live verification that the exported-cookie success path still works against current YouTube anti-bot behavior
