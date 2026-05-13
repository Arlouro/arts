import { useState, useRef, useCallback, useMemo } from 'react';
import { GeminiService } from '../services/GeminiService.ts';
import { LyriaService } from '../services/LyriaService.ts';
import { GeminiTTSService } from '../services/GeminiTTSService.ts';
import { ElevenLabsService } from '../services/ElevenLabsService.ts';
import type { Painting } from '../types/painting.ts';
import { useYolo } from './useYolo.ts';

export const useOrchestrator = (apiKey: string, elevenLabsApiKey: string) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePainting, setActivePainting] = useState<Painting | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [descriptionText, setDescriptionText] = useState<string>("");
  const [analysisText, setAnalysisText] = useState<string>("");
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [detectionStatus, setDetectionStatus] = useState<string>("idle");

  const gemini = useMemo(() => new GeminiService(apiKey), [apiKey]);
  const lyria = useMemo(() => new LyriaService(apiKey), [apiKey]);
  const tts = useMemo(() => new GeminiTTSService(apiKey), [apiKey]);
  const sfx = useMemo(() => new ElevenLabsService(elevenLabsApiKey), [elevenLabsApiKey]);

  const lastPaintingId = useRef<string | number | null>(null);
  
  // Audio Buffers for Zero Latency
  const descriptionBufferRef = useRef<AudioBuffer | null>(null);
  const analysisBufferRef = useRef<AudioBuffer | null>(null);
  const sfxBuffersRef = useRef<AudioBuffer[]>([]);

  const saveJsonFile = useCallback((data: any, filename: string) => {
    const jsonData = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const playSfxSequentially = useCallback(async () => {
    const buffers = sfxBuffersRef.current;
    if (buffers.length === 0) return;
    
    console.log(`Playing pre-buffered SFX for ${buffers.length} objects. Mixing with music.`);
    try {
      lyria.setVolume(0.5);
      for (const buffer of buffers) {
        await sfx.playAudioBuffer(buffer);
      }
    } finally {
      lyria.setVolume(1.0);
    }
  }, [sfx, lyria]);

  const playDescription = useCallback(async () => {
    if (!descriptionBufferRef.current || isPaused) return;

    try {
      lyria.setVolume(0.1);
      await tts.playAudioBuffer(descriptionBufferRef.current);
      lyria.setVolume(1.0);
    } catch (error) {
      console.error("Description playback failed:", error);
      lyria.setVolume(1.0);
    }
  }, [lyria, tts, isPaused]);

  const playAnalysis = useCallback(async () => {
    if (!analysisBufferRef.current || isPaused) return;

    try {
      lyria.setVolume(0.1);
      await tts.playAudioBuffer(analysisBufferRef.current);
      lyria.setVolume(1.0);
    } catch (error) {
      console.error("Analysis playback failed:", error);
      lyria.setVolume(1.0);
    }
  }, [lyria, tts, isPaused, playSfxSequentially]);

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
      
      saveJsonFile(analysis, `analysis_${painting.title.replace(/\s+/g, '_')}.json`);
      
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
      if (!isPaused) {
        generationTasks.push(lyria.connect(musicPrompt));
      }

      // 2. TTS Description
      generationTasks.push(
        tts.generateSpeechBuffer(desc).then(buf => descriptionBufferRef.current = buf)
      );

      // 3. TTS Analysis
      generationTasks.push(
        tts.generateSpeechBuffer(anal).then(buf => analysisBufferRef.current = buf)
      );

      // 4. SFX
      generationTasks.push(
        Promise.all(
          objects.map((obj: { SoundEffectPrompt: string }) => sfx.generateSfxBuffer(obj.SoundEffectPrompt))
        ).then(bufs => sfxBuffersRef.current = bufs.filter(b => b !== null) as AudioBuffer[])
      );

      await Promise.all(generationTasks);
      console.log("Parallel generation complete. All buffers ready.");

      if (!isPaused && sfxBuffersRef.current.length > 0) {
        playSfxSequentially();
      }

    } catch (error) {
      console.error("Orchestration failed:", error);
      lastPaintingId.current = null;
    } finally {
      setIsProcessing(false);
    }
  }, [gemini, lyria, tts, sfx, isProcessing, saveJsonFile, isPaused]);

  useYolo(processNewDetection, setDetectionStatus);

  const togglePause = useCallback(() => {
    const nextState = !isPaused;
    setIsPaused(nextState);
    if (nextState) {
      lyria.stop();
    } else if (currentPrompt && activePainting) {
      lyria.connect(currentPrompt);
    }
  }, [isPaused, lyria, currentPrompt, activePainting]);

  return {
    isProcessing,
    activePainting,
    currentPrompt,
    detectionStatus,
    descriptionText,
    analysisText,
    isPaused,
    playDescription,
    playAnalysis,
    togglePause,
    processNewDetection,
    stopAll: () => {
      lyria.stop();
      lastPaintingId.current = null;
      setActivePainting(null);
      setCurrentPrompt("");
      setDescriptionText("");
      setAnalysisText("");
      setDetectionStatus("idle");
    }
  };
};
