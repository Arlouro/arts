import { decode } from "base64-arraybuffer";
import { withRetry, isRetryableError, HttpError } from "../utils/retry.ts";
import { getSharedAudioContext } from "../utils/sharedAudio.ts";

const API_BASE_URL = `${import.meta.env.VITE_RELAY_SERVER_URL || (import.meta.env.DEV ? "http://localhost:8000" : "")}/api`;

export class GeminiTTSService {
  private audioContext: AudioContext | null = null;
  private activeNodes: Set<{ source: AudioBufferSourceNode, gainNode: GainNode }> = new Set();

  private currentBuffer: AudioBuffer | null = null;
  private currentVolume: number = 1.0;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentGain: GainNode | null = null;
  private segmentStartTime: number = 0;   // audioContext.currentTime when the current segment started
  private playbackOffset: number = 0;     // seconds into the buffer where the current segment began
  private isPaused: boolean = false;
  private resolveCurrent: (() => void) | null = null;

  constructor() {
  }

  private initAudio() {
    if (!this.audioContext) {
      this.audioContext = getSharedAudioContext();
    }
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  public prepareAudio() {
    this.initAudio();
  }

  async generateSpeechBuffer(text: string, signal?: AbortSignal): Promise<AudioBuffer | null> {
    this.initAudio();

    try {
      return await withRetry(
        async () => {
          const response = await fetch(`${API_BASE_URL}/tts/gemini`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new HttpError(response.status, errorData.error || `TTS proxy responded with ${response.status}`);
          }

          const { audioData: base64Audio } = await response.json();

          if (!base64Audio) throw new Error('TTS proxy returned empty audio data');

          const arrayBuffer = decode(base64Audio);
          return await this.pcmToAudioBuffer(arrayBuffer, 24000);
        },
        { maxAttempts: 3, baseDelayMs: 1500, shouldRetry: isRetryableError }
      );
    } catch (error) {
      console.error("TTS generation error after retries:", error);
      return null;
    }
  }

  async playAudioBuffer(buffer: AudioBuffer, volume: number = 1.0): Promise<void> {
    if (!this.audioContext) return;

    this.stopAll(0.3);

    this.currentBuffer = buffer;
    this.currentVolume = volume;
    this.playbackOffset = 0;
    this.isPaused = false;

    return new Promise((resolve) => {
      this.resolveCurrent = resolve;
      this.startSegment(0, true);
    });
  }

  private startSegment(offsetSeconds: number, fadeIn: boolean) {
    if (!this.audioContext || !this.currentBuffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.currentBuffer;

    const gainNode = this.audioContext.createGain();
    const nodeEntry = { source, gainNode };
    this.activeNodes.add(nodeEntry);

    this.currentSource = source;
    this.currentGain = gainNode;

    const now = this.audioContext.currentTime;
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    if (fadeIn) {
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(this.currentVolume, now + 0.3);
    } else {
      gainNode.gain.setValueAtTime(this.currentVolume, now);
    }

    this.segmentStartTime = now;
    this.playbackOffset = offsetSeconds;

    source.onended = () => {
      this.activeNodes.delete(nodeEntry);
      if (this.isPaused || this.currentSource !== source) return;

      this.currentSource = null;
      this.currentGain = null;
      this.currentBuffer = null;
      const resolve = this.resolveCurrent;
      this.resolveCurrent = null;
      resolve?.();
    };

    source.start(now, offsetSeconds);
  }

  public pause() {
    if (!this.audioContext || this.isPaused || !this.currentSource) return;

    this.isPaused = true;
    const now = this.audioContext.currentTime;
    this.playbackOffset += now - this.segmentStartTime;

    try {
      this.currentGain?.gain.cancelScheduledValues(now);
      this.currentGain?.gain.setValueAtTime(this.currentGain.gain.value, now);
      this.currentGain?.gain.linearRampToValueAtTime(0, now + 0.1);
      this.currentSource.stop(now + 0.12);
    } catch (e) {}

    this.currentSource = null;
    this.currentGain = null;
  }

  public resume() {
    if (!this.audioContext || !this.isPaused || !this.currentBuffer) return;

    this.isPaused = false;

    if (this.playbackOffset >= this.currentBuffer.duration) {
      this.currentBuffer = null;
      const resolve = this.resolveCurrent;
      this.resolveCurrent = null;
      resolve?.();
      return;
    }

    this.startSegment(this.playbackOffset, true);
  }

  public setVolume(volume: number, fadeDuration = 0.3) {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    
    this.activeNodes.forEach(({ gainNode }) => {
      try {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + fadeDuration);
      } catch (e) {}
    });
  }

  public stopAll(fadeDuration = 0.3) {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;

    this.activeNodes.forEach(({ source, gainNode }) => {
      try {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + fadeDuration);
        source.stop(now + fadeDuration);
      } catch (e) {}
    });
    this.activeNodes.clear();

    this.isPaused = false;
    this.currentSource = null;
    this.currentGain = null;
    this.currentBuffer = null;
    this.playbackOffset = 0;
    const resolve = this.resolveCurrent;
    this.resolveCurrent = null;
    resolve?.();
  }

  async textToSpeech(text: string, signal?: AbortSignal): Promise<void> {
    const buffer = await this.generateSpeechBuffer(text, signal);
    if (buffer && (!signal || !signal.aborted)) {
      await this.playAudioBuffer(buffer);
    }
  }

  private async pcmToAudioBuffer(arrayBuffer: ArrayBuffer, sampleRate: number): Promise<AudioBuffer> {
    const numChannels = 1;
    const numSamples = arrayBuffer.byteLength / 2;
    const audioBuffer = this.audioContext!.createBuffer(numChannels, numSamples, sampleRate);
    
    const int16Data = new Int16Array(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      channelData[i] = int16Data[i] / 32768.0;
    }

    return audioBuffer;
  }
}
