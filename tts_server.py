import sys
import asyncio
import edge_tts
import json

async def main():
    if len(sys.argv) < 3:
        print("ERROR: Недостаточно аргументов")
        return

    file_path = sys.argv[1]
    gender = sys.argv[2] # "male" или "female"

    # Читаем текст из временного файла
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            text_to_speak = f.read()
    except Exception as e:
        print(f"ERROR: Не удалось прочитать файл текста: {str(e)}")
        return

    if not text_to_speak.strip():
        print("ERROR: Текст пуст")
        return

    # Настройка голосов
    voice = "ru-RU-DmitryNeural" if gender == "male" else "ru-RU-SvetlanaNeural"
    
    audio_file = "temp_voice.mp3"
    timing_file = "temp_timing.json"
    
    timings = []

    try:
        communicate = edge_tts.Communicate(text_to_speak, voice)
        
        with open(audio_file, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                # ОБНОВЛЕНИЕ: Ловим маркеры слов по наличию ключей offset и text (железный способ)
                elif "offset" in chunk and "text" in chunk:
                    # Переводим тики (100 наносекунд) в секунды
                    start_sec = chunk["offset"] / 10000000
                    duration_sec = chunk.get("duration", 0) / 10000000
                    
                    timings.append({
                        "word": chunk["text"],
                        "start": start_sec,
                        "end": start_sec + duration_sec
                    })
        
        # Сохраняем карту таймингов
        with open(timing_file, "w", encoding="utf-8") as f:
            json.dump(timings, f, ensure_ascii=False, indent=2)
            
        print("SUCCESS") 
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())