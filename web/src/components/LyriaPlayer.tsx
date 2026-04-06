import React, { useState } from 'react';
import { useLyria } from '../hooks/useLyria';

export const LyriaPlayer: React.FC = () => {
  const { status, generateMusic, stopMusic } = useLyria(
    import.meta.env.VITE_GEMINI_API_KEY
  );

  const [prompt, setPrompt] = useState("Psychedelic Rock, Moog Synthesizers, 120bpm");

  const handleToggleMusic = () => {
    if (status === 'playing') {
      stopMusic();
    } else {
      generateMusic(prompt);
    }
  };

  return (
    <div className="player-container">
      <div className="card">
        <h2>Lyria AI Music Lab</h2>
        
        {/* Status Badge */}
        <div className={`status-badge ${status}`}>
          {status.toUpperCase()}
        </div>

        {/* Prompt Input */}
        <div className="input-group">
          <label htmlFor="prompt">Music Style Prompt:</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={status === 'playing' || status === 'connecting'}
            placeholder="Describe the mood, instruments, and tempo..."
          />
        </div>

        {/* Controls */}
        <div className="controls">
          <button 
            onClick={handleToggleMusic}
            disabled={status === 'connecting'}
            className={status === 'playing' ? 'btn-stop' : 'btn-start'}
          >
            {status === 'connecting' && "Connecting..."}
            {status === 'playing' && "Stop Session"}
            {(status === 'idle' || status === 'error') && "Generate Music"}
          </button>
        </div>

        {/* Feedback for the user */}
        {status === 'error' && (
          <p className="error-text">
            Connection failed. Please check your API key and console logs.
          </p>
        )}
      </div>
    </div>
  );
};