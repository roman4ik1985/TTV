import asyncio
import edge_tts

# Текст, который мы хотим услышать
TEXT = "Привет, Роман! Это тест бесплатного нейросетевого голоса от Майкрософт. Как тебе мое звучание?"

# Выбираем отличный мужской голос (Дмитрий)
VOICE = "ru-RU-DmitryNeural"

# Название файла, который появится на компьютере
OUTPUT_FILE = "test_audio.mp3"

async def main():
    print(f"Начинаю озвучку текста...")
    communicate = edge_tts.Communicate(TEXT, VOICE)
    await communicate.save(OUTPUT_FILE)
    print(f"Готово! Файл сохранен как {OUTPUT_FILE}.")

if __name__ == "__main__":
    asyncio.run(main())