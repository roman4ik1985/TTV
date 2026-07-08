from pathlib import Path
from tempfile import TemporaryDirectory
import os
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import stt_server  # noqa: E402


def assert_equal(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_in(needle, haystack, label):
    if needle not in haystack:
        raise AssertionError(f"{label}: expected {needle!r} in {haystack!r}")


def main():
    category, message = stt_server.classify_browser_cookie_error("chrome", "Failed to decrypt with DPAPI")
    assert_equal(category, "browser_cookie_decrypt_failed", "dpapi category")
    assert_in("youtube_cookies.txt", message, "dpapi guidance")

    category, message = stt_server.classify_browser_cookie_error("chrome", "HTTP Error 429: Too Many Requests")
    assert_equal(category, "browser_cookie_http_429", "429 category")
    assert_in("5-10 минут", message, "429 retry guidance")

    category, message = stt_server.classify_cookie_file_error(
        r"C:\temp\youtube_cookies.txt",
        "does not look like a Netscape format cookies file",
    )
    assert_equal(category, "exported_cookie_invalid_format", "invalid cookie file category")
    assert_in("Netscape", message, "invalid cookie file message")

    blocked_message = stt_server.build_youtube_blocked_message(
        ["Не удалось использовать cookies из Chrome: файл Cookies заблокирован открытым браузером."],
        "YouTube блокирует чтение субтитров с текущего IP.",
    )
    assert_in("Автоимпорт субтитров из YouTube сейчас недоступен.", blocked_message, "blocked summary")
    assert_in("вставьте текст субтитров вручную", blocked_message, "manual fallback guidance")

    with TemporaryDirectory(prefix="smartreader-youtube-smoke-") as temp_dir:
        temp_path = Path(temp_dir)
        cookie_path = temp_path / "youtube_cookies.txt"
        cookie_path.write_text("# Netscape HTTP Cookie File\n", encoding="utf-8")

        previous_cwd = os.getcwd()
        previous_env = os.environ.get("TTV_YOUTUBE_COOKIES_FILE")
        os.chdir(temp_dir)
        os.environ["TTV_YOUTUBE_COOKIES_FILE"] = str(cookie_path)

        try:
            candidates = stt_server.get_exported_cookie_file_candidates()
            assert_equal(candidates, [str(cookie_path)], "cookie candidate discovery")
        finally:
            os.chdir(previous_cwd)
            if previous_env is None:
                os.environ.pop("TTV_YOUTUBE_COOKIES_FILE", None)
            else:
                os.environ["TTV_YOUTUBE_COOKIES_FILE"] = previous_env

    original_functions = {
        "get_preferred_youtube_subtitle_language": stt_server.get_preferred_youtube_subtitle_language,
        "get_browser_cookie_candidates": stt_server.get_browser_cookie_candidates,
        "fetch_youtube_text_with_browser_cookies": stt_server.fetch_youtube_text_with_browser_cookies,
        "get_exported_cookie_file_candidates": stt_server.get_exported_cookie_file_candidates,
        "fetch_youtube_text_with_cookie_file": stt_server.fetch_youtube_text_with_cookie_file,
        "fetch_youtube_transcript_text": stt_server.fetch_youtube_transcript_text,
    }

    try:
        stt_server.get_preferred_youtube_subtitle_language = lambda _url: ("ru", ["ru", "en"])
        stt_server.get_browser_cookie_candidates = lambda: ["chrome"]

        def fake_browser_fetch(_url, _browser, _lang):
            raise stt_server.YouTubeBrowserCookieError(
                "Не удалось расшифровать cookies из Chrome: браузер использует защищённое хранилище Windows. "
                + stt_server.get_exported_cookie_guidance(),
                category="browser_cookie_decrypt_failed",
            )

        stt_server.fetch_youtube_text_with_browser_cookies = fake_browser_fetch
        stt_server.get_exported_cookie_file_candidates = lambda: [r"C:\temp\youtube_cookies.txt"]
        stt_server.fetch_youtube_text_with_cookie_file = lambda _url, cookie_file_path, _lang: (
            f"cookie success via {os.path.basename(cookie_file_path)}"
        )
        result = stt_server.extract_youtube_text("https://www.youtube.com/watch?v=test", "test")
        assert_equal(result, "cookie success via youtube_cookies.txt", "exported cookie fallback result")

        stt_server.fetch_youtube_text_with_cookie_file = lambda _url, _cookie_file_path, _lang: (_ for _ in ()).throw(
            stt_server.YouTubeBrowserCookieError(
                "Файл youtube_cookies.txt не похож на Netscape cookies.txt.",
                category="exported_cookie_invalid_format",
            )
        )
        stt_server.fetch_youtube_transcript_text = lambda _video_id: (_ for _ in ()).throw(
            stt_server.YouTubeSubtitleBlockedError("YouTube блокирует чтение субтитров с текущего IP.")
        )

        try:
            stt_server.extract_youtube_text("https://www.youtube.com/watch?v=test", "test")
        except stt_server.YouTubeSubtitleBlockedError as exc:
            blocked = str(exc)
        else:
            raise AssertionError("expected blocked error when all YouTube fallback paths fail")

        assert_in("youtube_cookies.txt", blocked, "blocked message includes exported cookie detail")
        assert_in("вставьте текст субтитров вручную", blocked, "blocked message includes manual fallback")
    finally:
        for name, value in original_functions.items():
            setattr(stt_server, name, value)

    print("youtube import smoke ok")


if __name__ == "__main__":
    main()
