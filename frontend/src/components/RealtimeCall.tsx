import React, { useState, useRef } from "react";

interface Props {
  apiUrl: string;
}

const RealtimeCall: React.FC<Props> = ({ apiUrl }) => {
  const [roomId, setRoomId] = useState("demo-room");
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("🔌 Not connected");

  const joinCall = async () => {
    if (isConnected) return;
    
    setStatus("🎤 Requesting microphone...");
    
    try {
      const userId = crypto.randomUUID();
      const wsUrl = apiUrl.replace("http", "ws") + `/ws/${roomId}/${userId}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus(`✅ Connected to room "${roomId}"`);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("❌ Disconnected");
      };

      ws.onerror = () => {
        setStatus("❌ Connection error - check backend");
      };

    } catch (err) {
      setStatus("❌ Error: " + (err as Error).message);
    }
  };

  const leaveCall = () => {
    setIsConnected(false);
    setStatus("🔌 Not connected");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "500px" }}>
      <h2>📞 Real-time Call</h2>
      
      <div style={{ 
        display: "flex", 
        gap: "10px", 
        marginBottom: "20px",
        alignItems: "center"
      }}>
        <input
          placeholder="demo-room"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          style={{ 
            flex: 1, 
            padding: "12px", 
            border: "1px solid #ddd", 
            borderRadius: "8px" 
          }}
        />
        <button
          onClick={joinCall}
          disabled={isConnected}
          style={{ 
            padding: "12px 24px", 
            borderRadius: "8px",
            border: "none",
            background: isConnected ? "#ccc" : "#007bff",
            color: "white",
            cursor: isConnected ? "not-allowed" : "pointer"
          }}
        >
          🎤 Join Call
        </button>
        <button
          onClick={leaveCall}
          disabled={!isConnected}
          style={{ 
            padding: "12px 20px", 
            borderRadius: "8px",
            border: "1px solid #666",
            background: "white",
            color: "#333"
          }}
        >
          🚪 Leave
        </button>
      </div>

      <div style={{ 
        fontSize: "1.2em", 
        padding: "16px", 
        borderRadius: "12px",
        textAlign: "center",
        border: "2px solid",
        background: isConnected ? "#d4edda" : "#f8d7da",
        borderColor: isConnected ? "#28a745" : "#dc3545"
      }}>
        <span style={{
          display: "inline-block",
          width: "12px",
          height: "12px",
          borderRadius: "50%",
          marginRight: "8px",
          background: isConnected ? "#28a745" : "#dc3545"
        }} />
        {status}
      </div>

      <p style={{ fontSize: "0.9em", color: "#666", marginTop: "16px" }}>
        Test: Open 2 browsers → same room ID → Join both → Backend must be LIVE!
      </p>
    </div>
  );
};

export default RealtimeCall;
