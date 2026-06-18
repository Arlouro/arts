import { decode } from "base64-arraybuffer";
import { withRetry, isRetryableError } from "../utils/retry.ts";

const API_BASE_URL = `${import.meta.env.VITE_RELAY_SERVER_URL || "http://localhost:8000"}/api`;

export class ElevenLabsService {
  private audioContext: AudioContext | null = null;
  private activeNodes: Set<{ source: AudioBufferSourceNode, gainNode: GainNode }> = new Set();

  constructor() {
  }

  private initAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  async generateSfxBuffer(prompt: string, signal?: AbortSignal): Promise<AudioBuffer | null> {
    this.initAudio();

    try {
      return await withRetry(
        async () => {
          const response = await fetch(`${API_BASE_URL}/sfx`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
            signal
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `SFX proxy responded with ${response.status}`);
          }

          const { audioData: base64Audio } = await response.json();
          if (!base64Audio) throw new Error('SFX proxy returned empty audio data');

          const arrayBuffer = decode(base64Audio);
          return await this.audioContext!.decodeAudioData(arrayBuffer);
        },
        { maxAttempts: 3, baseDelayMs: 1500, shouldRetry: isRetryableError }
      );
    } catch (error) {
      console.error("ElevenLabs generation error after retries:", error);
      return null;
    }
  }

  async playAudioBuffer(buffer: AudioBuffer, volume: number = 0.6, pan: number = 0): Promise<void> {
    if (!this.audioContext) return;
    
    const adjustedVolume = volume * 0.5; 

    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;

      const gainNode = this.audioContext!.createGain();
      const pannerNode = this.audioContext!.createStereoPanner();
      
      pannerNode.pan.value = Math.max(-1, Math.min(1, pan));

      const nodeEntry = { source, gainNode };
      this.activeNodes.add(nodeEntry);

      const now = this.audioContext!.currentTime;
      const duration = buffer.duration;
      
      const fadeDuration = Math.min(1.5, duration / 3);
      
      gainNode.gain.setValueAtTime(0, now);
      
      source.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(this.audioContext!.destination);
      
      // Smooth Ramp Up
      gainNode.gain.linearRampToValueAtTime(adjustedVolume, now + fadeDuration);
      
      // Smooth Ramp Down before the sound ends
      if (duration > fadeDuration) {
        gainNode.gain.setValueAtTime(adjustedVolume, now + duration - fadeDuration);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);
      }
      
      source.onended = () => {
        this.activeNodes.delete(nodeEntry);
        resolve();
      };
      source.start(now);
    });
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
  }

  async generateAndPlaySfx(prompt: string, pan: number = 0, signal?: AbortSignal): Promise<void> {
    const buffer = await this.generateSfxBuffer(prompt, signal);
    if (buffer && (!signal || !signal.aborted)) {
      await this.playAudioBuffer(buffer, 0.6, pan);
    }
  }
}
