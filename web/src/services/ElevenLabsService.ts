import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export class ElevenLabsService {
  private client: ElevenLabsClient;
  private audioContext: AudioContext | null = null;

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
    console.log(`Generating SFX buffer for: ${prompt}`);

    try {
      const audioStream = await this.client.textToSoundEffects.convert({
        text: prompt,
        durationSeconds: 5,
        promptInfluence: 0.3,
      });

      const chunks: Uint8Array[] = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }

      const audioBlob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
      const arrayBuffer = await audioBlob.arrayBuffer();
      return await this.audioContext!.decodeAudioData(arrayBuffer);
    } catch (error) {
      console.error("ElevenLabs generation error:", error);
      return null;
    }
  }

  async playAudioBuffer(buffer: AudioBuffer, volume: number = 0.6): Promise<void> {
    if (!this.audioContext) return;
    
    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;

      const gainNode = this.audioContext!.createGain();
      gainNode.gain.value = volume;

      source.connect(gainNode);
      gainNode.gain.linearRampToValueAtTime(volume, this.audioContext!.currentTime + 0.1);
      gainNode.connect(this.audioContext!.destination);
      
      source.onended = () => resolve();
      source.start(0);
    });
  }

  async generateAndPlaySfx(prompt: string): Promise<void> {
    const buffer = await this.generateSfxBuffer(prompt);
    if (buffer) {
      await this.playAudioBuffer(buffer);
    }
  }
}


