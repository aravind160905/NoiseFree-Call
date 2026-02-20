import os
import torch
import numpy as np
import librosa
import soundfile as sf
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydub import AudioSegment
from noisereduce import reduce_noise
from demucs import pretrained, apply
import tempfile
import uvicorn
from pyngrok import ngrok
import getpass

class VoiceSeparator:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🎤 Initializing Demucs v4 on {self.device}...")
        self.model = pretrained.get_model("htdemucs")
        self.model.eval()
        if torch.cuda.is_available():
            self.model.to(self.device)
        print("✅ Demucs model loaded!")

    def load_audio(self, file_path, sr=22050):
        try:
            audio, _ = librosa.load(file_path, sr=sr, mono=True)
            return audio, sr
        except Exception:
            try:
                audio_segment = AudioSegment.from_file(file_path)
                samples = np.array(audio_segment.get_array_of_samples())
                if audio_segment.channels == 2:
                    samples = samples.reshape((-1, 2)).mean(axis=1)
                audio = samples.astype(np.float32) / 32768.0
                audio = librosa.resample(
                    audio, orig_sr=audio_segment.frame_rate, target_sr=sr
                )
                return audio, sr
            except Exception as e:
                raise ValueError(f"Could not load audio: {str(e)}")

    def separate_vocals(self, file_path):
        print(f"🎵 Processing: {file_path}")
        audio, sr = self.load_audio(file_path)
        duration = len(audio) / sr

        audio = audio / (np.max(np.abs(audio)) + 1e-8)
        print("🧹 Noise reduction...")
        noise_clip = audio[: int(sr * 0.5)]
        audio_clean = reduce_noise(audio, sr=sr, y_noise=noise_clip)

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            temp_path = tmp.name
            sf.write(temp_path, audio_clean, sr)

        print("🎤 Demucs v4 separation...")
        sources = apply(
            self.model,
            temp_path,
            device=self.device,
            progress=False,
            splits=6,
        )
        vocals = sources[0, 0].cpu().numpy()
        background = np.sum(sources[0, 1:], axis=0).cpu().numpy()

        print("📍 Segmenting speech...")
        hop_length = 512
        frame_length = 2048
        energy = librosa.feature.rms(
            y=vocals,
            frame_length=frame_length,
            hop_length=hop_length,
        )[0]
        threshold = np.mean(energy) * 3.0
        speech_frames = energy > threshold
        segments = []
        i = 0
        while i < len(speech_frames):
            if speech_frames[i]:
                start_frame = i
                while i < len(speech_frames) and speech_frames[i]:
                    i += 1
                end_frame = i
                duration_seg = (end_frame - start_frame) * hop_length / sr
                if duration_seg > 0.15:
                    segments.append({
                        "start": round(start_frame * hop_length / sr, 2),
                        "end": round(end_frame * hop_length / sr, 2),
                        "duration": round(duration_seg, 2),
                        "energy": float(np.mean(energy[start_frame:end_frame])),
                    })
            else:
                i += 1
        os.unlink(temp_path)
        return vocals, background, segments, sr, duration

# FASTAPI SERVER
app = FastAPI(title="Voice Separator Pro API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

separator = None

@app.on_event("startup")
async def startup_event():
    global separator
    separator = VoiceSeparator()

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "device": "cuda" if torch.cuda.is_available() else "cpu",
    }

@app.post("/api/separate")
async def separate_audio(file: UploadFile = File(...)):
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name

        vocals, background, segments, sr, duration = separator.separate_vocals(tmp_path)

        vocals_path = f"/tmp/vocals_{file.filename}.wav"
        bg_path = f"/tmp/background_{file.filename}.wav"
        sf.write(vocals_path, vocals, sr)
        sf.write(bg_path, background, sr)

        total_speech = sum(s["duration"] for s in segments)
        speech_pct = (total_speech / duration * 100) if duration > 0 else 0

        return {
            "status": "success",
            "filename": file.filename,
            "duration": float(duration),
            "speech_duration": float(total_speech),
            "speech_percentage": float(speech_pct),
            "segments": segments,
            "files": {
                "vocals": os.path.basename(vocals_path),
                "background": os.path.basename(bg_path),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

@app.get("/api/download/{file_name}")
async def download(file_name: str):
    file_path = f"/tmp/{file_name}"
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="File not found")

if __name__ == "__main__":
    print("\n🚀 Setting up ngrok tunnel...")
    auth_token = getpass.getpass("Enter ngrok auth token: ")
    ngrok.set_auth_token(auth_token)
    public_url = ngrok.connect(8000).public_url
    print(f"🌐 PUBLIC URL: {public_url}")
    uvicorn.run(app, host="0.0.0.0", port=8000)
