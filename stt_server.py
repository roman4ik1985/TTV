import sys, os, threading, speech_recognition as sr, sounddevice as sd, soundfile as sf, numpy as np, json, glob, re, tempfile
from html import unescape
from urllib.parse import parse_qs, urlparse

stop_recording_event = threading.Event()

class YouTubeSubtitleUnavailableError(Exception):
    pass

class YouTubeSubtitleBlockedError(Exception):
    pass

class YouTubeBrowserCookieError(Exception):
    pass

class PDFImportError(ValueError):
    pass

class PDFOcrRequiredError(PDFImportError):
    pass

class PDFBrokenTextLayerError(PDFImportError):
    pass

class SilentYtdlpLogger:
    def debug(self, _message):
        pass

    def info(self, _message):
        pass

    def warning(self, _message):
        pass

    def error(self, _message):
        pass

def listen_for_electron_stop():
    try:
        sys.stdin.readline()
        stop_recording_event.set()
    except: pass

def apply_user_dictionary(text):
    dict_path = "user_dict.json"
    if os.path.exists(dict_path):
        try:
            with open(dict_path, "r", encoding="utf-8") as f:
                user_dict = json.load(f)
            for wrong, right in user_dict.items():
                if wrong.strip():
                    text = text.replace(wrong, right)
                    text = text.replace(wrong.capitalize(), right)
        except: pass
    return text

def apply_punctuation(text):
    replacements = {
        " запятая": ",", " точка": ".", " знак вопроса": "?",
        " вопросительный знак": "?", " восклицательный знак": "!",
        " двоеточие": ":", " новая строка": "\n", " абзац": "\n"
    }
    for word, symbol in replacements.items():
        text = text.replace(word, symbol)
        text = text.replace(word.capitalize(), symbol)
        text = text.replace(word.strip(), symbol)
    text = apply_user_dictionary(text)
    return text

def extract_youtube_video_id(url):
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower()

    if "youtu.be" in host:
        return parsed.path.strip("/").split("/")[0] or None

    if "youtube.com" in host:
        if parsed.path == "/watch":
            return parse_qs(parsed.query).get("v", [None])[0]
        if parsed.path.startswith("/embed/"):
            return parsed.path.split("/embed/", 1)[1].split("/")[0] or None
        if parsed.path.startswith("/shorts/"):
            return parsed.path.split("/shorts/", 1)[1].split("/")[0] or None

    return None

def is_supported_translation(transcript, target_language_code):
    return any(
        language.language_code == target_language_code
        for language in transcript.translation_languages
    )

def get_browser_cookie_candidates():
    candidates = []
    browser_paths = {
        "chrome": [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ],
        "edge": [
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        ],
    }

    for browser_name, paths in browser_paths.items():
        if any(os.path.exists(path) for path in paths):
            candidates.append(browser_name)

    return candidates

def get_preferred_youtube_subtitle_language(video_url):
    from yt_dlp import YoutubeDL

    with YoutubeDL({
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "logger": SilentYtdlpLogger(),
    }) as ydl:
        info = ydl.extract_info(video_url, download=False)

    subtitles = info.get("subtitles") or {}
    automatic_captions = info.get("automatic_captions") or {}
    available_languages = sorted(set(subtitles).union(automatic_captions))

    for language_code in ("ru", "en"):
        if language_code in subtitles or language_code in automatic_captions:
            return language_code, available_languages

    return None, available_languages

def normalize_browser_cookie_error(browser_name, message):
    browser_title = "Chrome" if browser_name == "chrome" else "Edge"
    lowered_message = (message or "").lower()

    if "could not copy chrome cookie database" in lowered_message:
        return f"Не удалось использовать cookies из {browser_title}: файл Cookies заблокирован открытым браузером. Закройте {browser_title} и повторите импорт."

    if "failed to decrypt with dpapi" in lowered_message:
        return f"Не удалось расшифровать cookies из {browser_title}: браузер использует защищённое хранилище Windows."

    if "http error 429" in lowered_message:
        return f"YouTube отклонил загрузку субтитров даже с cookies из {browser_title} (HTTP 429)."

    return f"Импорт YouTube через {browser_title} завершился ошибкой: {message}"

def get_youtube_retry_guidance():
    return "Подождите 5-10 минут и повторите импорт или попробуйте другую сеть/VPN."

