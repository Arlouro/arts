import { GoogleGenAI, Scale, MusicGenerationMode, type LiveMusicGenerationConfig } from "@google/genai";
import { decode } from "base64-arraybuffer";
import type { LyriaMessage, ServiceStatus } from "../types/lyria";
import { withRetry } from "../utils/retry.ts";
import { computeArcShape, tensionAt, type ArcShape } from "../utils/affect.ts";

const SAMPLE_RATE = 48000;
const LOOP_CAPTURE_SECONDS = 90;
const LOOP_CROSSFADE_SECONDS = 3;
const LIVE_MAX_SECONDS = 180;      
const RECONNECT_MAX_ATTEMPTS = 4; 
const RECONNECT_BASE_DELAY_MS = 1500;

const ARC_ENABLED = true;
const ARC_STEP_SECONDS = 12;
const ARC_VALENCE_BRIGHTNESS_BIAS = 0.15; // valence → timbre
const ARC_BRIGHTNESS_GAIN = 0.35;         // energy Δ → brightness swing
const ARC_DENSITY_GAIN = 0.30;            // energy Δ → density swing
const ARC_EASEIN = 0.5;

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

type PlaybackMode = 'idle' | 'live' | 'loop';

export class LyriaService {
  private lyria: GoogleGenAI;
  private session: Awaited<ReturnType<GoogleGenAI["live"]["music"]["connect"]>> | null = null;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime: number = 0;

  private mode: PlaybackMode = 'idle';
  private recording = false;
  private recordedChunks: AudioBuffer[] = [];
  private recordedFrames = 0;
  private loopBuffer: AudioBuffer | null = null;
  private loopSource: AudioBufferSourceNode | null = null;

  private intentionalStop = false;
  private paused = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;

  private weightedPrompts: { text: string; weight: number }[] = [];
  private baseConfig: LiveMusicGenerationConfig | undefined;

  private arcTimer: number | null = null;
  private arcStartTime = 0;
  private arcShape: ArcShape | null = null;
  private liveCapTimer: number | null = null;
  private pausedAt = 0;
  private liveCapRemainingMs = LIVE_MAX_SECONDS * 1000;
  private liveCapArmedAt = 0;

  public onStatusChange?: (status: ServiceStatus) => void;

  constructor(apiKey: string) {
    this.lyria = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
  }

  private setStatus(status: ServiceStatus) {
    this.onStatusChange?.(status);
  }

  private nowMs(): number {
    return (this.audioContext?.currentTime ?? 0) * 1000;
  }

