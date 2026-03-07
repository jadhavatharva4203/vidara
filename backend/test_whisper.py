import whisper

print("Loading model...")
model = whisper.load_model("base")

print("Transcribing...")
result = model.transcribe("sample.mp3")

print("\n--- TRANSCRIPT ---\n")
for segment in result["segments"]:
    print(segment)