def parse_vtt_text(vtt_text):
    cleaned_lines = []

    for raw_line in vtt_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line == "WEBVTT" or line.startswith("Kind:") or line.startswith("Language:") or line.startswith("NOTE"):
            continue
        if "-->" in line:
            continue
        if re.fullmatch(r"\d+", line):
            continue

        line = re.sub(r"<[^>]+>", "", line)
        line = unescape(line).strip()
        if not line:
            continue
        if cleaned_lines and cleaned_lines[-1] == line:
            continue

        cleaned_lines.append(line)

    return " ".join(cleaned_lines).strip()

def fetch_youtube_text_with_browser_cookies(video_url, browser_name, subtitle_language_code):
    from yt_dlp import YoutubeDL
    from yt_dlp.utils import DownloadError

    with tempfile.TemporaryDirectory(prefix="smartreader-ytdlp-") as temp_dir:
        output_template = os.path.join(temp_dir, "%(id)s.%(ext)s")
        options = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": [subtitle_language_code],
            "subtitlesformat": "vtt",
            "outtmpl": output_template,
            "cookiesfrombrowser": (browser_name, None, None, None),
            "logger": SilentYtdlpLogger(),
        }

        try:
            with YoutubeDL(options) as ydl:
                ydl.download([video_url])
        except DownloadError as exc:
            raise YouTubeBrowserCookieError(normalize_browser_cookie_error(browser_name, str(exc))) from exc

        subtitle_paths = sorted(glob.glob(os.path.join(temp_dir, f"*.{subtitle_language_code}.vtt")))
        if not subtitle_paths:
            subtitle_paths = sorted(glob.glob(os.path.join(temp_dir, "*.vtt")))

        if not subtitle_paths:
            raise YouTubeBrowserCookieError(
                f"Импорт YouTube через {browser_name} не сохранил файл субтитров."
            )

        with open(subtitle_paths[0], "r", encoding="utf-8") as subtitle_file:
            subtitle_text = parse_vtt_text(subtitle_file.read())

        if not subtitle_text:
            raise YouTubeBrowserCookieError(
                f"Импорт YouTube через {browser_name} вернул пустые субтитры."
            )

        return subtitle_text

def extract_youtube_text(video_url, video_id):
    browser_cookie_errors = []
    available_languages = []

    try:
        preferred_language_code, available_languages = get_preferred_youtube_subtitle_language(video_url)
    except ImportError:
        preferred_language_code = None
    except Exception:
        preferred_language_code = None

    if preferred_language_code:
        for browser_name in get_browser_cookie_candidates():
            try:
                return fetch_youtube_text_with_browser_cookies(video_url, browser_name, preferred_language_code)
            except YouTubeBrowserCookieError as exc:
                if str(exc) not in browser_cookie_errors:
                    browser_cookie_errors.append(str(exc))

    elif available_languages:
        formatted_languages = ", ".join(available_languages)
        raise YouTubeSubtitleUnavailableError(
            f"У видео отсутствуют текстовые субтитры или перевод в ru/en. Доступные языки: {formatted_languages}."
        )

    try:
        return fetch_youtube_transcript_text(video_id)
    except YouTubeSubtitleUnavailableError:
        raise
    except YouTubeSubtitleBlockedError as exc:
        if browser_cookie_errors:
            details = " ".join(browser_cookie_errors)
            raise YouTubeSubtitleBlockedError(
                f"Не удалось получить субтитры YouTube через browser cookies. {details} {str(exc)}"
            ) from exc
        raise

def choose_youtube_transcript(transcript_list):
    from youtube_transcript_api._errors import NoTranscriptFound

    try:
        return transcript_list.find_transcript(["ru", "en"])
    except NoTranscriptFound:
        for target_language_code in ("ru", "en"):
            for transcript in transcript_list:
                if is_supported_translation(transcript, target_language_code):
                    return transcript.translate(target_language_code)

    raise YouTubeSubtitleUnavailableError("У видео отсутствуют текстовые субтитры или перевод в ru/en.")

