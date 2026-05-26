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
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [detectionStatus, setDetectionStatus] = useState<string>("idle");
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
  const sfxBuffersRef = useRef<AudioBuffer[]>([]);

  const playScanningPing = useCallback(() => {
    if (!settings.sfxEnabled || isPaused) return;
    
    try {
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(settings.masterVolume * 0.1, ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      
      // Clean up context after sound plays
      setTimeout(() => {
        if (ctx.state !== 'closed') ctx.close();
      }, 700);
    } catch (e) {
      console.warn("Could not play scanning ping:", e);
    }
  }, [settings.masterVolume, settings.sfxEnabled, isPaused]);

  // Scanning Sound Loop Logic
  useEffect(() => {
    const shouldPulse = detectionStatus === 'idle' && !activePainting && !isPaused && !isProcessing;
    
    if (shouldPulse) {
      // Immediate first ping
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

  const playSfxSequentially = useCallback(async () => {
    if (!settings.sfxEnabled) return;
    const buffers = sfxBuffersRef.current;
    if (buffers.length === 0) return;
    
    try {
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume * 0.6);
      for (const buffer of buffers) {
        await sfx.playAudioBuffer(buffer, settings.masterVolume);
      }
    } finally {
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume);
    }
  }, [sfx, lyria, settings.sfxEnabled, settings.musicEnabled, settings.masterVolume]);

  const playDescription = useCallback(async () => {
    if (!descriptionBufferRef.current || isPaused || !settings.ttsEnabled) return;

    try {
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume * 0.4, 0.8);
      await tts.playAudioBuffer(descriptionBufferRef.current, settings.masterVolume);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume, 0.8);
    } catch (error) {
      console.error("Description playback failed:", error);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume);
    }
  }, [lyria, tts, isPaused, settings.ttsEnabled, settings.musicEnabled, settings.masterVolume]);

  const playAnalysis = useCallback(async () => {
    if (!analysisBufferRef.current || isPaused || !settings.ttsEnabled) return;

    try {
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume * 0.4, 0.8);
      await tts.playAudioBuffer(analysisBufferRef.current, settings.masterVolume);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume, 0.8);
      
      // Auto-play SFX after analysis if enabled
      if (settings.sfxEnabled) {
        await playSfxSequentially();
      }
    } catch (error) {
      console.error("Analysis playback failed:", error);
      if (settings.musicEnabled) lyria.setVolume(settings.masterVolume);
    }
  }, [lyria, tts, isPaused, playSfxSequentially, settings.ttsEnabled, settings.sfxEnabled, settings.musicEnabled, settings.masterVolume]);

  const processNewDetection = useCallback(async (painting: Painting) => {
    if (painting.id === lastPaintingId.current || isProcessing || isPaused) {
      return;
    }

    try {
      setIsProcessing(true);
      lastPaintingId.current = painting.id;
      setActivePainting(painting);
      
      // Clear old buffers
      descriptionBufferRef.current = null;
      analysisBufferRef.current = null;
      sfxBuffersRef.current = [];

      console.log(`Starting parallel analysis and generation for: ${painting.title}`);

      lyria.stop();

      const analysis = await gemini.analyzePainting(painting);

      // Send for server-side debug logging
      emitRef.current?.("save_analysis", { 
        title: painting.title, 
        analysis 
      });

      const musicPrompt = analysis.MusicPrompt?.Prompt || "";

      const desc = analysis.ArtDescription || "";
      const anal = analysis.ArtAnalysis || "";
      const objects = analysis.DetectedObjects || [];
      
      setCurrentPrompt(musicPrompt);
      setDescriptionText(desc);
      setAnalysisText(anal);

      // PARALLEL GENERATION
      console.log("Triggering parallel audio generation...");
      
      const generationTasks: Promise<any>[] = [];

      // 1. Music (Lyria)
      if (!isPaused && settings.musicEnabled) {
        generationTasks.push(lyria.connect(musicPrompt));
      }

      // 2. TTS Description
      if (settings.ttsEnabled) {
        generationTasks.push(
          tts.generateSpeechBuffer(desc).then(buf => descriptionBufferRef.current = buf)
        );
      }

      // 3. TTS Analysis
      if (settings.ttsEnabled) {
        generationTasks.push(
          tts.generateSpeechBuffer(anal).then(buf => analysisBufferRef.current = buf)
        );
      }

      // 4. SFX
      if (settings.sfxEnabled) {
        generationTasks.push(
          Promise.all(
            objects.map((obj: { SoundEffectPrompt: string }) => sfx.generateSfxBuffer(obj.SoundEffectPrompt))
          ).then(bufs => sfxBuffersRef.current = bufs.filter(b => b !== null) as AudioBuffer[])
        );
      }

      await Promise.all(generationTasks);
      console.log("Parallel generation complete. All buffers ready.");

      if (!isPaused && sfxBuffersRef.current.length > 0 && settings.sfxEnabled) {
        playSfxSequentially();
      }

    } catch (error) {
      console.error("Orchestration failed:", error);
      lastPaintingId.current = null;
    } finally {
      setIsProcessing(false);
    }
  }, [gemini, lyria, tts, sfx, isProcessing, isPaused, settings.musicEnabled, settings.ttsEnabled, settings.sfxEnabled, playSfxSequentially]);

  const { emit } = useYolo(processNewDetection, setDetectionStatus);
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

  return {
    isProcessing,
    activePainting,
    currentPrompt,
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
    stopAll: async () => {
      await lyria.stop();
      tts.stopAll();
      sfx.stopAll();
      setIsProcessing(false);
      lastPaintingId.current = null;
      setActivePainting(null);
      setCurrentPrompt("");
      setDescriptionText("");
      setAnalysisText("");
      setDetectionStatus("idle");
    }
  };
};
