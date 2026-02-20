import React from 'react';

interface StatusIndicatorProps {
  isConnected: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ isConnected }) => {
  return (
    <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
      <span className="status-dot"></span>
      {isConnected ? '✅ Connected' : '❌ Not Connected'}
    </div>
  );
};

export default StatusIndicator;
