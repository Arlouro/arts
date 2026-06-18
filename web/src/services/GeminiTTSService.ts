import { decode } from "base64-arraybuffer";
import { withRetry, isRetryableError } from "../utils/retry.ts";

const API_BASE_URL = `${import.meta.env.VITE_RELAY_SERVER_URL || "http://localhost:8000"}/api`;

export class GeminiTTSService {
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

  async generateSpeechBuffer(text: string): Promise<AudioBuffer | null> {
    this.initAudio();

    try {
      return await withRetry(
        async () => {
          const response = await fetch(`${API_BASE_URL}/tts/gemini`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `TTS proxy responded with ${response.status}`);
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

    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;
      
      const gainNode = this.audioContext!.createGain();
      const nodeEntry = { source, gainNode };
      this.activeNodes.add(nodeEntry);
      
      const now = this.audioContext!.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      
      source.connect(gainNode);
      gainNode.connect(this.audioContext!.destination);
      
      gainNode.gain.linearRampToValueAtTime(volume, now + 0.3);
      
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

  async textToSpeech(text: string): Promise<void> {
    const buffer = await this.generateSpeechBuffer(text);
    if (buffer) {
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
