import { GoogleGenAI } from "@google/genai";
import { decode } from "base64-arraybuffer";
import type { LyriaMessage, ServiceStatus } from "../types/lyria";

export class LyriaService {
  private lyria: GoogleGenAI;
  private session: Awaited<ReturnType<GoogleGenAI["live"]["music"]["connect"]>> | null = null;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime: number = 0;

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

  public async connect(prompt: string) {
    try {
      this.setStatus('connecting');
      await this.initAudio();
      this.setVolume(1.0);


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

      this.setStatus('playing');
      console.log("Lyria Stream is now open and ready.");

      await this.session.setWeightedPrompts({
        weightedPrompts: [{ text: prompt, weight: 1.0 }],
      });

      await this.session.play();
    } catch (error) {
      this.setStatus('error');
      throw error;
    }
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
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    source.connect(this.gainNode);

    const start = Math.max(this.audioContext.currentTime, this.nextStartTime);
    source.start(start);
    this.nextStartTime = start + buffer.duration;
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