  private async initAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public setVolume(volume: number, rampTime: number = 0.4) {
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + rampTime);
    }
  }

  public async connect(
    prompt: string,
    startMuted: boolean = false,
    rawConfig?: unknown,
    arcInput?: { emotions?: string[]; objectCount?: number },
  ) {
    try {
      this.setStatus('connecting');
      await this.initAudio();
      this.setVolume(startMuted ? 0 : 1.0);

      this.resetPlaybackState();
      this.intentionalStop = false;
      this.paused = false;
      this.reconnectAttempts = 0;

      this.baseConfig = this.buildMusicConfig(rawConfig);
      this.weightedPrompts = [{ text: prompt || "calm ambient soundscape", weight: 1.0 }];
      this.arcShape = computeArcShape(arcInput?.emotions, arcInput?.objectCount ?? 0);

      await withRetry(
        () => this.openSession(),
        { maxAttempts: 3, baseDelayMs: 2000, shouldRetry: isLyriaConnectRetriable }
      );

      this.recording = true;
      this.mode = 'live';
      this.scheduleLiveCap();

      this.startArc();

      this.setStatus('playing');
      console.log("Lyria stream open (live). Recording loop + arc active.");
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
  }

  private async openSession() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }

    this.session = await this.lyria.live.music.connect({
      model: "lyria-realtime-exp",
      callbacks: {
        onmessage: (msg) => this.handleMessage(msg as LyriaMessage),
        onerror: (err) => {
          console.error("Lyria session error:", err);
          this.handleDrop('error');
        },
        onclose: () => this.handleDrop('close'),
      },
    });

    await this.session.setWeightedPrompts({ weightedPrompts: this.weightedPrompts });
    if (this.baseConfig) {
      await this.session.setMusicGenerationConfig({ musicGenerationConfig: this.baseConfig });
      console.log("Applied Lyria music config:", this.baseConfig);
    }
    await this.session.play();
  }

  private handleDrop(reason: 'close' | 'error') {
    if (this.intentionalStop || this.mode === 'loop') return;

    if (this.loopBuffer) {
      console.log(`Lyria ${reason}: handing off to local loop.`);
      this.startLoopFallback();
      return;
    }
    this.attemptReconnect();
  }

  private attemptReconnect() {
    if (this.intentionalStop) return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      if (this.loopBuffer) this.startLoopFallback();
      else this.setStatus('error');
      return;
    }
    this.reconnectAttempts++;
    this.setStatus('connecting');
    const delay = RECONNECT_BASE_DELAY_MS * this.reconnectAttempts;
    console.log(`Lyria reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(async () => {
      try {
        await this.openSession();
        this.reconnectAttempts = 0;
        this.mode = 'live';
        this.setStatus('playing');
        console.log("Lyria reconnected.");
      } catch (err) {
        console.warn("Reconnect failed:", err);
        this.attemptReconnect();
      }
    }, delay);
  }

  private scheduleLiveCap() {
    if (this.liveCapTimer) clearTimeout(this.liveCapTimer);
    this.liveCapArmedAt = this.nowMs();
    this.liveCapTimer = window.setTimeout(() => this.handleLiveCap(), this.liveCapRemainingMs);
  }

  private handleLiveCap() {
    if (this.paused || this.mode !== 'live') return;
    if (this.loopBuffer) {
      console.log("Lyria live cap reached: switching to local loop to save cost.");
      this.startLoopFallback();
    } else {
      this.liveCapTimer = window.setTimeout(() => this.handleLiveCap(), 5000);
    }
  }

  private startLoopFallback() {
    if (!this.audioContext || !this.gainNode || !this.loopBuffer) return;

    this.mode = 'loop';
    this.recording = false;
    this.stopArc();
    if (this.liveCapTimer) { clearTimeout(this.liveCapTimer); this.liveCapTimer = null; }

    this.session?.close();
    this.session = null;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.loopBuffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = this.loopBuffer.duration;
    source.connect(this.gainNode);
    source.start(Math.max(this.audioContext.currentTime, this.nextStartTime - LOOP_CROSSFADE_SECONDS));
    this.loopSource = source;
    this.setStatus('playing');
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

  private startArc() {
    if (!ARC_ENABLED || !this.audioContext) return;
    this.stopArc();
    this.arcStartTime = this.audioContext.currentTime;
    this.arcTimer = window.setInterval(() => this.stepArc(), ARC_STEP_SECONDS * 1000);
  }

  private stopArc() {
    if (this.arcTimer) { clearInterval(this.arcTimer); this.arcTimer = null; }
  }

  private stepArc() {
    if (this.paused || this.mode !== 'live' || !this.session || !this.audioContext) return;
    const arc = this.arcShape;
    if (!arc) return;

    const elapsed = this.audioContext.currentTime - this.arcStartTime;
    const t = Math.min(1, Math.max(0, elapsed / arc.totalSeconds));
    const tension = tensionAt(t, arc.climaxPos); // 0 → 1 (at climaxPos) → 0

    const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

 const easeIn = ARC_EASEIN * arc.complexity * arc.homeArousal;
    const eStart = Math.max(0, arc.homeArousal - easeIn);
    const ePeak = arc.peakArousal;                      
    const energy = eStart + (ePeak - eStart) * tension;
    const dEnergy = energy - arc.homeArousal;

    const homeBrightness = clamp((this.baseConfig?.brightness ?? 0.5)
      + ARC_VALENCE_BRIGHTNESS_BIAS * arc.homeValence, 0, 1);
    const baseDensity = this.baseConfig?.density ?? 0.5;

    const merged: LiveMusicGenerationConfig = {
      ...(this.baseConfig ?? {}),
      brightness: clamp(homeBrightness + ARC_BRIGHTNESS_GAIN * dEnergy, 0, 1),
      density: clamp(baseDensity + ARC_DENSITY_GAIN * dEnergy, 0, 1),
    };

    this.session
      .setMusicGenerationConfig({ musicGenerationConfig: merged })
      .catch((e) => console.warn("Arc config update failed:", e));

    if (elapsed >= arc.totalSeconds) this.stopArc();
  }

  private async handleMessage(message: LyriaMessage) {
    const chunk = message.serverContent?.audioChunks?.[0];
    if (chunk && this.audioContext) {
      const arrayBuffer = decode(chunk.data);
      const audioBuffer = this.pcmToAudioBuffer(arrayBuffer);
      if (this.mode === 'live') this.schedulePlayback(audioBuffer);
      if (this.recording) this.captureChunk(audioBuffer);
    }
  }

  private captureChunk(buffer: AudioBuffer) {
    this.recordedChunks.push(buffer);
    this.recordedFrames += buffer.length;
    if (!this.loopBuffer && this.recordedFrames >= LOOP_CAPTURE_SECONDS * SAMPLE_RATE) {
      this.buildLoopFromChunks();
      this.recording = false;
      this.recordedChunks = [];
      this.recordedFrames = 0;
    }
  }

  private buildLoopFromChunks() {
    if (!this.audioContext || this.recordedChunks.length === 0) return;
    const ch = 2;
    const total = this.recordedFrames;
    const xf = Math.min(Math.floor(LOOP_CROSSFADE_SECONDS * SAMPLE_RATE), Math.floor(total / 3));
    if (total <= xf * 2) return;
    const newLen = total - xf;

    const out = this.audioContext.createBuffer(ch, newLen, SAMPLE_RATE);
    for (let c = 0; c < ch; c++) {
      const orig = new Float32Array(total);
      let o = 0;
      for (const buf of this.recordedChunks) {
        orig.set(buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)), o);
        o += buf.length;
      }
      const dst = out.getChannelData(c);
      dst.set(orig.subarray(xf, newLen), xf);
      for (let i = 0; i < xf; i++) {
        const p = i / xf;
        const fin = Math.sin(0.5 * Math.PI * p);
        const fout = Math.cos(0.5 * Math.PI * p);
        dst[i] = orig[i] * fin + orig[newLen + i] * fout;
      }
    }
    this.loopBuffer = out;
    console.log(`Local loop ready: ${newLen / SAMPLE_RATE}s seamless.`);
  }

  private pcmToAudioBuffer(arrayBuffer: ArrayBuffer): AudioBuffer {
    const numChannels = 2;

    const numSamples = arrayBuffer.byteLength / 2;
    const numFrames = numSamples / numChannels;

    const audioBuffer = this.audioContext!.createBuffer(numChannels, numFrames, SAMPLE_RATE);

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
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    source.connect(this.gainNode);

    const start = Math.max(this.audioContext.currentTime, this.nextStartTime);
    source.start(start);
    this.nextStartTime = start + buffer.duration;
  }

  public pause() {
    this.paused = true;
    this.pausedAt = this.nowMs();
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
    }
    if (this.liveCapTimer) {
      this.liveCapRemainingMs = Math.max(0, this.liveCapRemainingMs - (this.nowMs() - this.liveCapArmedAt));
      clearTimeout(this.liveCapTimer);
      this.liveCapTimer = null;
    }
    if (this.mode === 'live') this.session?.pause();
    this.setStatus('idle');
  }

  public resume(volume: number) {
    this.paused = false;
    if (this.pausedAt) this.arcStartTime += this.nowMs() / 1000 - this.pausedAt / 1000;
    this.pausedAt = 0;
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.3);
    }
    if (this.mode === 'live') {
      this.session?.play();
      if (this.liveCapRemainingMs > 0 && !this.liveCapTimer) this.scheduleLiveCap();
    }
    this.setStatus('playing');
  }

  private resetPlaybackState() {
    this.stopArc();
    this.arcShape = null;
    this.pausedAt = 0;
    this.liveCapRemainingMs = LIVE_MAX_SECONDS * 1000;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.liveCapTimer) { clearTimeout(this.liveCapTimer); this.liveCapTimer = null; }
    try { this.loopSource?.stop(); } catch { /* already stopped */ }
    this.loopSource = null;
    this.loopBuffer = null;
    this.recordedChunks = [];
    this.recordedFrames = 0;
    this.recording = false;
    this.nextStartTime = 0;
    this.mode = 'idle';
  }

  public async stop() {
    this.intentionalStop = true;
    if (this.gainNode && this.audioContext && (this.session || this.loopSource)) {
      this.gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
      await new Promise(resolve => setTimeout(resolve, 350));
    }
    this.session?.close();
    this.session = null;
    this.resetPlaybackState();
    this.setStatus('idle');
  }
}
