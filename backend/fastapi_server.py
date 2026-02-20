from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse  # ADD JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import librosa
import soundfile as sf
import numpy as np
import tempfile
import asyncio  
import os
from pydub import AudioSegment
from noisereduce import reduce_noise
import uvicorn

app = FastAPI(title="Voice Separator Pro - CPU Edition")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLEAN_FILENAME = "clean_audio.wav"
CLEAN_PATH = os.path.join(os.getcwd(), CLEAN_FILENAME)

@app.get("/health")
async def health():
    return {"status": "healthy", "mode": "CPU"}

@app.post("/api/separate")
async def separate_audio(file: UploadFile = File(...)):
    tmp_path = None
    try:
        print(f"🎵 Processing: {file.filename}")

        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
            contents = await file.read()
            tmp.write(contents)
            tmp_path = tmp.name

        # Load audio with error handling
        try:
            audio, sr = librosa.load(tmp_path, sr=22050, mono=True)
        except Exception:
            audio_segment = AudioSegment.from_file(tmp_path)
            samples = np.array(audio_segment.get_array_of_samples())
            if audio_segment.channels == 2:
                samples = samples.reshape((-1, 2)).mean(axis=1)
            audio = samples.astype(np.float32) / 32768.0
            sr = 22050

        duration = len(audio) / sr

        # Noise reduction
        try:
            noise_clip = audio[: int(sr * 0.5)]
            audio_clean = reduce_noise(audio, sr=sr, y_noise=noise_clip)
        except Exception:
            audio_clean = audio

        # Voice activity detection
        hop_length = 512
        frame_length = 2048
        energy = librosa.feature.rms(
            y=audio_clean, frame_length=frame_length, hop_length=hop_length
        )[0]
        threshold = np.mean(energy) * 2.5

        segments = []
        speech_frames = energy > threshold
        i = 0
        while i < len(speech_frames):
            if speech_frames[i]:
                start_frame = i
                while i < len(speech_frames) and speech_frames[i]:
                    i += 1
                end_frame = i
                duration_seg = (end_frame - start_frame) * hop_length / sr
                if duration_seg > 0.2:
                    segments.append(
                        {
                            "start": round(start_frame * hop_length / sr, 2),
                            "end": round(end_frame * hop_length / sr, 2),
                            "duration": round(duration_seg, 2),
                        }
                    )
            else:
                i += 1

        total_speech = sum(seg["duration"] for seg in segments)
        speech_pct = min(
            100.0, (total_speech / duration * 100) if duration > 0 else 0
        )

        # SAVE CLEAN AUDIO
        sf.write(CLEAN_PATH, audio_clean, int(sr))
        print(f"💾 SAVED CLEAN AUDIO: {CLEAN_PATH}")

        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

        print(f"✅ SUCCESS: {len(segments)} segments, {speech_pct:.1f}% speech")

        return {
            "status": "success",
            "filename": file.filename,
            "duration": float(duration),
            "speech_duration": float(total_speech),
            "speech_percentage": float(speech_pct),
            "segments": segments[:10],
            "clean_file": CLEAN_FILENAME,
        }

    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.get("/download/{filename}")
async def download_file(filename: str):
    if filename != CLEAN_FILENAME:
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.exists(CLEAN_PATH):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(CLEAN_PATH, media_type="audio/wav", filename=filename)

@app.get("/")
async def root():
    return {"message": "Voice Separator Pro - CPU Mode ✅"}


# In‑memory room registry: room_id -> {user_id: WebSocket}
rooms: Dict[str, Dict[str, WebSocket]] = {}


def _basic_spectral_denoise(chunk: np.ndarray) -> np.ndarray:
    """
    Lightweight per-chunk spectral gate to reduce background noise.
    - Works on float32 PCM in [-1, 1]
    - No external dependencies beyond NumPy
    """
    if chunk.size == 0:
        return chunk

    # Apply window to reduce edge artifacts
    window = np.hanning(chunk.size).astype(np.float32)
    windowed = chunk * window

    # FFT
    spectrum = np.fft.rfft(windowed)
    mag = np.abs(spectrum)

    # Estimate noise floor as a low percentile of magnitudes
    noise_floor = np.percentile(mag, 25)
    thresh = noise_floor * 1.5

    # Binary mask: keep only bins clearly above noise
    mask = mag > thresh
    cleaned_spectrum = spectrum * mask

    # Inverse FFT back to time domain
    cleaned = np.fft.irfft(cleaned_spectrum, n=chunk.size).astype(np.float32)

    # Soft clipping for safety
    cleaned = np.clip(cleaned, -1.0, 1.0)
    return cleaned


@app.websocket("/ws/echo/{user_id}")
async def websocket_echo(websocket: WebSocket, user_id: str):
    """
    Simple echo endpoint:
    - Receives binary audio chunks
    - Applies light denoising
    - Sends audio back to the same client
    Useful for quick real‑time tests from a single device.
    """
    await websocket.accept()
    print(f"🔌 Echo client connected: {user_id}")
    try:
        while True:
            data = await websocket.receive_bytes()
            audio = np.frombuffer(data, dtype=np.float32)
            cleaned = _basic_spectral_denoise(audio)
            await websocket.send_bytes(cleaned.tobytes())
    except WebSocketDisconnect:
        print(f"🔌 Echo client disconnected: {user_id}")


@app.websocket("/ws/{room_id}/{user_id}")
async def websocket_room(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    print(f"🔊 {user_id} joined room {room_id}")

    if room_id not in rooms:
        rooms[room_id] = {}
    rooms[room_id][user_id] = websocket

    try:
        while True:
            data = await websocket.receive_bytes()
            audio = np.frombuffer(data, dtype=np.float32)
            cleaned = _basic_spectral_denoise(audio)
            out_bytes = cleaned.tobytes()

            # Broadcast to others
            for uid, ws in list(rooms[room_id].items()):
                if uid != user_id:
                    try:
                        await ws.send_bytes(out_bytes)
                    except:
                        rooms[room_id].pop(uid, None)
    except WebSocketDisconnect:
        print(f"🔇 {user_id} left room {room_id}")
        rooms[room_id].pop(user_id, None)



if __name__ == "__main__":
    print("🚀 Starting CPU Voice Separator on PORT 8001...")
    uvicorn.run(app, host="0.0.0.0", port=8001)  # CHANGED TO 8001
