import React, { useEffect, useState, useRef } from 'react';
import { useOrchestrator } from '../hooks/useOrchestrator';
import { SettingsMenu } from './SettingsMenu';
import { NotificationModal } from './NotificationModal';
import { CameraStream } from './CameraStream';
import { OnboardingModal } from './OnboardingModal';
import { playEarcon, haptic, HAPTICS, duckProcessingBed } from '../utils/audioFeedback';
import type { Painting } from '../types/painting';

const IS_DEV_MODE = import.meta.env.DEV;

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
    musicFailed,
    stopAll,
    stopTts,
    initAudioContext
  } = useOrchestrator(import.meta.env.VITE_GEMINI_API_KEY, isSearching);

  const [paintings, setPaintings] = useState<any[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalVariant, setModalVariant] = useState<'warning' | 'error'>('warning');

  const [liveMessage, setLiveMessage] = useState("");

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
    idle: "À procura de um quadro. Aponte a câmara para um quadro. Se quiser parar a procura, prima o botão novamente.",
    focusing: "Possível quadro detetado.",
    centered: "Quadro totalmente dentro do campo de visão da câmara. Mantenha o dispositivo estável.",
    out_of_frame_left: "Quadro está cortado na margem esquerda. Mova a câmara mais para a esquerda.",
    out_of_frame_right: "Quadro está cortado na margem direita. Mova a câmara mais para a direita.",
    out_of_frame_top: "Quadro está cortado na margem superior. Mova a câmara mais para cima.",
    out_of_frame_bottom: "Quadro está cortado na margem inferior. Mova a câmara mais para baixo.",
    out_of_frame_multiple: "O quadro está cortado em vários lados. Afaste a câmara do quadro para o enquadrar por completo.",
    processing: "Quadro capturado. A analisar o quadro e a compor a paisagem sonora. Isto pode demorar alguns segundos, por favor aguarde.",
    paused: "Procura parada. A câmara está em pausa. Prima o botão Procurar quadro para recomeçar a procura de um quadro.",
    ready: "Paisagem sonora pronta. Use os botões para ouvir a áudio-descrição, a análise detalhada ou a intenção do autor. Para procurar outro quadro, prima Procurar quadro.",
  };

  const announce = (text: string, key?: string, force: boolean = false) => {
    if (settings.screenReaderMode) {
      setGlobalDucking(false);
      setIsUiAnnouncing(false);
      return;
    }

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

  const announceBoth = (text: string) => {
    announce(text, undefined, true);
    setLiveMessage("");
    requestAnimationFrame(() => setLiveMessage(text));
  };

  const lastCenteringAnnouncementRef = useRef<number>(0);
  const lastAnnouncedStatusRef = useRef<string>("");

  const getLifecycleStatus = (): string => {
    if (!isSearching) return statusMessages.paused;
    if (isProcessing && activePainting) {
      const isUnknown = activePainting.id.toString().startsWith("unknown");
      if (isUnknown) {
        return "Quadro capturado. Quadro desconhecido. A analisar o quadro e a compor a paisagem sonora, sem ter em conta a intenção do autor e o contexto, pois o quadro é desconhecido. Isto pode demorar alguns segundos, por favor aguarde.";
      }
      let identity = activePainting.title;
      if (settings.screenReaderMode) {
        const artist = activePainting.artist && activePainting.artist !== "Desconhecido" ? activePainting.artist : "";
        const year = activePainting.year && activePainting.year !== "Desconhecido" ? activePainting.year : "";
        if (artist) identity += `, de ${artist}`;
        if (year) identity += `, ${year}`;
      }
      return `Quadro capturado. Quadro identificado como ${identity}. A analisar o quadro e a compor a paisagem sonora, tendo em conta a intenção do autor e o contexto. Isto pode demorar alguns segundos, por favor aguarde.`;
    }
    if (activePainting) return "";
    return statusMessages[detectionStatus] || statusMessages.idle;
  };

  useEffect(() => {
    if (isPaused || !hasInteracted || !isSearching) return;
    if (activePainting && !isProcessing) return;

    const msg = getLifecycleStatus();
    if (!msg) return;

    const isOutOfFrame = detectionStatus.startsWith('out_of_frame');
    if (msg !== lastAnnouncedStatusRef.current) {
      announce(msg, undefined, true);
      lastAnnouncedStatusRef.current = msg;
      lastCenteringAnnouncementRef.current = Date.now();
    } else if (isOutOfFrame && Date.now() - lastCenteringAnnouncementRef.current >= 8000) {
      announce(msg, undefined, true);
      lastCenteringAnnouncementRef.current = Date.now();
    }
  }, [isProcessing, activePainting?.id, detectionStatus, isPaused, hasInteracted, isSearching]);

  const wasSearchingRef = useRef(false);
  useEffect(() => {
    if (hasInteracted && wasSearchingRef.current && !isSearching) {
      lastAnnouncedStatusRef.current = "";
      announce(statusMessages.paused, undefined, true);
    }
    wasSearchingRef.current = isSearching;
  }, [isSearching, hasInteracted]);

  useEffect(() => {
    if (!isProcessing || !hasInteracted) return;
    const id = window.setInterval(() => {
      announceBoth("Aguarde mais alguns segundos.");
      // Duck the waiting music so the spoken/screen-reader cue stays intelligible.
      duckProcessingBed(true, settings.masterVolume);
      window.setTimeout(() => duckProcessingBed(false, settings.masterVolume), 3500);
    }, 30000);
    return () => clearInterval(id);
  }, [isProcessing, hasInteracted, settings.masterVolume]);

  const prevStatusRef = useRef<string>('');
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (detectionStatus !== prev) {
      if (detectionStatus === 'focusing') {
        if (settings.earconsEnabled) playEarcon('detected', settings.masterVolume);
        if (settings.hapticsEnabled) haptic(HAPTICS.detected);
      } else if (detectionStatus === 'centered') {
        if (settings.hapticsEnabled) haptic(HAPTICS.centered);
      }
      prevStatusRef.current = detectionStatus;
    }
  }, [detectionStatus, settings.earconsEnabled, settings.hapticsEnabled, settings.masterVolume]);

  useEffect(() => {
    if (criticalError) {
      if (settings.earconsEnabled) playEarcon('error', settings.masterVolume);
      if (settings.hapticsEnabled) haptic(HAPTICS.error);
      announce(criticalError, undefined, true);
    }
  }, [criticalError, settings.earconsEnabled, settings.hapticsEnabled, settings.masterVolume]);

  useEffect(() => {
    if (isModalOpen && modalMessage) announce(modalMessage, undefined, true);
  }, [isModalOpen, modalMessage]);

  useEffect(() => {
    if (musicFailed) {
      announceBoth("A música não pôde ser gerada. Ainda assim, pode explorar o quadro através dos botões de áudio-descrição, análise detalhada e intenção do autor. Para ouvir uma música, procure outra vez o quadro.");
    }
  }, [musicFailed]);

  const autoNarratedRef = useRef<string | number | null>(null);
  useEffect(() => {
    if (!settings.autoNarrate || isProcessing || isPaused || !activePainting) return;
    if (autoNarratedRef.current === activePainting.id) return;
    autoNarratedRef.current = activePainting.id;
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 1200));
      if (settings.descriptionEnabled) await playDescription();
      if (settings.analysisEnabled) await playAnalysis();
    })();
  }, [settings.autoNarrate, isProcessing, isPaused, activePainting?.id, settings.descriptionEnabled, settings.analysisEnabled, playDescription, playAnalysis]);

  const currentStatus = getLifecycleStatus();

  const handleTogglePause = () => {
    if (!activePainting) {
      setModalMessage("Não é possível realizar esta ação: nenhum áudio a tocar.");
      setModalVariant('warning');
      setIsModalOpen(true);
      return;
    }
    togglePause();
    announceBoth(
      isPaused
        ? "Áudio irá continuar a tocar a partir de onde foi parado."
        : "Áudio pausado. Se quiser voltar a tocar o áudio, prima o botão novamente."
    );
  };

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
          handleTogglePause();
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
    <div className="App" aria-roledescription="Aplicação de experiência sonora para quadros">
      <div className="sr-only" aria-live="assertive" aria-atomic="true">{liveMessage}</div>
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
            announce("Definições abertas.", undefined, true);
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
          onClick={handleTogglePause}
          onMouseEnter={() => announce(isPaused ? "Continuar a reproduzir o áudio" : "Pausar", undefined, true)}
          aria-label={isPaused ? "Continuar a reproduzir o áudio" : "Pausar sistema e parar áudio"}
          tabIndex={isOverlayActive ? -1 : 0}
        >
          <span className="icon" aria-hidden="true">
            <i className={`fa-regular ${isPaused ? 'fa-circle-play' : 'fa-circle-pause'}`}></i>
          </span>
          <span>{isPaused ? 'Continuar a reproduzir o áudio' : 'Pausar'}</span>
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
            if (isOverlayActive) { e.preventDefault(); return; }
            if (isDescriptionPlaying) {
              stopTts();
              announceBoth("Áudio-descrição parada.");
              return;
            }
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a áudio-descrição: nenhum quadro foi identificado.");
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
          aria-disabled={isOverlayActive}
          aria-label={isDescriptionPlaying ? "Parar áudio-descrição" : "Tocar Áudio-descrição do quadro"}
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
            if (isOverlayActive) { e.preventDefault(); return; }
            if (isAnalysisPlaying) {
              stopTts();
              announceBoth("Análise detalhada parada.");
              return;
            }
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a análise: nenhum quadro foi identificado.");
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
          aria-disabled={isOverlayActive}
          aria-label={isAnalysisPlaying ? "Parar análise detalhada" : "Tocar Análise Detalhada do quadro e som de objetos identificados"}
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
            if (isOverlayActive) { e.preventDefault(); return; }
            if (isIntentionPlaying) {
              stopTts();
              announceBoth("Intenção do autor parada.");
              return;
            }
            if (!activePainting) {
              handleActionWithCheck(() => {}, false, "Não é possível tocar a intenção do autor: nenhum quadro foi identificado.");
            } else if (activePainting.id.toString().startsWith("unknown")) {
              handleActionWithCheck(() => {}, false, "A intenção do autor não está disponível porque o quadro é desconhecido e não consta na base de dados.");
            } else if (!settings.intentionEnabled) {
              handleActionWithCheck(() => {}, false, "A intenção do autor está desativada nas definições. Ative-a nas definições para ouvir.");
            } else if (!activePainting.authors_intention || activePainting.authors_intention === "Desconhecido") {
              handleActionWithCheck(() => {}, false, "A intenção do autor não está disponível para este quadro.");
            } else if (failedTasks['tts-intention']) {
              handleActionWithCheck(() => {}, false, "Ocorreu um erro a gerar a intenção do autor. Verifique a sua ligação à internet.", "error");
            } else if (!authorsIntentionText) {
              handleActionWithCheck(() => {}, false, "A intenção do autor ainda está a ser gerada. Por favor, aguarde.");
            } else {
              playAuthorsIntention();
            }
          }}
          onMouseEnter={() => announce("Tocar Intenção do Autor", "play_intention", true)}
          aria-disabled={isOverlayActive}
          aria-label={isIntentionPlaying ? "Parar intenção do autor" : "Tocar Intenção do Autor do quadro"}
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
            announce("Definições fechadas.", undefined, true);
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
        {isProcessing ? "A processar detalhes do quadro e a gerar áudio. Este processo demora alguns segundos, por favor aguarde." : ""}
        {activePainting ? (activePainting.id.toString().startsWith("unknown") ? "Quadro atual: Quadro desconhecido" : `Quadro atual: ${activePainting.title} de ${activePainting.artist}`) : ""}
      </footer>

      <CameraStream 
        onFrame={sendFrame} 
        isPaused={isPaused || isProcessing || !!activePainting} 
        isActive={isSearching && !isOverlayActive} 
      />
    </div>
  );
};
