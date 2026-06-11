import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { GeminiService } from '../services/GeminiService.ts';
import { LyriaService } from '../services/LyriaService.ts';
import { GeminiTTSService } from '../services/GeminiTTSService.ts';
import { ElevenLabsService } from '../services/ElevenLabsService.ts';
import type { Painting } from '../types/painting.ts';
import { useYolo } from './useYolo.ts';
import { useSettings } from './useSettings.ts';

export const useOrchestrator = (apiKey: string, elevenLabsApiKey: string) => {
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
  const { settings, updateSettings } = useSettings();

  const gemini = useMemo(() => new GeminiService(apiKey), [apiKey]);
  const lyria = useMemo(() => new LyriaService(apiKey), [apiKey]);
  const tts = useMemo(() => new GeminiTTSService(apiKey), [apiKey]);
  const sfx = useMemo(() => new ElevenLabsService(elevenLabsApiKey), [elevenLabsApiKey]);

  useEffect(() => {
    if (settings.musicEnabled && !isPaused) {
      lyria.setVolume(settings.masterVolume);
    } else {
      lyria.setVolume(0);
    }
  }, [settings.masterVolume, settings.musicEnabled, isPaused, lyria]);

  const lastPaintingId = useRef<string | number | null>(null);
  const scanningIntervalRef = useRef<number | null>(null);
  const emitRef = useRef<(event: string, data: any) => void>(null);
  
  const descriptionBufferRef = useRef<AudioBuffer | null>(null);
  const analysisBufferRef = useRef<AudioBuffer | null>(null);
  const authorsIntentionBufferRef = useRef<AudioBuffer | null>(null);
  const sfxBuffersRef = useRef<{ buffer: AudioBuffer; pan: number }[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeTtsCountRef = useRef<number>(0);

  const playScanningPing = useCallback(() => {
    if (!settings.sfxEnabled || isPaused || isProcessing || activePainting) return;
    
    try {
      if (!audioContextRef.current) {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AudioContextClass) return;
        audioContextRef.current = new AudioContextClass();
      }
      
      const ctx = audioContextRef.current;
      
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      
      if (ctx.state === 'suspended') return;

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
  }, [settings.masterVolume, settings.sfxEnabled, isPaused, isProcessing, activePainting]);

  useEffect(() => {
    const shouldPulse = detectionStatus === 'idle' && !activePainting && !isPaused && !isProcessing;
    
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
  }, [detectionStatus, activePainting, isPaused, isProcessing, playScanningPing]);

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const sfxTimeoutsRef = useRef<Set<number>>(new Set());
  const isSfxActiveRef = useRef(false);
  const sfxPhase1DoneRef = useRef(false);
  const isNarrationPlayingRef = useRef(false);
  const isUiAnnouncingRef = useRef(false);
  useEffect(() => { isUiAnnouncingRef.current = isUiAnnouncing; }, [isUiAnnouncing]);

  const waitForSystemVoice = useCallback(async () => {
    // Give a small head-start for any pending announcements to start
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Poll the system voice status AND our manual UI announcement flag
    while (window.speechSynthesis.speaking || isUiAnnouncingRef.current) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, []);

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
    if (isPaused || isProcessing || !settings.sfxEnabled || sfxBuffersRef.current.length === 0) {
      stopSfxLoop();
    } else {
      startSfxLoop();
    }
  }, [isPaused, isProcessing, settings.sfxEnabled, startSfxLoop, stopSfxLoop, sfxBuffersRef.current.length]);

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

    try {
      emitRef.current?.("pause_detection", {});
      
      if (scanningIntervalRef.current) {
        clearInterval(scanningIntervalRef.current);
        scanningIntervalRef.current = null;
      }

      setIsProcessing(true);

      lastPaintingId.current = painting.id;
      setActivePainting(painting);
      
      descriptionBufferRef.current = null;
      analysisBufferRef.current = null;
      authorsIntentionBufferRef.current = null;
      sfxBuffersRef.current = [];
      sfxPhase1DoneRef.current = false;

      console.log(`Starting parallel analysis and generation for: ${painting.title}`);

      lyria.stop();

      const analysis = await gemini.analyzePainting(painting);

      // Send for server-side debug logging
      emitRef.current?.("save_analysis", { 
        title: painting.title, 
        analysis,
        painting
      });

      const musicPrompt = analysis.MusicPrompt?.Prompt || "";

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
      
      const generationTasks: Promise<any>[] = [];

      // 1. Music (Lyria)
      let introBufferPromise: Promise<AudioBuffer | null> | null = null;
      if ((settings.descriptionEnabled || settings.analysisEnabled || settings.intentionEnabled) && !isPaused) {
        const isUnknown = painting.id.toString().startsWith("unknown");
        const introText = isUnknown 
          ? "Obra desconhecida." 
          : `${painting.title}. ${painting.artist && painting.artist !== "Desconhecido" ? `Por ${painting.artist}.` : ""} ${painting.year && painting.year !== "Desconhecido" ? `Ano, ${painting.year}.` : ""}`;
        introBufferPromise = tts.generateSpeechBuffer(introText);
      }

      if (!isPaused && settings.musicEnabled) {
        generationTasks.push(lyria.connect(musicPrompt));
      }

      // 2. TTS Description
      if (settings.descriptionEnabled) {
        generationTasks.push(
          tts.generateSpeechBuffer(desc).then(buf => descriptionBufferRef.current = buf)
        );
      }

      // 3. TTS Analysis
      if (settings.analysisEnabled) {
        generationTasks.push(
          tts.generateSpeechBuffer(anal).then(buf => analysisBufferRef.current = buf)
        );
      }

      // 4. SFX
      if (settings.intentionEnabled && intention) {
        generationTasks.push(
          tts.generateSpeechBuffer(intention).then(buf => authorsIntentionBufferRef.current = buf)
        );
      }

      if (settings.sfxEnabled) {
        generationTasks.push(
          Promise.all(
            objects.map(async (obj: { SoundEffectPrompt: string, Pan?: string | number }) => {
              const buffer = await sfx.generateSfxBuffer(obj.SoundEffectPrompt);
              const pan = obj.Pan !== undefined ? parseFloat(obj.Pan.toString()) : 0;
              return buffer ? { buffer, pan: isNaN(pan) ? 0 : pan } : null;
            })
          ).then(results => {
            sfxBuffersRef.current = results.filter(r => r !== null) as { buffer: AudioBuffer; pan: number }[];
          })
        );
      }

      if (introBufferPromise) {
        try {
          const introBuffer = await introBufferPromise;
          if (introBuffer && !isPaused) {
            // Wait for system voice/announcements to finish
            await waitForSystemVoice();

            activeTtsCountRef.current++;
            try {
              if (settings.musicEnabled) lyria.setVolume(settings.masterVolume * 0.4, 0.8);
              await tts.playAudioBuffer(introBuffer, settings.masterVolume);
            } finally {
              activeTtsCountRef.current--;
              if (activeTtsCountRef.current === 0 && settings.musicEnabled) {
                lyria.setVolume(settings.masterVolume, 0.8);
              }
            }
          }
        } catch (error) {
          console.error("Intro playback failed:", error);
        }
      }

      await Promise.all(generationTasks);
      console.log("Parallel generation complete. All buffers ready.");

    } catch (error) {
      console.error("Orchestration failed:", error);
      lastPaintingId.current = null;
    } finally {
      setIsProcessing(false);
    }
  }, [gemini, lyria, tts, sfx, isProcessing, isPaused, activePainting, settings.musicEnabled, settings.descriptionEnabled, settings.analysisEnabled, settings.intentionEnabled, settings.sfxEnabled, waitForSystemVoice]);

  const { emit, sendFrame } = useYolo(processNewDetection, setDetectionStatus);
  emitRef.current = emit;

  const togglePause = useCallback(async () => {
    const nextState = !isPaused;
    setIsPaused(nextState);
    if (nextState) {
      lyria.pause();
    } else if (activePainting && settings.musicEnabled) {
      lyria.resume(settings.masterVolume);
    }
  }, [isPaused, lyria, activePainting, settings.musicEnabled, settings.masterVolume]);

  const setGlobalDucking = useCallback((isDucking: boolean) => {
    const vol = isDucking ? settings.masterVolume * 0.2 : settings.masterVolume;
    if (settings.musicEnabled && !isPaused) lyria.setVolume(vol, 0.3);
    if (settings.descriptionEnabled || settings.analysisEnabled || settings.intentionEnabled) tts.setVolume(vol, 0.3);
    if (settings.sfxEnabled) sfx.setVolume(vol, 0.3);
  }, [settings, isPaused, lyria, tts, sfx]);

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
    stopAll: async () => {
      emitRef.current?.("resume_detection", {});
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
      
      descriptionBufferRef.current = null;
      analysisBufferRef.current = null;
      authorsIntentionBufferRef.current = null;
      sfxBuffersRef.current = [];
      sfxPhase1DoneRef.current = false;
    }
  };
};
