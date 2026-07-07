# Import UX Regression Checklist

Use this checklist after changes to SmartReader import flows.

## Clipboard

- Copy normal Russian text and press `Ctrl+Shift+T`.
- Expected: text appears in read mode, counters update, playback starts.

## Text Files

- Import `.txt` or `.md`.
- Import `.vtt` or `.srt` with timestamps.
- Expected: plain text is loaded; subtitle timestamps, cue numbers, and tags are removed.

## Document Files

- Import a readable `.pdf`.
- Import `.docx`.
- Import `.epub`.
- Expected: the app shows a format-specific import state, then loads text or gives a format-specific error.

## YouTube

- Submit an empty YouTube field.
- Submit a non-YouTube URL.
- Submit a YouTube URL that is blocked or has unavailable subtitles.
- Expected: validation is explicit; blocked automatic import points to pasted transcript or `.vtt` / `.srt` / `.txt` fallback.

## Manual Transcript

- Paste normal transcript text.
- Paste `.vtt` or `.srt` content.
- Paste only timestamps/cue markers.
- Expected: real transcript text loads; empty cleaned subtitles produce an explicit error.

## Audio And Export

- Import a supported audio file: `.mp3`, `.wav`, `.ogg`, or `.flac`.
- Start and stop microphone dictation.
- Export loaded text to `.txt`.
- Expected: success/failure states are explicit and counters remain accurate.
