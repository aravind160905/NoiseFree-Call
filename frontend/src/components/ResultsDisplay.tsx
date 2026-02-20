import React from 'react';

interface Segment {
  start: number;
  end: number;
  duration: number;
  energy: number;
}

interface ResultsDisplayProps {
  result: {
    filename: string;
    duration: number;
    speech_duration: number;
    speech_percentage: number;
    segments: Segment[];
  };
  apiUrl: string;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result, apiUrl }) => {
  const downloadFile = (fileType: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `${apiUrl}/api/download/${fileType}`;
    link.download = filename;
    link.click();
  };

  return (
    <div className="results-container">
      <h2>✅ Processing Complete!</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{result.duration.toFixed(1)}s</div>
          <div className="stat-label">Total Duration</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{result.speech_duration.toFixed(1)}s</div>
          <div className="stat-label">Clean Speech</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{result.speech_percentage.toFixed(1)}%</div>
          <div className="stat-label">Speech %</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{result.segments.length}</div>
          <div className="stat-label">Segments</div>
        </div>
      </div>

      <div className="downloads">
        <h3>📥 Download Files</h3>
        <button 
          className="btn-primary"
          onClick={() => downloadFile('vocals', `vocals_${result.filename}`)}
        >
          🎤 Download Clean Voice
        </button>
        <button 
          className="btn-primary"
          onClick={() => downloadFile('background', `bg_${result.filename}`)}
        >
          🎵 Download Background
        </button>
      </div>

      <div className="segments-table">
        <h3>📊 Speech Segments</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Energy</th>
            </tr>
          </thead>
          <tbody>
            {result.segments.slice(0, 10).map((seg, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{seg.start.toFixed(2)}s</td>
                <td>{seg.end.toFixed(2)}s</td>
                <td>{seg.duration.toFixed(2)}s</td>
                <td>{seg.energy.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.segments.length > 10 && (
          <p>... and {result.segments.length - 10} more segments</p>
        )}
      </div>
    </div>
  );
};

export default ResultsDisplay;
