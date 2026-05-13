import React, { useEffect, useState } from 'react';
import { useOrchestrator } from '../hooks/useOrchestrator';
import type { Painting } from '../types/painting';

const IS_DEV_MODE = true; 

export const LyriaPlayer: React.FC = () => {
  const { 
    isProcessing, 
    activePainting, 
    detectionStatus,
    descriptionText,
    analysisText,
    isPaused,
    playDescription,
    playAnalysis,
    togglePause,
    processNewDetection,
    stopAll 
  } = useOrchestrator(import.meta.env.VITE_GEMINI_API_KEY, import.meta.env.VITE_ELEVEN_LABS_SFX_KEY);

  const [paintings, setPaintings] = useState<any[]>([]);

  // Load paintings only if in dev mode for simulation
  useEffect(() => {
    if (IS_DEV_MODE) {
      fetch('/assets/json/paintings.json')
        .then(res => res.json())
        .then(data => setPaintings(data.paintings))
        .catch(err => console.error("Error loading paintings.json:", err));
    }
  }, []);

  // Map backend status to user-friendly Portuguese for screen readers
  const statusMessages: Record<string, string> = {
    idle: "À procura de obra...",
    focusing: "Obra detetada. Por favor, aguarde o foco.",
    centered: "Obra centrada. A capturar imagem.",
    need_center: "Por favor, centre a obra no ecrã.",
    processing: "A analisar o contexto emocional da obra..."
  };

  const currentStatus = activePainting 
    ? `Obra detetada: ${activePainting.title}. ${isProcessing ? "A analisar..." : ""}` 
    : statusMessages[detectionStatus] || statusMessages.idle;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        if (descriptionText) playDescription();
      }
      if (event.key === ' ') { // Space for toggle
        togglePause();
      }

      // Simulation key (only enabled if IS_DEV_MODE is true)
      if (IS_DEV_MODE && event.key === '«' && paintings.length > 0) {
        const randomIndex = Math.floor(Math.random() * paintings.length);
        const rawPainting = paintings[randomIndex];
        
        const painting: Painting = {
          id: String(rawPainting.$id),
          title: rawPainting.title,
          artist: rawPainting.artist,
          year: rawPainting.year,
          style: rawPainting.style,
          genre: rawPainting.genre,
          medium: rawPainting.medium,
          description: rawPainting.description,
          authors_intention: rawPainting.authors_intention,
          context: rawPainting.context,
          imagePath: rawPainting.imagePath.startsWith('/') ? rawPainting.imagePath : `/${rawPainting.imagePath}`
        };

        console.log("DEV: Simulating detection for:", painting.title);
        processNewDetection(painting);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [descriptionText, playDescription, togglePause, paintings, processNewDetection]);

  return (
    <div className="App">
      <header className="top-bar" role="banner">
        <h1>Sonic Canvas</h1>
        <div className="status-info" aria-live="assertive" aria-atomic="true">
          <span className="sr-only">Estado do sistema:</span>
          {currentStatus}
        </div>
      </header>

      <main className="main-content" role="main">
        {/* Button 1: Audio-descrição */}
        <button 
          className="big-button btn-description"
          onClick={playDescription}
          disabled={!descriptionText || isPaused}
          aria-label={descriptionText ? "Tocar Áudio-descrição da obra" : "Áudio-descrição não disponível"}
        >
          <span className="icon" aria-hidden="true"></span>
          <span>Tocar Áudio-descrição</span>
        </button>

        {/* Button 2: Análise Detalhada */}
        <button 
          className="big-button btn-analysis"
          onClick={playAnalysis}
          disabled={!analysisText || isPaused}
          aria-label={analysisText ? "Tocar Análise Detalhada da obra e efeitos sonoros" : "Análise não disponível"}
        >
          <span className="icon" aria-hidden="true"></span>
          <span>Tocar Análise Detalhada</span>
        </button>

        {/* Button 3: Definições */}
        <button 
          className="big-button btn-settings"
          onClick={() => alert("Definições em breve: Ajuste de volume e velocidade.")}
          aria-label="Definições do sistema"
        >
          <span className="icon" aria-hidden="true"></span>
          <span>Definições</span>
        </button>

        {/* Button 4: Pausa/Iniciar */}
        <button 
          className={`big-button btn-pause ${isPaused ? 'paused' : ''}`}
          onClick={togglePause}
          aria-label={isPaused ? "Iniciar sistema e retomara deteção" : "Pausar sistema e parar áudio"}
        >
          <span className="icon" aria-hidden="true"></span>
          <span>{isPaused ? 'Iniciar' : 'Pausar'}</span>
        </button>
      </main>

      <footer className="status-overlay sr-only" aria-live="polite">
        {isProcessing ? "A processar com inteligência artificial..." : ""}
        {activePainting ? `Obra atual: ${activePainting.title} de ${activePainting.artist}` : ""}
      </footer>
    </div>
  );
};
