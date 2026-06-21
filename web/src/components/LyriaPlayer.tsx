import React, { useEffect, useState, useRef } from 'react';
import { useOrchestrator } from '../hooks/useOrchestrator';
import { SettingsMenu } from './SettingsMenu';
import { NotificationModal } from './NotificationModal';
import { CameraStream } from './CameraStream';
import { OnboardingModal } from './OnboardingModal';
import type { Painting } from '../types/painting';

const IS_DEV_MODE = import.meta.env.VITE_SHOW_CAMERA === 'true'; 

export const LyriaPlayer: React.FC = () => {
  const [isSearching, setIsSearching] = useState(false);

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
    setIsUiAnnouncing,
    settings,
    updateSettings,
    playDescription,
    playAnalysis,
    playAuthorsIntention,
    togglePause,
    processNewDetection,
    setGlobalDucking,
    sendFrame,
    criticalError,
    failedTasks,
    stopAll,
    initAudioContext
  } = useOrchestrator(import.meta.env.VITE_GEMINI_API_KEY, isSearching);

  const [paintings, setPaintings] = useState<any[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalVariant, setModalVariant] = useState<'warning' | 'error'>('warning');

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('arts_onboarding_seen') !== 'true';
  });

  const isOverlayActive = showOnboarding || isSettingsOpen || isModalOpen || !!criticalError;

  const handleOnboardingComplete = () => {
    localStorage.setItem('arts_onboarding_seen', 'true');
    setShowOnboarding(false);
    if (!closedViaPopState.current) {
      window.history.back();
    }
  };

  // Audio announcement tracking
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAnnouncedKey = useRef<string | null>(null);
  const lastStatusAnnouncementRef = useRef<number>(0);
  const currentTtsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const closedViaPopState = useRef(false);
  const overlayStateRef = useRef({ isSettingsOpen: false, showOnboarding: false });
  overlayStateRef.current = { isSettingsOpen, showOnboarding };

  useEffect(() => {
    if (showOnboarding) {
      window.history.pushState({ overlay: 'onboarding' }, '', '#onboarding');
    } else if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []); 

  useEffect(() => {
    const handlePopState = () => {
      closedViaPopState.current = true;
      const { isSettingsOpen: settingsOpen, showOnboarding: onboardingOpen } = overlayStateRef.current;

      if (settingsOpen) {
        setIsSettingsOpen(false);
        setTimeout(() => {
          document.querySelector<HTMLButtonElement>('.header-btn-settings')?.focus();
        }, 0);
      }
      if (onboardingOpen) {
        localStorage.setItem('arts_onboarding_seen', 'true');
        setShowOnboarding(false);
      }

      requestAnimationFrame(() => {
        closedViaPopState.current = false;
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const handleInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
        initAudioContext();
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
    idle: "À procura de obra...Aponte a câmara diretamente para uma obra de arte.",
    focusing: "Obra detetada! Mantenha o dispositivo imóvel para capturar",
    centered: "Perfeito. A enviar imagem para análise...",
    need_center_left: "Aponte a câmara mais para a esquerda, para centrar o quadro.",
    need_center_right: "Aponte a câmara mais para a direita, para centrar o quadro.",
    need_center_up: "Aponte a câmara mais para cima, para centrar o quadro.",
    need_center_down: "Aponte a câmara mais para baixo, para centrar o quadro.",
    processing: "A analisar o contexto emocional da obra..."
  };

  const announce = (text: string, key?: string, force: boolean = false) => {
    const now = Date.now();
    
    if (!force && !key && now - lastStatusAnnouncementRef.current < 4000) {
      return;
    }

    if (!key) {
      lastStatusAnnouncementRef.current = now;
    }

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
    setIsUiAnnouncing(true);

    if (key && hasInteracted) {
      const audio = new Audio(`/assets/audio/ui/${key}.wav`);
      currentAudioRef.current = audio;
      audio.volume = settings.masterVolume;
      
      audio.onended = () => {
        setGlobalDucking(false);
        setIsUiAnnouncing(false);
        if (currentAudioRef.current === audio) {
          currentAudioRef.current = null;
          lastAnnouncedKey.current = null;
        }
      };

      audio.play().catch(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-PT';
        currentTtsUtteranceRef.current = utterance;
        utterance.onend = () => {
          setGlobalDucking(false);
          setIsUiAnnouncing(false);
          currentTtsUtteranceRef.current = null;
        };
        window.speechSynthesis.speak(utterance);
      });
    } else if (hasInteracted) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-PT';
      currentTtsUtteranceRef.current = utterance;
      utterance.onend = () => {
        setGlobalDucking(false);
        setIsUiAnnouncing(false);
        lastAnnouncedKey.current = null;
        currentTtsUtteranceRef.current = null;
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setGlobalDucking(false);
      setIsUiAnnouncing(false);
    }
  };

  const lastCenteringAnnouncementRef = useRef<number>(0);
  const lastCenteringStatusRef = useRef<string>("");

  useEffect(() => {
    if (isPaused || !hasInteracted || !isSearching) return;

    if (isProcessing && activePainting) {
      announce("A analisar a emoção da obra e a compor o som. Pode demorar alguns segundos.", "processing");
    } else if (!isProcessing && activePainting) {
      
    } else if (detectionStatus === 'idle') {
      announce("À procura de um quadro.", "searching_painting");
    } else if (detectionStatus === 'focusing') {
      announce("Quadro detetado. Por favor, mantenha a câmara parada.", "painting_detected_focus");
    } else if (detectionStatus.startsWith('need_center')) {
      const now = Date.now();
      const isSameStatus = detectionStatus === lastCenteringStatusRef.current;
      const cooldown = isSameStatus ? 8000 : 4000;
      
      if (now - lastCenteringAnnouncementRef.current >= cooldown) {
        announce(statusMessages[detectionStatus] || statusMessages['need_center'], undefined, true);
        lastCenteringAnnouncementRef.current = now;
        lastCenteringStatusRef.current = detectionStatus;
      }
    }
  }, [isProcessing, activePainting?.id, detectionStatus, isPaused, hasInteracted, isSearching]);

  const currentStatus = !isSearching
    ? "Câmara em pausa. Prima o botão de 'Procurar quadro' para recomeçar a procura."
    : activePainting 
      ? `Obra detetada: ${activePainting.title}. ${isProcessing ? "A compor a paisagem sonora... (aguarde alguns segundos)" : ""}` 
      : statusMessages[detectionStatus] || statusMessages.idle;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSettingsOpen || isModalOpen) {
        if (event.key === 'Escape') {
          if (isSettingsOpen) {
            setIsSettingsOpen(false);
            window.history.back();
          }
          if (isModalOpen) {
            setIsModalOpen(false);
          }
        }
        return;
      }

      const isFocusedOnActionable = document.activeElement?.tagName === 'BUTTON' || document.activeElement?.tagName === 'INPUT';

      if (event.key === ' ') {
        if (!isFocusedOnActionable) {
          event.preventDefault();
          if (!activePainting) {
            handleActionWithCheck(togglePause, !!activePainting, "Não é possível realizar esta ação: nenhuma obra foi identificada.");
          } else {
            togglePause();
            announce(isPaused ? "Iniciar" : "Pausar", isPaused ? "start" : "pause", true);
          }
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
  }, [descriptionText, playDescription, togglePause, paintings, processNewDetection, isSettingsOpen, isModalOpen, isSearching, isPaused, activePainting, announce]);

  const handleActionWithCheck = (action: () => void, condition: boolean, message: string, variant: 'warning' | 'error' = 'warning') => {
    if (condition) {
      action();
    } else {
      setModalMessage(message);
      setModalVariant(variant);
      setIsModalOpen(true);
    }
  };

  const handleRestartSystem = async () => {
    await stopAll(false);
    setIsSearching(false);
  };

  return (
    <div className="App" aria-roledescription="Aplicação de experiência sonora para obras de arte">
      <header className="top-bar" aria-hidden={isOverlayActive} inert={isOverlayActive ? true : undefined}>
        <h1>ARTS</h1>
        <div className="status-info" aria-live="assertive" aria-atomic="true">
          <span className="sr-only">Estado do sistema:</span>
          {currentStatus}
        </div>
        <button type="button"
          className="header-btn-settings"
          onClick={() => {
            setIsSettingsOpen(true);
            window.history.pushState({ overlay: 'settings' }, '', '#settings');
          }}
          onMouseEnter={() => announce("Definições", "settings", true)}
          aria-label="Abrir definições do sistema"
          tabIndex={isOverlayActive ? -1 : 0}
        >
          <i className="fa-solid fa-gear" aria-hidden="true"></i>
        </button>
      </header>

      <main className="main-content" aria-hidden={isOverlayActive} inert={isOverlayActive ? true : undefined}>
        <h2 className="sr-only">Controlos Principais</h2>
        <nav aria-label="Ações principais" style={{ display: 'contents' }}>
        <button type="button"
          className={`big-button btn-pause ${isPaused ? 'paused' : ''}`}
          onClick={() => handleActionWithCheck(togglePause, !!activePainting, "Não é possível realizar esta ação: nenhuma obra foi identificada.")}
          onMouseEnter={() => announce(isPaused ? "Iniciar" : "Pausar", isPaused ? "start" : "pause", true)}
          aria-label={isPaused ? "Iniciar sistema e retomar deteção" : "Pausar sistema e parar áudio"}
          tabIndex={isOverlayActive ? -1 : 0}
        >
          <span className="icon" aria-hidden="true">
            <i className={`fa-regular ${isPaused ? 'fa-circle-play' : 'fa-circle-pause'}`}></i>
          </span>
          <span>{isPaused ? 'Iniciar' : 'Pausar'}</span>
        </button>

        <button type="button"
          className={`big-button ${!isSearching ? 'btn-start' : 'btn-stop'}`}
          onClick={() => {
            if (!isSearching) {
              stopAll(true);
              setIsSearching(true);
            } else {
              stopAll(false);
              setIsSearching(false);
            }
          }}
          onMouseEnter={() => announce(
            !isSearching ? "Procurar quadro" : "Parar procura de quadro",
            undefined,
            true
          )}
          aria-label={!isSearching ? "Procurar quadro" : "Parar procura de quadro"}
          tabIndex={isOverlayActive ? -1 : 0}
        >
          <span className="icon" aria-hidden="true">
            <i className={!isSearching ? 'fa-solid fa-magnifying-glass' : 'fa-regular fa-circle-stop'}></i>
          </span>
          <span>{!isSearching ? 'Procurar quadro' : 'Parar procura de quadro'}</span>
        </button>

        <button type="button"
          className="big-button btn-description"
          onClick={(e) => {
            if (isDescriptionPlaying || isOverlayActive) { e.preventDefault(); return; }
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a áudio-descrição: nenhuma obra foi identificada.");
            } else if (failedTasks['tts-description']) {
              handleActionWithCheck(() => {}, false, "Ocorreu um erro a gerar a áudio-descrição. Verifique a sua ligação à internet.", "error");
            } else if (!settings.descriptionEnabled) {
              handleActionWithCheck(() => {}, false, "A áudio-descrição está desativada nas definições. Ative-a nas definições para ouvir.");
            } else if (!descriptionText) {
              handleActionWithCheck(() => {}, false, "A áudio-descrição ainda está a ser gerada. Por favor, aguarde.");
            } else {
              playDescription();
            }
          }}
          onMouseEnter={() => announce("Tocar Áudio-descrição", "play_description", true)}
          aria-disabled={isDescriptionPlaying || isOverlayActive}
          aria-label={
            isDescriptionPlaying ? "A áudio-descrição está a ser reproduzida" :
            !activePainting ? "Áudio-descrição não disponível pois nenhuma obra foi detetada" :
            failedTasks['tts-description'] ? "Erro na áudio-descrição. Verifique a internet" :
            !settings.descriptionEnabled ? "Áudio-descrição desativada nas definições" :
            !descriptionText ? "A áudio-descrição ainda está a ser gerada" :
            "Tocar Áudio-descrição da obra"
          }
          tabIndex={isOverlayActive ? -1 : 0}
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-comment-dots"></i>
          </span>
          <span>Tocar Áudio-descrição</span>
        </button>

        <button type="button"
          className="big-button btn-analysis"
          onClick={(e) => {
            if (isAnalysisPlaying || isOverlayActive) { e.preventDefault(); return; }
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a análise: nenhuma obra foi identificada.");
            } else if (failedTasks['tts-analysis'] || failedTasks['sfx']) {
              handleActionWithCheck(() => {}, false, "Ocorreu um erro a gerar a análise detalhada e os efeitos sonoros. Verifique a sua ligação à internet.", "error");
            } else if (!settings.analysisEnabled) {
              handleActionWithCheck(() => {}, false, "A análise detalhada está desativada nas definições. Ative-a nas definições para ouvir.");
            } else if (!analysisText) {
              handleActionWithCheck(() => {}, false, "A análise detalhada ainda está a ser gerada. Por favor, aguarde.");
            } else {
              playAnalysis();
            }
          }}
          onMouseEnter={() => announce("Tocar Análise Detalhada", "play_analysis", true)}
          aria-disabled={isAnalysisPlaying || isOverlayActive}
          aria-label={
            isAnalysisPlaying ? "A análise detalhada está a ser reproduzida" :
            !activePainting ? "Análise Detalhada não disponível pois nenhuma obra foi detetada" :
            (failedTasks['tts-analysis'] || failedTasks['sfx']) ? "Erro na análise detalhada. Verifique a internet" :
            !settings.analysisEnabled ? "Análise detalhada desativada nas definições" :
            !analysisText ? "A análise detalhada ainda está a ser gerada" :
            "Tocar Análise Detalhada da obra e som de objetos identificados"
          }
          tabIndex={isOverlayActive ? -1 : 0}
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-eye"></i>
          </span>
          <span>Tocar Análise Detalhada</span>
        </button>

        <button type="button"
          className="big-button btn-intention"
          onClick={(e) => {
            if (isIntentionPlaying || isOverlayActive) { e.preventDefault(); return; }
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a intenção do autor: nenhuma obra foi identificada.");
            } else if (activePainting.id.toString().startsWith("unknown")) {
              handleActionWithCheck(() => {}, false, "A intenção do autor não está disponível porque a obra é desconhecida e não consta na base de dados.");
            } else if (!activePainting.authors_intention || activePainting.authors_intention === "Desconhecido") {
              handleActionWithCheck(() => {}, false, "A intenção do autor não está disponível para esta obra.");
            } else if (failedTasks['tts-intention']) {
              handleActionWithCheck(() => {}, false, "Ocorreu um erro a gerar a intenção do autor. Verifique a sua ligação à internet.", "error");
            } else if (!settings.intentionEnabled) {
              handleActionWithCheck(() => {}, false, "A intenção do autor está desativada nas definições. Ative-a nas definições para ouvir.");
            } else if (!authorsIntentionText) {
              handleActionWithCheck(() => {}, false, "A intenção do autor ainda está a ser gerada. Por favor, aguarde.");
            } else {
              playAuthorsIntention();
            }
          }}
          onMouseEnter={() => announce("Tocar Intenção do Autor", "play_intention", true)}
          aria-disabled={isIntentionPlaying || isOverlayActive}
          aria-label={
            isIntentionPlaying ? "A intenção do autor está a ser reproduzida" :
            !activePainting ? "Intenção do Autor não disponível pois nenhuma obra foi detetada" :
            activePainting.id.toString().startsWith("unknown") ? "A intenção do autor não está disponível para obras desconhecidas" :
            (!activePainting.authors_intention || activePainting.authors_intention === "Desconhecido") ? "A intenção do autor não está disponível para esta obra" :
            failedTasks['tts-intention'] ? "Erro na intenção do autor. Verifique a internet" :
            !settings.intentionEnabled ? "Intenção do Autor desativada nas definições" :
            !authorsIntentionText ? "A intenção do autor ainda está a ser gerada" :
            "Tocar Intenção do Autor da obra"
          }
          tabIndex={isOverlayActive ? -1 : 0}
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-lightbulb"></i>
          </span>
          <span>Tocar Intenção do Autor</span>
        </button>
        </nav>
      </main>

      {isSettingsOpen && (
        <SettingsMenu 
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => {
            setIsSettingsOpen(false);
            if (!closedViaPopState.current) {
              window.history.back();
            }
            setTimeout(() => {
              document.querySelector<HTMLButtonElement>('.header-btn-settings')?.focus();
            }, 0);
          }}
          announce={announce}
        />
      )}

      {showOnboarding && (
        <OnboardingModal onStart={handleOnboardingComplete} announce={announce} />
      )}

      <NotificationModal 
        isOpen={isModalOpen}
        message={modalMessage}
        onClose={modalVariant === 'error' ? () => { setIsModalOpen(false); handleRestartSystem(); } : () => setIsModalOpen(false)}
        announce={announce}
        variant={modalVariant}
      />

      <NotificationModal
        isOpen={!!criticalError}
        message={criticalError ?? ""}
        onClose={handleRestartSystem}
        announce={announce}
        variant="error"
      />

      <footer className="status-overlay sr-only" aria-live="polite" aria-hidden={isOverlayActive} inert={isOverlayActive ? true : undefined}>
        {isProcessing ? "A processar detalhes da obra e a gerar áudio. Este processo demora alguns segundos, por favor aguarde." : ""}
        {activePainting ? (activePainting.id.toString().startsWith("unknown") ? "Obra atual: Obra desconhecida" : `Obra atual: ${activePainting.title} de ${activePainting.artist}`) : ""}
      </footer>

      <CameraStream 
        onFrame={sendFrame} 
        isPaused={isPaused || isProcessing || !!activePainting} 
        isActive={isSearching && !isOverlayActive} 
      />
    </div>
  );
};