def fetch_youtube_transcript_text(video_id):
    from youtube_transcript_api import YouTubeTranscriptApi
    from youtube_transcript_api._errors import IpBlocked, PoTokenRequired, RequestBlocked, TranscriptsDisabled

    api = YouTubeTranscriptApi()
    transcript_list = api.list(video_id)
    transcript = choose_youtube_transcript(transcript_list)

    try:
        fetched = transcript.fetch()
        return " ".join(snippet.text for snippet in fetched)
    except (IpBlocked, RequestBlocked, PoTokenRequired) as exc:
        available_languages = ", ".join(sorted({item.language_code for item in transcript_list}))
        raise YouTubeSubtitleBlockedError(
            f"YouTube блокирует чтение субтитров с текущего IP. Доступные дорожки: {available_languages}. {get_youtube_retry_guidance()}"
        ) from exc
    except TranscriptsDisabled as exc:
        raise YouTubeSubtitleUnavailableError("У видео отключены субтитры.") from exc

def looks_like_broken_pdf_text(text):
    visible_text = "".join(ch for ch in text if not ch.isspace())
    if not visible_text:
        return False

    suspicious_chars = {"■", "\uFFFD"}
    suspicious_count = sum(1 for ch in visible_text if ch in suspicious_chars)
    readable_count = sum(1 for ch in visible_text if ch.isalnum())

    suspicious_ratio = suspicious_count / len(visible_text)
    readable_ratio = readable_count / len(visible_text)

    return suspicious_count >= 8 and suspicious_ratio >= 0.2 and readable_ratio < 0.6

def validate_pdf_extracted_text(extracted_text):
    cleaned_text = (extracted_text or "").strip()

    if not cleaned_text:
        raise PDFOcrRequiredError(
            "PDF не содержит извлекаемого текстового слоя. Похоже, это скан или изображение; нужен OCR или текстовый PDF."
        )

    if looks_like_broken_pdf_text(cleaned_text):
        raise PDFBrokenTextLayerError(
            "PDF содержит поврежденный текстовый слой: символы извлекаются некорректно. Нужен другой PDF или OCR."
        )

    return cleaned_text

def extract_pdf_text(file_path):
    import pypdf

    reader = pypdf.PdfReader(file_path)
    extracted_pages = []

    for page in reader.pages:
        page_text = page.extract_text() or ""

        if not page_text.strip():
            try:
                page_text = page.extract_text(extraction_mode="layout") or ""
            except Exception:
                pass

        if page_text:
            extracted_pages.append(page_text)

    return validate_pdf_extracted_text("\n".join(extracted_pages))

def transcribe_chunk(audio_data, samplerate, recognizer):
    try:
        raw_bytes = audio_data.tobytes()
        audio = sr.AudioData(raw_bytes, samplerate, 2)
        text = recognizer.recognize_google(audio, language="ru-RU")
        if text.strip():
            formatted_text = apply_punctuation(text)
            print(f"PARTIAL:{formatted_text}", flush=True)
    except: pass

