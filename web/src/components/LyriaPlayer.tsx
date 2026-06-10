import React, { useEffect, useState, useRef } from 'react';
import { useOrchestrator } from '../hooks/useOrchestrator';
import { SettingsMenu } from './SettingsMenu';
import { NotificationModal } from './NotificationModal';
import { CameraStream } from './CameraStream';
import type { Painting } from '../types/painting';

const IS_DEV_MODE = true; 

export const LyriaPlayer: React.FC = () => {
  const { 
    isProcessing, 
    activePainting, 
    detectionStatus,
    descriptionText,
    analysisText,
    authorsIntentionText,
    isPaused,
    isDescriptionPlaying,
    isAnalysisPlaying,
    isIntentionPlaying,
    settings,
    updateSettings,
    playDescription,
    playAnalysis,
    playAuthorsIntention,
    togglePause,
    processNewDetection,
    setGlobalDucking,
    sendFrame,
    stopAll 
  } = useOrchestrator(import.meta.env.VITE_GEMINI_API_KEY, import.meta.env.VITE_ELEVENLABS_API_KEY);

  const [paintings, setPaintings] = useState<any[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  // Audio announcement tracking
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAnnouncedKey = useRef<string | null>(null);

  useEffect(() => {
    const handleInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
        const utterance = new SpeechSynthesisUtterance('');
        utterance.volume = 0;
        window.speechSynthesis.speak(utterance);
      }
    };

    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [hasInteracted]);

  useEffect(() => {
    if (IS_DEV_MODE) {
      fetch('/assets/json/paintings.json')
        .then(res => res.json())
        .then(data => setPaintings(data.paintings))
        .catch(err => console.error("Error loading paintings.json:", err));
    }
  }, []);

  const statusMessages: Record<string, string> = {
    idle: "À procura de obra...",
    focusing: "Obra detetada. Por favor, aguarde o foco.",
    centered: "Obra centrada. A capturar imagem.",
    need_center: "Por favor, centre a obra no ecrã.",
    processing: "A analisar o contexto emocional da obra..."
  };

  const announce = (text: string, key?: string) => {
    // Stop any current TTS
    window.speechSynthesis.cancel();
    
    // Stop any current UI audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    
    lastAnnouncedKey.current = key || null;
    setGlobalDucking(true);

    if (key && hasInteracted) {
      const audio = new Audio(`/assets/audio/ui/${key}.wav`);
      currentAudioRef.current = audio;
      audio.volume = settings.masterVolume;
      
      audio.onended = () => {
        setGlobalDucking(false);
        if (currentAudioRef.current === audio) {
          currentAudioRef.current = null;
          lastAnnouncedKey.current = null;
        }
      };

      audio.play().catch(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-PT';
        utterance.onend = () => setGlobalDucking(false);
        window.speechSynthesis.speak(utterance);
      });
    } else if (hasInteracted) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-PT';
      utterance.onend = () => {
        setGlobalDucking(false);
        lastAnnouncedKey.current = null;
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setGlobalDucking(false);
    }
  };

  useEffect(() => {
    if (isPaused || !hasInteracted) return;

    if (isProcessing && activePainting) {
      announce(`Quadro identificado: ${activePainting.title}. A gerar soundscape emocional.`, `painting_${activePainting.id}`);
    } else if (!isProcessing && activePainting) {
      
    } else if (detectionStatus === 'idle') {
      announce("À procura de um quadro.", "searching_painting");
    } else if (detectionStatus === 'focusing') {
      announce("Quadro detetado. Por favor, mantenha a câmara parada.", "painting_detected_focus");
    } else if (detectionStatus === 'need_center') {
      announce("Por favor, centre o quadro no ecrã.", "center_painting");
    }
  }, [isProcessing, activePainting?.id, detectionStatus, isPaused, hasInteracted]);

  const currentStatus = activePainting 
    ? `Obra detetada: ${activePainting.title}. ${isProcessing ? "A analisar..." : ""}` 
    : statusMessages[detectionStatus] || statusMessages.idle;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSettingsOpen || isModalOpen) {
        if (event.key === 'Escape') {
          setIsSettingsOpen(false);
          setIsModalOpen(false);
        }
        return;
      }

      const isFocusedOnActionable = document.activeElement?.tagName === 'BUTTON' || document.activeElement?.tagName === 'INPUT';

      if (event.key === ' ') {
        if (!isFocusedOnActionable) {
          event.preventDefault();
          togglePause();
        }
      }

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
  }, [descriptionText, playDescription, togglePause, paintings, processNewDetection, isSettingsOpen, isModalOpen]);

  const handleActionWithCheck = (action: () => void, condition: boolean, message: string) => {
    if (condition) {
      action();
    } else {
      setModalMessage(message);
      setIsModalOpen(true);
    }
  };

  return (
    <div className="App">
      <header className="top-bar" role="banner">
        <h1>ARTS</h1>
        <div className="status-info" aria-live="assertive" aria-atomic="true">
          <span className="sr-only">Estado do sistema:</span>
          {currentStatus}
        </div>
      </header>

      <main className="main-content" role="main">
        <button 
          className="big-button btn-settings"
          onClick={() => setIsSettingsOpen(true)}
          onMouseEnter={() => announce("Definições", "settings")}
          aria-label="Abrir definições do sistema"
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-keyboard"></i>
          </span>
          <span>Definições</span>
        </button>

        <button 
          className={`big-button btn-pause ${isPaused ? 'paused' : ''}`}
          onClick={() => handleActionWithCheck(togglePause, !!activePainting, "Não é possível realizar esta ação: nenhuma obra foi identificada.")}
          onMouseEnter={() => announce(isPaused ? "Iniciar" : "Pausar", isPaused ? "start" : "pause")}
          aria-label={isPaused ? "Iniciar sistema e retomar deteção" : "Pausar sistema e parar áudio"}
        >
          <span className="icon" aria-hidden="true">
            <i className={`fa-regular ${isPaused ? 'fa-circle-play' : 'fa-circle-pause'}`}></i>
          </span>
          <span>{isPaused ? 'Iniciar' : 'Pausar'}</span>
        </button>

        <button 
          className="big-button btn-stop"
          onClick={() => handleActionWithCheck(stopAll, !!activePainting || isProcessing, "Não é possível realizar esta ação: nenhuma obra foi identificada.")}
          onMouseEnter={() => announce("Procurar outro quadro", "stop_audio")}
          aria-label="Procurar outro quadro"
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-circle-stop"></i>
          </span>
          <span>Procurar outro quadro</span>
        </button>

        <button 
          className="big-button btn-description"
          onClick={() => {
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a áudio-descrição: nenhuma obra foi identificada.");
            } else if (!descriptionText) {
              handleActionWithCheck(() => {}, false, "A áudio-descrição ainda está a ser gerada. Por favor, aguarde.");
            } else if (!settings.descriptionEnabled) {
              handleActionWithCheck(() => {}, false, "A áudio-descrição está desativada nas definições.");
            } else {
              playDescription();
            }
          }}
          onMouseEnter={() => announce("Tocar Áudio-descrição", "play_description")}
          disabled={isDescriptionPlaying}
          aria-label={descriptionText ? "Tocar Áudio-descrição da obra" : "Áudio-descrição não disponível"}
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-comment-dots"></i>
          </span>
          <span>Tocar Áudio-descrição</span>
        </button>

        <button 
          className="big-button btn-analysis"
          onClick={() => {
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a análise: nenhuma obra foi identificada.");
            } else if (!analysisText) {
              handleActionWithCheck(() => {}, false, "A análise detalhada ainda está a ser gerada. Por favor, aguarde.");
            } else if (!settings.analysisEnabled) {
              handleActionWithCheck(() => {}, false, "A análise detalhada está desativada nas definições.");
            } else {
              playAnalysis();
            }
          }}
          onMouseEnter={() => announce("Tocar Análise Detalhada", "play_analysis")}
          disabled={isAnalysisPlaying}
          aria-label={analysisText ? "Tocar Análise Detalhada da obra e efeitos sonoros" : "Análise não disponível"}
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-eye"></i>
          </span>
          <span>Tocar Análise Detalhada</span>
        </button>

        <button 
          className="big-button btn-intention"
          onClick={() => {
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a intenção do autor: nenhuma obra foi identificada.");
            } else if (!authorsIntentionText) {
              handleActionWithCheck(() => {}, false, "A intenção do autor ainda está a ser gerada. Por favor, aguarde.");
            } else if (!settings.intentionEnabled) {
              handleActionWithCheck(() => {}, false, "A intenção do autor está desativada nas definições.");
            } else {
              playAuthorsIntention();
            }
          }}
          onMouseEnter={() => announce("Tocar Intenção do Autor", "play_intention")}
          disabled={isIntentionPlaying}
          aria-label={authorsIntentionText ? "Tocar Intenção do Autor da obra" : "Intenção do Autor não disponível"}
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-lightbulb"></i>
          </span>
          <span>Tocar Intenção do Autor</span>
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

      <NotificationModal 
        isOpen={isModalOpen}
        message={modalMessage}
        onClose={() => setIsModalOpen(false)}
        announce={announce}
      />

      <footer className="status-overlay sr-only" aria-live="polite" aria-hidden={isSettingsOpen || isModalOpen} inert={isSettingsOpen || isModalOpen ? "" : undefined}>
        {isProcessing ? "A processar com inteligência artificial..." : ""}
        {activePainting ? `Obra atual: ${activePainting.title} de ${activePainting.artist}` : ""}
      </footer>

      <CameraStream 
        onFrame={sendFrame} 
        isPaused={isPaused} 
        isActive={!isSettingsOpen && !isModalOpen} 
      />
    </div>
  );
};
