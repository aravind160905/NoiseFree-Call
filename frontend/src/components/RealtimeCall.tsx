import React, { useState, useRef } from "react";

interface Props {
  apiUrl: string;
}

const RealtimeCall: React.FC<Props> = ({ apiUrl }) => {
  const [roomId, setRoomId] = useState("demo-room");
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("🔌 Not connected");
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const inputNodeRef = useRef<ScriptProcessorNode | null>(null);

  const joinCall = async () => {
    if (isConnected) return;

    try {
      setStatus("🎤 Requesting microphone...");
      const userId = crypto.randomUUID();
      const wsUrl = apiUrl.replace("http", "ws") + `/ws/${roomId}/${userId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      inputNodeRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        ws.send(copy.buffer);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus(`✅ Connected to room "${roomId}"`);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("❌ Disconnected");
      };

      ws.onerror = () => {
        setStatus("❌ Connection error - check backend WebSocket");
      };

      ws.onmessage = async (event) => {
        const arrayBuf = await event.data.arrayBuffer();
        const floatData = new Float32Array(arrayBuf);
        const buffer = audioCtx.createBuffer(
          1,
          floatData.length,
          audioCtx.sampleRate
        );
        buffer.copyToChannel(floatData, 0);
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.connect(audioCtx.destination);
        src.start();
      };
    } catch (err) {
      setStatus(`❌ Mic error: ${(err as Error).message}`);
    }
  };

  const leaveCall = () => {
    wsRef.current?.close();
    inputNodeRef.current?.disconnect();
    audioCtxRef.current?.close();
    setIsConnected(false);
    setStatus("🔌 Not connected");
  };

  return (
    <div className="realtime-call">
      <h2>📞 Real-time Background Voice Call</h2>
      <p style={{ marginBottom: 15 }}>
        <strong>How to test:</strong> Open 2 browsers/devices → same room ID →
        Join both → Talk!
      </p>

      <div className="input-group" style={{ marginBottom: 15 }}>
        <input
          className="input"
          placeholder="demo-room"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          style={{ flex: 1 }}
        />
        <button
          className="btn-primary"
          onClick={joinCall}
          disabled={isConnected}
          style={{ marginLeft: 10 }}
        >
          🎤 Join Call
        </button>
        <button
          className="btn-secondary"
          onClick={leaveCall}
          disabled={!isConnected}
          style={{ marginLeft: 10 }}
        >
          🚪 Leave
        </button>
      </div>

      <div
        className={`status-indicator ${
          isConnected ? "connected" : "disconnected"
        }`}
        style={{ fontSize: "1.1em", padding: "12px" }}
      >
        <span className="status-dot" />
        {status}
      </div>

      <p
        style={{
          fontSize: "0.9em",
          color: "#64748b",
          marginTop: 10,
        }}
      >
        Status shows mic + WebSocket connection. Needs backend
        {` \`/ws/{room}/{user}\` `}
        endpoint.
      </p>
    </div>
  );
};

export default RealtimeCall;
