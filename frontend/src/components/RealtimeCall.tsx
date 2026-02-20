import React, { useState, useRef, useCallback } from "react";

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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (inputNodeRef.current) {
      inputNodeRef.current.disconnect();
      inputNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
    setStatus("🔌 Not connected");
  }, []);

  const joinCall = async () => {
    if (isConnected) return;

    cleanup(); // Clean up any existing connections

    try {
      setStatus("🎤 Requesting microphone...");
      const userId = crypto.randomUUID();
      const wsUrl = apiUrl.replace(/^http/, "ws") + `/ws/${roomId}/${userId}`;
      
      console.log("Connecting to:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // Wait for WebSocket to be ready before mic
      ws.onopen = () => {
        setStatus("✅ WebSocket ready, starting mic...");
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setStatus("❌ Backend not ready - retrying in 3s...");
        reconnectTimeoutRef.current = setTimeout(() => {
          setStatus("🔄 Auto-retrying...");
          joinCall();
        }, 3000);
      };

      // AudioContext after WebSocket connects
      ws.onmessage = (event) => {
        if (!audioCtxRef.current) return;
        
        // Play received audio
        event.data.arrayBuffer().then((arrayBuf) => {
          const floatData = new Float32Array(arrayBuf);
          const buffer = audioCtxRef.current!.createBuffer(
            1, 
            floatData.length, 
            audioCtxRef.current!.sampleRate
          );
          buffer.copyToChannel(floatData, 0);
          
          const src = audioCtxRef.current!.createBufferSource();
          src.buffer = buffer;
          src.connect(audioCtxRef.current!.destination);
          src.start();
        }).catch(console.error);
      };

      // Start mic AFTER WebSocket is open
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      mediaStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      inputNodeRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        wsRef.current.send(copy.buffer);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setIsConnected(true);
      setStatus(`✅ Connected to room "${roomId}"`);
      
    } catch (err) {
      console.error("Mic error:", err);
      setStatus(`❌ Mic error: ${(err as Error).message}`);
    }
  };

  const leaveCall = () => {
    cleanup();
  };

  return (
    <div className="realtime-call" style={{ padding: "20px", maxWidth: "500px" }}>
      <h2>📞 Real-time Background Voice Call</h2>
      <p style={{ marginBottom: 15, fontSize: "0.95em" }}>
        <strong>How to test:</strong> Open 2 browsers/devices → same room ID → Join both → Talk!
      </p>

      <div style={{ 
        display: "flex", 
        gap: "10px", 
        marginBottom: "20px",
        alignItems: "center"
      }}>
        <input
          className="input"
          placeholder="demo-room"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          style={{ 
            flex: 1, 
            padding: "12px", 
            border: "1px solid #ddd", 
            borderRadius: "8px",
            fontSize: "16px"
          }}
        />
        <button
          className="btn-primary"
          onClick={joinCall}
          disabled={isConnected}
          style={{ 
            padding: "12px 24px", 
            borderRadius: "8px",
            border: "none",
            background: isConnected ? "#94a3b8" : "#3b82f6",
            color: "white",
            fontWeight: "bold",
            cursor: isConnected ? "not-allowed" : "pointer"
          }}
        >
          🎤 Join Call
        </button>
        <button
          className="btn-secondary"
          onClick={leaveCall}
          disabled={!isConnected}
          style={{ 
            padding: "12px 24px", 
            borderRadius: "8px",
            border: "1px solid #64748b",
            background: !isConnected ? "#f1f5f9" : "white",
            color: !isConnected ? "#94a3b8" : "#1e293b",
            cursor: !isConnected ? "not-allowed" : "pointer"
          }}
        >
          🚪 Leave
        </button>
      </div>

      <div
        className={`status-indicator ${isConnected ? "connected" : "disconnected"}`}
        style={{ 
          fontSize: "1.2em", 
          padding: "16px", 
          borderRadius: "12px",
          textAlign: "center",
          fontWeight: "500",
          border: "2px solid",
          background: isConnected ? "#dcfce7" : "#fef2f2",
          borderColor: isConnected ? "#22c55e" : "#ef4444",
          color: isConnected ? "#166534" : "#991b1b"
        }}
      >
        <span 
          className="status-dot" 
          style={{
            display: "inline-block",
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            marginRight: "8px",
            background: isConnected ? "#22c55e" : "#ef4444"
          }}
        />
        {status}
      </div>

      <p
        style={{
          fontSize: "0.9em",
          color: "#64748b",
          marginTop: "16px",
          lineHeight: "1.5"
        }}
      >
        🔧 Status shows mic + WebSocket connection. Needs backend <code>/ws/{room}/{user}</code> endpoint.
        <br/>
        💡 <strong>Backend must be 🟢 LIVE</strong> before "Join Call" works!
      </p>
    </div>
  );
};

export default RealtimeCall;
