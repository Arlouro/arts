import React, { useEffect, useState } from 'react';
import { useOrchestrator } from '../hooks/useOrchestrator';
import { SettingsMenu } from './SettingsMenu';
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
    settings,
    updateSettings,
    playDescription,
    playAnalysis,
    togglePause,
    processNewDetection,
    stopAll 
  } = useOrchestrator(import.meta.env.VITE_GEMINI_API_KEY, import.meta.env.VITE_ELEVENLABS_API_KEY);

  const [paintings, setPaintings] = useState<any[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

  const announce = (text: string) => {
    // Stop any current speech
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-PT';
    window.speechSynthesis.speak(utterance);
  };

  // Automatic Status Announcer
  useEffect(() => {
    if (isPaused) return;

    if (isProcessing) {
      announce("A gerar soundscape emocional.");
    } else if (activePainting) {
      announce(`Quadro identificado: ${activePainting.title}.`);
    } else if (detectionStatus === 'idle') {
      announce("À procura de um quadro.");
    } else if (detectionStatus === 'focusing') {
      announce("Quadro detetado. Por favor, mantenha a câmara parada.");
    } else if (detectionStatus === 'need_center') {
      announce("Por favor, centre o quadro no ecrã.");
    }
  }, [isProcessing, activePainting?.id, detectionStatus, isPaused]);

  const currentStatus = activePainting 
    ? `Obra detetada: ${activePainting.title}. ${isProcessing ? "A analisar..." : ""}` 
    : statusMessages[detectionStatus] || statusMessages.idle;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSettingsOpen) {
        if (event.key === 'Escape') setIsSettingsOpen(false);
        return;
      }

      // Only trigger global shortcuts if NOT focused on a button
      const isFocusedOnActionable = document.activeElement?.tagName === 'BUTTON' || document.activeElement?.tagName === 'INPUT';

      if (event.key === 'Enter') {
        // Removed global shortcut for description as per request
      }
      if (event.key === ' ') { // Space for toggle
        if (!isFocusedOnActionable) {
          event.preventDefault(); // Prevent page scroll
          togglePause();
        }
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
  }, [descriptionText, playDescription, togglePause, paintings, processNewDetection, isSettingsOpen]);

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
        <button 
          className="big-button btn-settings"
          onClick={() => setIsSettingsOpen(true)}
          onMouseEnter={() => announce("Definições")}
          onFocus={() => announce("Definições")}
          aria-label="Abrir definições do sistema"
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-keyboard"></i>
          </span>
          <span>Definições</span>
        </button>

        <button 
          className={`big-button btn-pause ${isPaused ? 'paused' : ''}`}
          onClick={togglePause}
          onMouseEnter={() => announce(isPaused ? "Iniciar" : "Pausar")}
          onFocus={() => announce(isPaused ? "Iniciar" : "Pausar")}
          disabled={!activePainting || isProcessing}
          aria-label={isPaused ? "Iniciar sistema e retomara deteção" : "Pausar sistema e parar áudio"}
        >
          <span className="icon" aria-hidden="true">
            <i className={`fa-regular ${isPaused ? 'fa-circle-play' : 'fa-circle-pause'}`}></i>
          </span>
          <span>{isPaused ? 'Iniciar' : 'Pausar'}</span>
        </button>

        <button 
          className="big-button btn-stop"
          onClick={stopAll}
          onMouseEnter={() => announce("Parar Áudio e continuar deteção")}
          onFocus={() => announce("Parar Áudio e continuar deteção")}
          disabled={!activePainting && !isProcessing}
          aria-label="Parar todo o áudio e continuar a procurar quadros"
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-circle-stop"></i>
          </span>
          <span>Parar Áudio</span>
        </button>

        <button 
          className="big-button btn-description"
          onClick={playDescription}
          onMouseEnter={() => announce("Tocar Áudio-descrição")}
          onFocus={() => {
            announce("Tocar Áudio-descrição");
            if (descriptionText) playDescription();
          }}
          disabled={!descriptionText || isPaused || !settings.ttsEnabled}
          aria-label={descriptionText ? "Tocar Áudio-descrição da obra" : "Áudio-descrição não disponível"}
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-comment-dots"></i>
          </span>
          <span>Tocar Áudio-descrição</span>
        </button>

        <button 
          className="big-button btn-analysis"
          onClick={playAnalysis}
          onMouseEnter={() => announce("Tocar Análise Detalhada")}
          onFocus={() => announce("Tocar Análise Detalhada")}
          disabled={!analysisText || isPaused || !settings.ttsEnabled}
          aria-label={analysisText ? "Tocar Análise Detalhada da obra e efeitos sonoros" : "Análise não disponível"}
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-eye"></i>
          </span>
          <span>Tocar Análise Detalhada</span>
        </button>
      </main>

      {isSettingsOpen && (
        <SettingsMenu 
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setIsSettingsOpen(false)}
          announce={announce}
        />
      )}

      <footer className="status-overlay sr-only" aria-live="polite">
        {isProcessing ? "A processar com inteligência artificial..." : ""}
        {activePainting ? `Obra atual: ${activePainting.title} de ${activePainting.artist}` : ""}
      </footer>
    </div>
  );
};
