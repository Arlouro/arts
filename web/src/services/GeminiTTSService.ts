import { GoogleGenAI } from "@google/genai";
import { decode } from "base64-arraybuffer";

export class GeminiTTSService {
  private gemini: GoogleGenAI;
  private audioContext: AudioContext | null = null;
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  constructor(apiKey: string) {
    this.gemini = new GoogleGenAI({ apiKey });
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
      const result = await this.gemini.models.generateContent({ 
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ role: 'user', parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { 
                voiceName: "Charon"
              }
            },
            languageCode: "pt-PT",
          }
        }
      });

      const audioPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const base64Audio = audioPart?.inlineData?.data;
      
      if (!base64Audio) return null;

      const arrayBuffer = decode(base64Audio);
      return await this.pcmToAudioBuffer(arrayBuffer, 24000);

    } catch (error) {
      console.error("TTS generation error:", error);
      return null;
    }
  }

  async playAudioBuffer(buffer: AudioBuffer, volume: number = 1.0): Promise<void> {
    if (!this.audioContext) return;
    
    return new Promise((resolve) => {
      const source = this.audioContext!.createBufferSource();
      source.buffer = buffer;
      this.activeSources.add(source);
      
      const gainNode = this.audioContext!.createGain();
      gainNode.gain.setValueAtTime(0, this.audioContext!.currentTime);
      
      source.connect(gainNode);
      gainNode.connect(this.audioContext!.destination);
      
      gainNode.gain.linearRampToValueAtTime(volume, this.audioContext!.currentTime + 0.1);
      
      source.onended = () => {
        this.activeSources.delete(source);
        resolve();
      };
      source.start(0);
    });
  }

  public stopAll() {
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });
    this.activeSources.clear();
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
