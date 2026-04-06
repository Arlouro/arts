import { GoogleGenAI } from "@google/genai";
import { decode } from "base64-arraybuffer";
import type { LyriaMessage, ServiceStatus } from "../types/lyria";

export class LyriaService {
  private client: GoogleGenAI;
  private session: Awaited<ReturnType<GoogleGenAI["live"]["music"]["connect"]>> | null = null;
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  
  // Callback for the UI to update its state
  public onStatusChange?: (status: ServiceStatus) => void;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
  }

  private setStatus(status: ServiceStatus) {
    this.onStatusChange?.(status);
  }

  private async initAudio() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 48000 });
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  public async connect(prompt: string) {
  try {
    this.setStatus('connecting');
    await this.initAudio();

    this.session = await this.client.live.music.connect({
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

    // De-interleave: Lyria sends [L, R, L, R...]
    // We need to move L to the left channel and R to the right channel
    for (let i = 0; i < numFrames; i++) {
      // Convert 16-bit integer (-32768 to 32767) to Float (-1.0 to 1.0)
      leftChannel[i] = int16Data[i * 2] / 32768.0;
      rightChannel[i] = int16Data[i * 2 + 1] / 32768.0;
    }

    return audioBuffer;
  }

  private schedulePlayback(buffer: AudioBuffer) {
    if (!this.audioContext) return;
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const start = Math.max(this.audioContext.currentTime, this.nextStartTime);
    source.start(start);
    this.nextStartTime = start + buffer.duration;
  }

  public stop() {
    this.session?.close();
    this.session = null;
    this.nextStartTime = 0;
    this.setStatus('idle');
  }
}