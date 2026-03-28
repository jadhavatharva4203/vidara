import whisper

print("Loading Whisper model...")
model = whisper.load_model("base")

print("Transcribing sample.mp3...")
result = model.transcribe("sample.mp3")

print("\n--- TRANSCRIPT SEGMENTS ---\n")
for segment in result["segments"]:
    print(
        {
            "start": segment["start"],
            "end": segment["end"],
            "text": segment["text"].strip(),
        }
    )