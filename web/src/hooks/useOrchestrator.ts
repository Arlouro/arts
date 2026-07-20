import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { GeminiService } from '../services/GeminiService.ts';
import { LyriaService } from '../services/LyriaService.ts';
import { GeminiTTSService } from '../services/GeminiTTSService.ts';
import { ElevenLabsService } from '../services/ElevenLabsService.ts';
import type { Painting } from '../types/painting.ts';
import { useYolo } from './useYolo.ts';
import { useSettings } from './useSettings.ts';
import {
  playEarcon, haptic, HAPTICS,
  stopProcessingBed, unlockUiAudio,
  beaconUpdate, beaconStop,
} from '../utils/audioFeedback.ts';
import { getSharedAudioContext, unlockSharedAudio } from '../utils/sharedAudio.ts';
import { primeSpeechVoices } from '../utils/speech.ts';

export const useOrchestrator = (apiKey: string, isSearching: boolean = false) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePainting, setActivePainting] = useState<Painting | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [descriptionText, setDescriptionText] = useState<string>("");
  const [analysisText, setAnalysisText] = useState<string>("");
  const [authorsIntentionText, setAuthorsIntentionText] = useState<string>("");
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [detectionStatus, setDetectionStatus] = useState<string>("idle");
  const [isDescriptionPlaying, setIsDescriptionPlaying] = useState(false);
  const [isAnalysisPlaying, setIsAnalysisPlaying] = useState(false);
  const [isIntentionPlaying, setIsIntentionPlaying] = useState(false);
  const [isUiAnnouncing, setIsUiAnnouncing] = useState(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [failedTasks, setFailedTasks] = useState<Record<string, boolean>>({});
  const [musicFailed, setMusicFailed] = useState(false);
  const [musicReady, setMusicReady] = useState(false);
  const [musicReleased, setMusicReleased] = useState(false);
  const { settings, updateSettings } = useSettings();

  const gemini = useMemo(() => new GeminiService(), []);
  const lyria = useMemo(() => new LyriaService(apiKey), [apiKey]);
  const tts = useMemo(() => new GeminiTTSService(), []);
  const sfx = useMemo(() => new ElevenLabsService(), []);

  useEffect(() => {
    if (settings.musicEnabled && !isPaused && musicReleased) {
      lyria.setVolume(settings.masterVolume);
    } else {
      lyria.setVolume(0);
    }
  }, [settings.masterVolume, settings.musicEnabled, isPaused, musicReleased, lyria]);

  const lastPaintingId = useRef<string | number | null>(null);
  const scanningIntervalRef = useRef<number | null>(null);
  const emitRef = useRef<(event: string, data: any) => void>(null);
  
  const descriptionBufferRef = useRef<AudioBuffer | null>(null);
  const analysisBufferRef = useRef<AudioBuffer | null>(null);
  const authorsIntentionBufferRef = useRef<AudioBuffer | null>(null);
  const sfxBuffersRef = useRef<{ buffer: AudioBuffer; pan: number }[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const initAudioContext = useCallback(() => {
    unlockSharedAudio();          
    unlockUiAudio();              
    tts.prepareAudio();
    sfx.prepareAudio();
    lyria.prepareAudio().catch(() => {});
    primeSpeechVoices();
  }, [lyria, tts, sfx]);

  const playScanningPing = useCallback(() => {
    if (!settings.sfxEnabled || isPaused || isProcessing || activePainting || !isSearching || criticalError) return;
    
    try {
      const ctx = getSharedAudioContext();
      if (!ctx || ctx.state !== 'running') return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(settings.masterVolume * 0.3, ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
      
    } catch (e) {
      console.warn("Could not play scanning ping:", e);
    }
  }, [settings.masterVolume, settings.sfxEnabled, isPaused, isProcessing, activePainting, isSearching, criticalError]);

  useEffect(() => {
    const shouldPulse = detectionStatus === 'idle' && !activePainting && !isPaused && !isProcessing && isSearching && !criticalError;
    
    if (shouldPulse) {
      playScanningPing();
      scanningIntervalRef.current = window.setInterval(playScanningPing, 3000);
    } else {
      if (scanningIntervalRef.current) {
        clearInterval(scanningIntervalRef.current);
        scanningIntervalRef.current = null;
      }
    }

    return () => {
      if (scanningIntervalRef.current) clearInterval(scanningIntervalRef.current);
    };
  }, [detectionStatus, activePainting, isPaused, isProcessing, playScanningPing, isSearching, criticalError]);

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Centering beacon: active only while the user is framing an artwork.
  const framingRef = useRef(false);
  useEffect(() => {
    framingRef.current = isSearching && !isProcessing && !activePainting && !isPaused;
    if (!framingRef.current) beaconStop();
  }, [isSearching, isProcessing, activePainting, isPaused]);

  const handleTracking = useCallback((t: { dx: number; dy: number; centered: boolean; inFrame: boolean }) => {
    if (!settingsRef.current.centeringBeaconEnabled || !framingRef.current) {
      beaconStop();
      return;
    }
    beaconUpdate(t.dx, t.dy, t.centered, settingsRef.current.masterVolume);
  }, []);

  const sfxTimeoutsRef = useRef<Set<number>>(new Set());
  const isSfxActiveRef = useRef(false);
  const sfxPhase1DoneRef = useRef(false);
  const isNarrationPlayingRef = useRef(false);
  const isUiAnnouncingRef = useRef(false);
  const introActiveRef = useRef(false);
  useEffect(() => { isUiAnnouncingRef.current = isUiAnnouncing; }, [isUiAnnouncing]);

  const waitForSpeechIdle = useCallback(async (startGraceMs: number, includeIntro: boolean) => {
    const busy = () =>
      window.speechSynthesis.speaking ||
      isUiAnnouncingRef.current ||
      (includeIntro && introActiveRef.current);
    const graceDeadline = Date.now() + startGraceMs;
    while (Date.now() < graceDeadline && !busy()) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const hardDeadline = Date.now() + 15000;
    while (busy() && Date.now() < hardDeadline) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }, []);

  const waitForSystemVoice = useCallback(
    (startGraceMs: number = 300) => waitForSpeechIdle(startGraceMs, true),
    [waitForSpeechIdle],
  );
  
  useEffect(() => {
    if (!activePainting || isPaused || musicReleased) return;
    const musicPhaseSettled =
      musicReady || musicFailed || (!settings.musicEnabled && !isProcessing);
    if (!musicPhaseSettled) return;

    let cancelled = false;
    (async () => {
      await waitForSystemVoice(2500);
      if (!cancelled) setMusicReleased(true);
    })();
    return () => { cancelled = true; };
  }, [activePainting, isPaused, musicReleased, musicReady, musicFailed, settings.musicEnabled, isProcessing, waitForSystemVoice]);

  const stopSfxLoop = useCallback(() => {
    isSfxActiveRef.current = false;
    sfxTimeoutsRef.current.forEach(clearTimeout);
    sfxTimeoutsRef.current.clear();
    sfx.stopAll(0.3);
  }, [sfx]);

  const startSfxLoop = useCallback(async () => {
    if (isSfxActiveRef.current) return;
    const buffers = sfxBuffersRef.current;
    if (buffers.length === 0) return;

    isSfxActiveRef.current = true;

    const sleep = (ms: number) => new Promise(resolve => {
      const id = window.setTimeout(() => {
        sfxTimeoutsRef.current.delete(id);
        resolve(null);
      }, ms);
      sfxTimeoutsRef.current.add(id);
    });

    const playDuckedSfx = async (item: { buffer: AudioBuffer; pan: number }) => {
      if (!isSfxActiveRef.current || isNarrationPlayingRef.current) return;
      const currentSettings = settingsRef.current;
      if (currentSettings.musicEnabled) lyria.setVolume(currentSettings.masterVolume * 0.6, 0.5);
      
      await sfx.playAudioBuffer(item.buffer, currentSettings.masterVolume, item.pan);
      
      if (currentSettings.musicEnabled && isSfxActiveRef.current) {
        lyria.setVolume(currentSettings.masterVolume, 0.5);
      }
    };

    try {
      if (!sfxPhase1DoneRef.current) {
        for (let i = 0; i < buffers.length; i++) {
          if (!isSfxActiveRef.current) return;
          await playDuckedSfx(buffers[i]);
          
          if (!isSfxActiveRef.current) return;
          await sleep(1500 + Math.random() * 1500);
        }
        if (isSfxActiveRef.current) {
          sfxPhase1DoneRef.current = true;
        }
      }

      while (isSfxActiveRef.current) {
        const randomDelay = 4000 + Math.random() * 8000;
        await sleep(randomDelay);

        if (!isSfxActiveRef.current) break;

        const randomIndex = Math.floor(Math.random() * buffers.length);
        await playDuckedSfx(buffers[randomIndex]);
      }
    } catch (error) {
      console.error("SFX Loop Error:", error);
    } finally {
      isSfxActiveRef.current = false;
    }
  }, [sfx, lyria]);

  useEffect(() => {
    if (isPaused || isProcessing || criticalError || !musicReleased || !settings.sfxEnabled || sfxBuffersRef.current.length === 0) {
      stopSfxLoop();
    } else {
      startSfxLoop();
    }
  }, [isPaused, isProcessing, criticalError, musicReleased, settings.sfxEnabled, startSfxLoop, stopSfxLoop, sfxBuffersRef.current.length]);

  const silenceAllAudio = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    beaconStop();
    stopProcessingBed(0.3);
    stopSfxLoop();
    tts.stopAll();
    await lyria.stop();
  }, [lyria, tts, stopSfxLoop]);

  const playDescription = useCallback(async () => {
    if (!descriptionBufferRef.current || isPaused || !settings.descriptionEnabled) return;

    try {
      setIsDescriptionPlaying(true);
      isNarrationPlayingRef.current = true;
      
      await waitForSystemVoice();
      
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume * 0.4, 0.8);
      await tts.playAudioBuffer(descriptionBufferRef.current, settings.masterVolume);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume, 0.8);
    } catch (error) {
      console.error("Description playback failed:", error);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume);
    } finally {
      setIsDescriptionPlaying(false);
      isNarrationPlayingRef.current = false;
    }
  }, [lyria, tts, isPaused, settings.descriptionEnabled, settings.musicEnabled, settings.masterVolume, waitForSystemVoice]);

  const playAnalysis = useCallback(async () => {
    if (!analysisBufferRef.current || isPaused || !settings.analysisEnabled) return;

    try {
      setIsAnalysisPlaying(true);
      isNarrationPlayingRef.current = true;
      
      await waitForSystemVoice();

      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume * 0.4, 0.8);
      await tts.playAudioBuffer(analysisBufferRef.current, settings.masterVolume);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume, 0.8);
    } catch (error) {
      console.error("Analysis playback failed:", error);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume);
    } finally {
      setIsAnalysisPlaying(false);
      isNarrationPlayingRef.current = false;
    }
  }, [lyria, tts, isPaused, settings.analysisEnabled, settings.musicEnabled, settings.masterVolume, waitForSystemVoice]);

  const playAuthorsIntention = useCallback(async () => {
    if (!authorsIntentionBufferRef.current || isPaused || !settings.intentionEnabled) return;

    try {
      setIsIntentionPlaying(true);
      isNarrationPlayingRef.current = true;
      
      await waitForSystemVoice();

      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume * 0.4, 0.8);
      await tts.playAudioBuffer(authorsIntentionBufferRef.current, settings.masterVolume);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume, 0.8);
    } catch (error) {
      console.error("Authors Intention playback failed:", error);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume);
    } finally {
      setIsIntentionPlaying(false);
      isNarrationPlayingRef.current = false;
    }
  }, [lyria, tts, isPaused, settings.intentionEnabled, settings.musicEnabled, settings.masterVolume, waitForSystemVoice]);

  const processNewDetection = useCallback(async (painting: Painting) => {
    if (activePainting !== null || painting.id === lastPaintingId.current || isProcessing || isPaused) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    try {
      // Immediate state change to block concurrent handle calls
      setIsProcessing(true);
      emitRef.current?.("pause_detection", {});
      
      if (scanningIntervalRef.current) {
        clearInterval(scanningIntervalRef.current);
        scanningIntervalRef.current = null;
      }

      setIsProcessing(true);

      lastPaintingId.current = painting.id;
      setActivePainting(painting);

      setMusicFailed(false);
      setMusicReady(false);
      setMusicReleased(false);
      descriptionBufferRef.current = null;
      analysisBufferRef.current = null;
      authorsIntentionBufferRef.current = null;
      sfxBuffersRef.current = [];
      sfxPhase1DoneRef.current = false;

      // Capture earcon + a soft ambient bed so the generation wait isn't silent.
      const fb = settingsRef.current;
      if (fb.earconsEnabled) playEarcon('capturing', fb.masterVolume);
      if (fb.hapticsEnabled) haptic(HAPTICS.capture);
      beaconStop();

      console.log(`Starting parallel analysis and generation for: ${painting.title}`);

      lyria.stop();

      let introBufferPromise: Promise<AudioBuffer | null> | null = null;
      if ((settings.descriptionEnabled || settings.analysisEnabled || settings.intentionEnabled) && !isPaused && !settings.screenReaderMode) {
        const isUnknown = painting.id.toString().startsWith("unknown");
        const introText = isUnknown 
          ? "Quadro desconhecido."
          : `${painting.title}. ${painting.artist && painting.artist !== "Desconhecido" ? `Por ${painting.artist}.` : ""} ${painting.year && painting.year !== "Desconhecido" ? `Ano, ${painting.year}.` : ""}`;
        introBufferPromise = tts.generateSpeechBuffer(introText, signal);
      }

      const analysis = await gemini.analyzePainting(painting, signal);
      if (signal.aborted) return;

      // Send for server-side debug logging
      emitRef.current?.("save_analysis", { 
        title: painting.title, 
        analysis,
        painting
      });

      const musicPrompt = analysis.MusicPrompt?.Prompt || "";

      console.log("Lyria prompt:", musicPrompt);

      const desc = analysis.ArtDescription || "";
      const anal = analysis.ArtAnalysis || "";
      const objects = analysis.DetectedObjects || [];
      const intention = painting.authors_intention && painting.authors_intention !== "Desconhecido" 
          ? painting.authors_intention 
          : "";
      
      setCurrentPrompt(musicPrompt);
      setDescriptionText(desc);
      setAnalysisText(anal);
      setAuthorsIntentionText(intention);

      console.log("Triggering parallel audio generation...");
      
      const generationTasks: Array<{ label: string; promise: Promise<any> }> = [];

      // 1. Music (Lyria)
      if (!isPaused && settings.musicEnabled) {
        generationTasks.push({
          label: 'lyria',
          promise: lyria.connect(musicPrompt, true, analysis.MusicPrompt?.Config).then(() => {
            if (!signal.aborted) setMusicReady(true);
          }),
        });
      }

      // 2. TTS Description
      if (settings.descriptionEnabled) {
        generationTasks.push({
          label: 'tts-description',
          promise: tts.generateSpeechBuffer(desc, signal).then(buf => {
            if (!signal.aborted) descriptionBufferRef.current = buf;
          })
        });
      }

      // 3. TTS Analysis
      if (settings.analysisEnabled) {
        generationTasks.push({
          label: 'tts-analysis',
          promise: tts.generateSpeechBuffer(anal, signal).then(buf => {
            if (!signal.aborted) analysisBufferRef.current = buf;
          })
        });
      }

      // 4. TTS Intention
      if (settings.intentionEnabled && intention) {
        generationTasks.push({
          label: 'tts-intention',
          promise: tts.generateSpeechBuffer(intention, signal).then(buf => {
            if (!signal.aborted) authorsIntentionBufferRef.current = buf;
          })
        });
      }

      // 5. SFX
      if (settings.sfxEnabled) {
        generationTasks.push({
          label: 'sfx',
          promise: Promise.all(
            objects.map(async (obj: { SoundEffectPrompt: string, Pan?: string | number }) => {
              const buffer = await sfx.generateSfxBuffer(obj.SoundEffectPrompt, signal);
              if (signal.aborted) return null;
              const pan = obj.Pan !== undefined ? parseFloat(obj.Pan.toString()) : 0;
              return buffer ? { buffer, pan: isNaN(pan) ? 0 : pan } : null;
            })
          ).then(results => {
            if (!signal.aborted) {
              sfxBuffersRef.current = results.filter(r => r !== null) as { buffer: AudioBuffer; pan: number }[];
            }
          })
        });
      }

      if (introBufferPromise) {
        try {
          const introBuffer = await introBufferPromise;
          if (introBuffer && !isPaused) {
            introActiveRef.current = true;
            await waitForSpeechIdle(300, false);
            await tts.playAudioBuffer(introBuffer, settings.masterVolume);
          }
        } catch (error) {
          console.error("Intro playback failed:", error);
        } finally {
          introActiveRef.current = false;
        }
      }

      const results = await Promise.allSettled(generationTasks.map(t => t.promise));

      let succeededCount = 0;
      results.forEach((result, i) => {
        const { label } = generationTasks[i];
        if (result.status === 'rejected') {
          if (result.reason?.name === 'AbortError') {
            console.log(`[Orchestrator] Task "${label}" was aborted.`);
            return;
          }
          console.warn(`[Orchestrator] Task "${label}" failed:`, result.reason);
          setFailedTasks(prev => ({ ...prev, [label]: true }));

          if (label === 'lyria') {
            setMusicFailed(true);
          }
        } else {
          succeededCount++;
        }
      });

      console.log(
        `[Orchestrator] Generation complete. ${succeededCount}/${results.length} tasks succeeded.`
      );

      if (!signal.aborted && !isPaused) {
        // Ready cue (non-speech) + haptic, then stop the ambient bed.
        if (settingsRef.current.earconsEnabled) playEarcon('ready', settings.masterVolume);
        if (settingsRef.current.hapticsEnabled) haptic(HAPTICS.ready);
        stopProcessingBed(1.2);
      } else {
        stopProcessingBed(0.4);
      }

    } catch (error) {
      if (signal.aborted || (error as Error)?.name === 'AbortError') {
        console.log("[Orchestrator] Processing aborted; not a critical error.");
        return;
      }
      console.error("Orchestration failed:", error);
      lastPaintingId.current = null;
      setCriticalError(
        "Não foi possível processar o quadro e gerar a paisagem sonora. " +
        "Verifique a sua ligação à internet e reinicie o sistema."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [gemini, lyria, tts, sfx, isProcessing, isPaused, activePainting, settings.musicEnabled, settings.descriptionEnabled, settings.analysisEnabled, settings.intentionEnabled, settings.sfxEnabled, settings.screenReaderMode, waitForSystemVoice, waitForSpeechIdle]);

  const { emit, sendFrame } = useYolo(processNewDetection, setDetectionStatus, handleTracking);
  emitRef.current = emit;

  const togglePause = useCallback(async () => {
    const nextState = !isPaused;
    setIsPaused(nextState);
    if (nextState) {
      lyria.pause();
      tts.pause();
    } else {
      tts.resume();
      if (activePainting && settings.musicEnabled) {
        const resumeVolume = isNarrationPlayingRef.current
          ? settings.masterVolume * 0.4
          : settings.masterVolume;
        lyria.resume(musicReleased ? resumeVolume : 0);
      }
    }
  }, [isPaused, lyria, tts, activePainting, settings.musicEnabled, settings.masterVolume, musicReleased]);

  const setGlobalDucking = useCallback((isDucking: boolean) => {
    const vol = isDucking ? settings.masterVolume * 0.2 : settings.masterVolume;
    const musicTarget = musicReleased && settings.musicEnabled && !isPaused ? vol : 0;
    lyria.setVolume(musicTarget, 0.3);
    if (settings.descriptionEnabled || settings.analysisEnabled || settings.intentionEnabled) tts.setVolume(vol, 0.3);
    if (settings.sfxEnabled) sfx.setVolume(vol, 0.3);
  }, [settings, isPaused, musicReleased, lyria, tts, sfx]);

  return {
    isProcessing,
    activePainting,
    currentPrompt,
    detectionStatus,
    descriptionText,
    analysisText,
    authorsIntentionText,
    isPaused,
    isDescriptionPlaying,
    isAnalysisPlaying,
    isIntentionPlaying,
    isUiAnnouncing,
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
    musicReady,
    initAudioContext,
    silenceAllAudio,
    waitForSystemVoice,
    stopTts: () => tts.stopAll(),
    clearCriticalError: () => setCriticalError(null),
    stopAll: async (resumeDetection: boolean = true) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      emitRef.current?.(resumeDetection ? "resume_detection" : "pause_detection", {});
      beaconStop();
      stopProcessingBed(0.3);
      await lyria.stop();
      tts.stopAll();
      stopSfxLoop();
      setIsProcessing(false);
      setIsPaused(false);
      lastPaintingId.current = null;
      setActivePainting(null);
      setCurrentPrompt("");
      setDescriptionText("");
      setAnalysisText("");
      setAuthorsIntentionText("");
      setDetectionStatus("idle");
      setCriticalError(null);
      setFailedTasks({});
      setMusicFailed(false);
      setMusicReady(false);
      setMusicReleased(false);

      descriptionBufferRef.current = null;
      analysisBufferRef.current = null;
      authorsIntentionBufferRef.current = null;
      sfxBuffersRef.current = [];
      sfxPhase1DoneRef.current = false;
    }
  };
};
