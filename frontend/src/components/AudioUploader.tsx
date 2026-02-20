import React, { useRef } from 'react';

interface AudioUploaderProps {
  onUpload: (file: File) => void;
  loading: boolean;
}

const AudioUploader: React.FC<AudioUploaderProps> = ({ onUpload, loading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload(files[0]);
    }
  };

  return (
    <div className="upload-container">
      <div
        className="upload-box"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-icon">☁️</div>
        <h3>Click to upload or drag and drop</h3>
        <p>WAV • MP3 • MPEG • M4A • AAC • OGG • FLAC • WMA</p>
        
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {loading && (
        <div className="loading-box">
          <div className="spinner"></div>
          <p>Processing your audio... This may take a few minutes</p>
        </div>
      )}
    </div>
  );
};

export default AudioUploader;