def main():
    recognizer = sr.Recognizer()

    # СИСТЕМНЫЙ КОНВЕЙЕР ФАЙЛОВ И ССЫЛОК YOUTUBE
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        
        # ВЕТКА YOUTUBE: ПАРСИНГ И РАСШИФРОВКА СУБТИТРОВ ПРЯМО С СЕРВЕРОВ
        if "youtube.com" in file_path.lower() or "youtu.be" in file_path.lower():
            try:
                # Извлекаем Video ID из любых вариантов ссылок
                video_id = extract_youtube_video_id(file_path)

                if not video_id:
                    print("ERROR:Не удалось извлечь ID видео из ссылки YouTube.", flush=True)
                    return

                # Сначала пробуем извлечь субтитры через yt-dlp и browser cookies.
                try:
                    extracted_text = extract_youtube_text(file_path, video_id)
                except YouTubeSubtitleUnavailableError as sub_err:
                    print(f"ERROR:{str(sub_err)}", flush=True)
                    return
                except YouTubeSubtitleBlockedError as sub_err:
                    print(f"ERROR:{str(sub_err)}", flush=True)
                    return

                final_text = apply_user_dictionary(extracted_text)
                print(f"FILE_SUCCESS:{final_text}", flush=True)

            except ImportError:
                print("ERROR:Не установлена библиотека YouTube. Выполните: pip install youtube-transcript-api", flush=True)
            except Exception as e:
                print(f"ERROR:Ошибка при чтении YouTube: {str(e)}", flush=True)
            return

        # ВЕТКА Б: ЕСЛИ ЗАГРУЖЕН ТЕКСТОВЫЙ ДОКУМЕНТ WORD (.DOCX)
        if file_path.lower().endswith('.docx'):
            try:
                import docx
                doc = docx.Document(file_path)
                extracted_text = "\n".join([p.text for p in doc.paragraphs])
                final_text = apply_user_dictionary(extracted_text)
                print(f"FILE_SUCCESS:{final_text}", flush=True)
            except ImportError:
                print("ERROR:Не установлена библиотека Word. Выполните: pip install python-docx", flush=True)
            except Exception as e:
                print(f"ERROR:Не удалось прочитать Word: {str(e)}", flush=True)
            return

        # ВЕТКА Б: ЕСЛИ ЗАГРУЖЕНА ЭЛЕКТРОННАЯ КНИГА (.EPUB)
        if file_path.lower().endswith('.epub'):
            try:
                import ebooklib
                from ebooklib import epub
                from bs4 import BeautifulSoup
                
                book = epub.read_epub(file_path)
                extracted_text = ""
                
                # Парсим XHTML-страницы внутри книги и очищаем их от тегов верстки
                for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
                    soup = BeautifulSoup(item.get_content(), 'html.parser')
                    page_text = soup.get_text()
                    if page_text:
                        extracted_text += page_text + "\n"
                        
                final_text = apply_user_dictionary(extracted_text)
                print(f"FILE_SUCCESS:{final_text}", flush=True)
            except ImportError:
                print("ERROR:Не установлены библиотеки книг. Выполните: pip install ebooklib beautifulsoup4", flush=True)
            except Exception as e:
                print(f"ERROR:Не удалось прочитать EPUB: {str(e)}", flush=True)
            return

        # ВЕТКА АУДИОФАЙЛОВ (WAV, MP3, FLAC)
        if file_path.lower().endswith('.pdf'):
            try:
                extracted_text = extract_pdf_text(file_path)
                final_text = apply_user_dictionary(extracted_text)
                print(f"FILE_SUCCESS:{final_text}", flush=True)
            except Exception as e:
                print(f"ERROR:Не удалось извлечь PDF: {str(e)}", flush=True)
            return

        try:
            data, samplerate = sf.read(file_path, dtype='int16')
            if len(data.shape) > 1: data = data[:, 0]
            raw_bytes = data.tobytes()
            audio = sr.AudioData(raw_bytes, samplerate, 2)
            text = recognizer.recognize_google(audio, language="ru-RU")
            formatted_text = apply_punctuation(text)
            print(f"FILE_SUCCESS:{formatted_text}", flush=True)
        except Exception as e:
            print(f"ERROR:Не удалось распознать аудиофайл: {str(e)}", flush=True)
        return

    # РЕЖИМ МИКРОФОНА (ДИКТОВКА LIVE)
    samplerate = 16000  
    block_duration = 0.1  
    block_samples = int(samplerate * block_duration)
    
    threading.Thread(target=listen_for_electron_stop, daemon=True).start()
    print("READY_TO_LISTEN", flush=True)
    
    phrase_chunks = []
    silence_blocks = 0
    speech_detected = False
    
    SILENCE_THRESHOLD = 450 
    SILENCE_DURATION_BLOCKS = 8 
    
    try:
        with sd.InputStream(samplerate=samplerate, channels=1, dtype='int16') as stream:
            while not stop_recording_event.is_set():
                chunk, _ = stream.read(block_samples)
                phrase_chunks.append(chunk)
                volume = np.abs(chunk).mean()
                
                if volume > SILENCE_THRESHOLD:
                    speech_detected = True
                    silence_blocks = 0
                else:
                    if speech_detected: silence_blocks += 1
                
                if speech_detected and (silence_blocks >= SILENCE_DURATION_BLOCKS or len(phrase_chunks) >= 80):
                    audio_data = np.concatenate(phrase_chunks, axis=0)
                    phrase_chunks = []
                    silence_blocks = 0
                    speech_detected = False
                    threading.Thread(target=transcribe_chunk, args=(audio_data, samplerate, recognizer), daemon=True).start()
            
            if phrase_chunks and speech_detected:
                audio_data = np.concatenate(phrase_chunks, axis=0)
                transcribe_chunk(audio_data, samplerate, recognizer)
            print("PROCESSING_FINISHED", flush=True)
    except Exception as e:
        print(f"ERROR:Ошибка микрофона: {str(e)}", flush=True)

if __name__ == "__main__":
    main()
