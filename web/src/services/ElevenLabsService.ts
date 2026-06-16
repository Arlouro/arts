import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { withRetry, isRetryableError } from "../utils/retry.ts";

export class ElevenLabsService {
  private client: ElevenLabsClient;
  private audioContext: AudioContext | null = null;
  private activeNodes: Set<{ source: AudioBufferSourceNode, gainNode: GainNode }> = new Set();

  constructor(apiKey: string) {
    this.client = new ElevenLabsClient({
      apiKey: apiKey,
    });
  }

  private initAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  async generateSfxBuffer(prompt: string): Promise<AudioBuffer | null> {
    this.initAudio();

    try {
      return await withRetry(
        async () => {
          const audioStream = await this.client.textToSoundEffects.convert({
            text: prompt,
            durationSeconds: 5,
            promptInfluence: 0.3,
          });

          const chunks: Uint8Array[] = [];
          for await (const chunk of audioStream as any) {
            chunks.push(chunk);
          }

          if (chunks.length === 0) throw new Error('ElevenLabs returned empty audio stream');

          const audioBlob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
          const arrayBuffer = await audioBlob.arrayBuffer();
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

  async generateAndPlaySfx(prompt: string, pan: number = 0): Promise<void> {
    const buffer = await this.generateSfxBuffer(prompt);
    if (buffer) {
      await this.playAudioBuffer(buffer, 0.6, pan);
    }
  }
}
