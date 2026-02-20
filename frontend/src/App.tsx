import React, { useState, ChangeEvent } from 'react';
import './App.css';
import RealtimeCall from './components/RealtimeCall';

interface Segment {
  start: number;
  end: number;
  duration: number;
  energy?: number;
}

interface ProcessResult {
  status: string;
  filename: string;
  duration: number;
  speech_duration: number;
  speech_percentage: number;
  segments: Segment[];
  clean_file?: string;
  files?: {
    vocals?: string;
    background?: string;
  };
}

const App: React.FC = () => {
  const [apiUrl, setApiUrl] = useState(
    localStorage.getItem('apiUrl') || 'http://localhost:8000'
  );
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleApiUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setApiUrl(newUrl);
    localStorage.setItem('apiUrl', newUrl);
  };

  const testConnection = async () => {
    try {
      const res = await fetch(`${apiUrl}/health`);
      if (!res.ok) throw new Error('Health check failed');
      const data = await res.json();
      if (data.status === 'healthy') {
        setIsConnected(true);
        setError(null);
      } else {
        setIsConnected(false);
        setError('API health not healthy');
      }
    } catch (err) {
      setIsConnected(false);
      setError('Failed to connect to API');
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setFile(e.target.files[0]);
    setResult(null);
    setError(null);
  };

  const handleAudioUpload = async () => {
    if (!isConnected) {
      setError('Not connected to API. Test connection first.');
      return;
    }
    if (!file) {
      setError('Please select an audio file.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiUrl}/api/separate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Processing failed: ${response.status} ${txt}`);
      }

      const data: ProcessResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unknown error during processing'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePlayClean = () => {
    if (!result) return;

    let url: string | null = null;

    // CPU backend: clean_file
    if (result.clean_file) {
      url = `${apiUrl}/download/${result.clean_file}`;
    } else if (result.files?.vocals) {
      // Colab Demucs backend: files.vocals
      url = `${apiUrl}/api/download/${result.files.vocals}`;
    }

    if (!url) {
      alert('No clean audio file available from server.');
      return;
    }

    // Create audio element and play it (doesn't download)
    const audio = new Audio(url);
    audio.play().catch((err) => {
      console.error('Playback failed:', err);
      alert('Failed to play audio. Try downloading instead.');
    });
  };

  const handleDownloadClean = () => {
    if (!result) return;

    let url: string | null = null;

    // CPU backend: clean_file
    if (result.clean_file) {
      url = `${apiUrl}/download/${result.clean_file}`;
    } else if (result.files?.vocals) {
      // Colab Demucs backend: files.vocals
      url = `${apiUrl}/api/download/${result.files.vocals}`;
    }

    if (!url) {
      alert('No clean audio file available from server.');
      return;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download =
      result.clean_file || result.files?.vocals || 'clean_audio.wav';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const f = (n: number | undefined) =>
    typeof n === 'number' ? n.toFixed(1) : '0.0';

  return (
    <div className="app">
      <header className="header">
        <h1>🎵 Voice Separator Pro</h1>
        <p>Clean voice from background noise using FastAPI backend</p>
      </header>

      <main className="container">
        <section className="config-panel">
          <h2>API Configuration</h2>
          <div className="input-group">
            <input
              className="input"
              value={apiUrl}
              onChange={handleApiUrlChange}
              placeholder="http://localhost:8000 or your Colab URL"
            />
            <button className="btn-secondary" onClick={testConnection}>
              Test Connection
            </button>
          </div>
          <div
            className={
              'status-indicator ' +
              (isConnected ? 'connected' : 'disconnected')
            }
          >
            <span className="status-dot" />
            {isConnected ? 'Connected' : 'Not Connected'}
          </div>
        </section>

        {/* Real‑time two‑way background voice remover (moved up for visibility) */}
        <section className="results-container" style={{ marginBottom: 30 }}>
          <RealtimeCall apiUrl={apiUrl} />
        </section>

        <section className="upload-container">
          <div className="upload-box">
            <div className="upload-icon">⬆️</div>
            <h3>Click to select audio</h3>
            <p>MP3 • WAV • M4A</p>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              style={{ marginTop: '10px' }}
            />
            {file && <p style={{ marginTop: '8px' }}>Selected: {file.name}</p>}
          </div>

          <button
            className="btn-primary"
            onClick={handleAudioUpload}
            disabled={loading || !file}
            style={{ marginTop: '15px' }}
          >
            {loading ? 'Processing...' : '🚀 CLEAN VOICE'}
          </button>
        </section>

        {loading && (
          <div className="loading-box">
            <div className="spinner" />
            <p>Processing audio, please wait…</p>
          </div>
        )}

        {error && (
          <div className="error-box">
            <strong>❌ Error:</strong> {error}
          </div>
        )}

        {result && (
          <section className="results-container">
            <h2>✅ Processing Complete!</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{f(result.duration)}s</div>
                <div className="stat-label">Total Duration</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {f(result.speech_duration)}s
                </div>
                <div className="stat-label">Clean Speech</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {f(result.speech_percentage)}%
                </div>
                <div className="stat-label">Speech %</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {result.segments?.length ?? 0}
                </div>
                <div className="stat-label">Segments</div>
              </div>
            </div>

            <div className="downloads">
              <h3>Audio</h3>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <button className="btn-primary" onClick={handlePlayClean}>
                  ▶️ Play Clean Audio
                </button>
                <button className="btn-secondary" onClick={handleDownloadClean}>
                  💾 Download Clean Audio
                </button>
              </div>
            </div>

            {result.segments && result.segments.length > 0 && (
              <div className="segments-table">
                <h3>Top Segments</h3>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Start (s)</th>
                      <th>End (s)</th>
                      <th>Duration (s)</th>
                      {result.segments[0].energy !== undefined && (
                        <th>Energy</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {result.segments.map((seg, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{f(seg.start)}</td>
                        <td>{f(seg.end)}</td>
                        <td>{f(seg.duration)}</td>
                        {seg.energy !== undefined && <td>{f(seg.energy)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default App;
