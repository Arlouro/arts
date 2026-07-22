import { GoogleGenAI, Scale, MusicGenerationMode, type LiveMusicGenerationConfig } from "@google/genai";
import { decode } from "base64-arraybuffer";
import type { LyriaMessage, ServiceStatus } from "../types/lyria";
import { withRetry } from "../utils/retry.ts";

function isLyriaConnectRetriable(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('rate') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('websocket') ||
      msg.includes('connect') ||
      msg.includes('fetch')
    );
  }
  return false;
}

export class LyriaService {
  private lyria: GoogleGenAI;
  private session: Awaited<ReturnType<GoogleGenAI["live"]["music"]["connect"]>> | null = null;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime: number = 0;
  private readonly SCHEDULE_LEAD = 0.15;

  public onStatusChange?: (status: ServiceStatus) => void;

  constructor(apiKey: string) {
    this.lyria = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
  }

  private setStatus(status: ServiceStatus) {
    this.onStatusChange?.(status);
  }

  private async initAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 48000 });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);

      if (this.audioContext.sampleRate !== 48000) {
        console.warn(
          `Lyria: AudioContext runs at ${this.audioContext.sampleRate}Hz, not the ` +
          `requested 48000Hz. Per-chunk resampling may introduce seam artifacts.`
        );
      }
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public async prepareAudio() {
    await this.initAudio();
  }

  public setVolume(volume: number, rampTime: number = 0.4) {
    if (this.gainNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      if (rampTime <= 0) {
        this.gainNode.gain.setValueAtTime(volume, now);
      } else {
        this.gainNode.gain.setTargetAtTime(volume, now, rampTime / 3);
      }
    }
  }

  public async connect(prompt: string, startMuted: boolean = false, rawConfig?: unknown) {
    try {
      this.setStatus('connecting');
      await this.initAudio();
      this.setVolume(startMuted ? 0 : 1.0, startMuted ? 0 : 0.4);

      const musicConfig = this.buildMusicConfig(rawConfig);
      const weightedPrompts = [{ text: prompt || "calm ambient soundscape", weight: 1.0 }];

      await withRetry(
        async () => {
          if (this.session) {
            this.session.close();
            this.session = null;
          }

          this.session = await this.lyria.live.music.connect({
            model: "lyria-realtime-exp",
            callbacks: {
              onmessage: (msg) => this.handleMessage(msg as LyriaMessage),
              onerror: (err) => {
                console.error(err);
                this.setStatus('error');
              },
              onclose: () => this.stop(),
            },
          });
          await this.session.setWeightedPrompts({ weightedPrompts });

          if (musicConfig) {
            await this.session.setMusicGenerationConfig({ musicGenerationConfig: musicConfig });
            console.log("Applied Lyria music config:", musicConfig);
          }

          await this.session.play();
        },
        { maxAttempts: 3, baseDelayMs: 2000, shouldRetry: isLyriaConnectRetriable }
      );

      this.setStatus('playing');
      console.log("Lyria Stream is now open and ready.");

    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }
  
  private buildMusicConfig(raw: unknown): LiveMusicGenerationConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const r = raw as Record<string, unknown>;

    const config: LiveMusicGenerationConfig = {};

    const num = (v: unknown): number | undefined => {
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return typeof n === 'number' && !isNaN(n) ? n : undefined;
    };
    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
    const bool = (v: unknown): boolean | undefined => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (s === 'true') return true;
        if (s === 'false') return false;
      }
      return undefined;
    };

    const guidance = num(r.Guidance ?? r.guidance);
    if (guidance !== undefined) config.guidance = clamp(guidance, 0, 6);

    const bpm = num(r.bpm ?? r.BPM);
    if (bpm !== undefined) config.bpm = clamp(Math.round(bpm), 60, 200);

    const density = num(r.Density ?? r.density);
    if (density !== undefined) config.density = clamp(density, 0, 1);

    const brightness = num(r.Brightness ?? r.brightness);
    if (brightness !== undefined) config.brightness = clamp(brightness, 0, 1);

    const scaleRaw = r.Scale ?? r.scale;
    if (typeof scaleRaw === 'string') {
      const key = scaleRaw.trim().toUpperCase();
      if ((Object.values(Scale) as string[]).includes(key) && key !== Scale.SCALE_UNSPECIFIED) {
        config.scale = key as Scale;
      }
    }

    const muteBass = bool(r['Mute-bass'] ?? r.muteBass);
    if (muteBass !== undefined) config.muteBass = muteBass;

    const muteDrums = bool(r['Mute-drums'] ?? r.muteDrums);
    if (muteDrums !== undefined) config.muteDrums = muteDrums;

    const onlyBassAndDrums = bool(r['Only-bass-and-drums'] ?? r.onlyBassAndDrums);
    if (onlyBassAndDrums !== undefined) config.onlyBassAndDrums = onlyBassAndDrums;

    const modeRaw = r['Music-generation-mode'] ?? r.musicGenerationMode;
    if (typeof modeRaw === 'string') {
      const key = modeRaw.trim().toUpperCase();
      if ((Object.values(MusicGenerationMode) as string[]).includes(key) &&
          key !== MusicGenerationMode.MUSIC_GENERATION_MODE_UNSPECIFIED) {
        config.musicGenerationMode = key as MusicGenerationMode;
      }
    }

    return Object.keys(config).length > 0 ? config : undefined;
  }

  private async handleMessage(message: LyriaMessage) {
    const chunk = message.serverContent?.audioChunks?.[0];
    if (chunk && this.audioContext) {
      const arrayBuffer = decode(chunk.data);
      const audioBuffer = this.pcmToAudioBuffer(arrayBuffer);
      this.schedulePlayback(audioBuffer);
    }
  }

  private pcmToAudioBuffer(arrayBuffer: ArrayBuffer): AudioBuffer {
    const numChannels = 2;
    const sampleRate = 48000;

    const numSamples = arrayBuffer.byteLength / 2;
    const numFrames = numSamples / numChannels;

    const audioBuffer = this.audioContext!.createBuffer(numChannels, numFrames, sampleRate);

    const int16Data = new Int16Array(arrayBuffer);

    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.getChannelData(1);

    for (let i = 0; i < numFrames; i++) {
      leftChannel[i] = int16Data[i * 2] / 32768.0;
      rightChannel[i] = int16Data[i * 2 + 1] / 32768.0;
    }

    return audioBuffer;
  }

  private schedulePlayback(buffer: AudioBuffer) {
    if (!this.audioContext || !this.gainNode) return;

    const now = this.audioContext.currentTime;

    if (this.nextStartTime < now + 0.02) {
      this.nextStartTime = now + this.SCHEDULE_LEAD;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
  }

  public pause() {
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
    }
    if (this.session) {
      this.session.pause();
    }
    this.setStatus('idle');
  }

  public resume(volume: number) {
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.3);
    }
    if (this.session) {
      this.session.play();
    }
    this.setStatus('playing');
  }

  public async stop() {
    if (this.gainNode && this.audioContext && this.session) {
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    this.session?.close();
    this.session = null;
    this.nextStartTime = 0;
    this.setStatus('idle');
  }
  }