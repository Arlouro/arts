import { GoogleGenAI } from "@google/genai";
import type { Painting } from "../types/painting.ts";

export class GeminiService {
  private gemini: GoogleGenAI;

  constructor(apiKey: string) {
    this.gemini = new GoogleGenAI({ apiKey });
  }

  async fileToGenerativePart(path: string, mimeType: string, rawData?: string): Promise<any> {
    if (rawData) {
      const base64Data = rawData.split(',')[1] || rawData;
      return {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      };
    }

    const response = await fetch(path);
    const blob = await response.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = (reader.result as string).split(',')[1];
        resolve({
          inlineData: {
            data: base64Data,
            mimeType,
          },
        });
      };
      reader.readAsDataURL(blob);
    });
  }

  async analyzePainting(paintingData: Painting): Promise<any> {
    const imagePart = await this.fileToGenerativePart(
      paintingData.imagePath, 
      "image/jpeg", 
      paintingData.imageData
    );

    const isUnknown = paintingData.id.toString().startsWith("unknown");
    
    const prompt = `### ROLE: 
      Expert Art Historian, Semiotician, Musicologist, and Audio Engineer.

      ### OBJECTIVE:
      Analyze ${isUnknown ? "this unidentified artwork" : `"${paintingData.title}" by ${paintingData.artist} (${paintingData.year})`} to generate a multifaceted emotional and auditory profile.

      ### SONIFICATION MAPPING RULES:
      - **Color Temperature & Hue**: Map to Pitch Range, Mode, and Tempo (Warm = High pitch/Fast tempo; Cold = Low pitch/Slow tempo).
      - **Saturation**: Map to Tempo, Pitch Range, and Mode (High saturation = Fast tempo/Major mode; Low saturation = Slow tempo/Minor mode).
      - **Brushstroke Texture**: Map to Rhythm Types and Timbre (Rough = Irregular rhythm/Sharp timbre; Smooth = Regular rhythm/Pure timbre).
      - **Compositional Weight**: Map to Musical Structure and Melodic Movement (High symmetry = Stepwise movement/Predictable structure; Asymmetrical = Intervallic leaps).
      - **Lighting**: Map to Volume Envelope and Dynamics (Hard shadows = Sharp attack/Loud dynamics; Soft shadows = Slow attack/Soft dynamics).
      - **Visual Complexity**: Map to Musical Form Complexity and Dynamism (High complexity = High musical complexity/High dynamism; Low complexity = Repetitive structures).
      - **Instruments Selection**: Map strictly to Timbre/Tone Color (Aggressive visuals = Sharp/rich timbres; Serene visuals = Pure/bright timbres).

      ${isUnknown ? `### SPECIAL INSTRUCTION:
      As this painting is not in our database, please perform a blind visual analysis. Identify the likely style, potential period, and key visual elements to create the soundscape.` : `### CONTEXT:
      - **Contexto Histórico:** ${paintingData.context}
      - **Intenção do Autor:** ${paintingData.authors_intention}`}

      ### TASKS:
      1. Conduct an analysis of the visual elements ${isUnknown ? "purely from the image" : "integrated with the provided historical context"}.
      2. Generate a "Soundscape Profile" and Prompt for the Lyria AI generator.
      3. Generate recognizable SFX prompts for specific detected objects.

      ### OUTPUT REQUIREMENTS:
      - **Language:** Strings intended for user playback (ArtDescription, ArtAnalysis, DetectedEmotions, Object) MUST be in European Portuguese (PT-PT). Strings intended for AI generation models (MusicPrompt.Prompt and SoundEffectPrompt) MUST be strictly in English.
      - **Format:** Strict JSON. No conversational filler.
      - **Tone:** Analytical, evocative, and psychologically grounded.
      - **Detected Objects Rules:** Ordered by relevance (Size > High Color Saturation > Symmetry or Off-Center Balance) list of up to 5 most relevantly detected objects in the painting
      - **Detected Emotions Limit:** List of up to 3 primary emotions evoked by the painting, based on visual analysis and historical context.
      - **Emotion Selection Rules:** The detected emotions should be from the following selection: Alarmed, Aroused, Afraid, Tense, Angry, Distressed, Annoyed, Frustrated, Miserable, Depressed, Sad, Gloomy, Bored, Droopy, Tired, Sleepy, Relaxed, At Ease, Calm, Serene, Content, Satisfied, Pleased, Happy, Glad, Delighted, Excited, Astonished
      - **Audio Description Rules:** Write for a Blind or Low Vision audience. Use a clear spatial logic (e.g., foreground to background, or left to right) to help the user construct a mental map. 
      
      ### JSON SCHEMA & KEYS:
      {
        "ArtDescription": "Breve descrição física da obra.",
        "ArtAnalysis": "Análise profunda correlacionando estética e contexto histórico.",
        "DetectedEmotions": ["Emoção 1", "Emoção 2"],
        "MusicPrompt": {
          "Instruments": "Lista de instrumentos baseada na textura visual.",
          "MusicGenre": "Género musical que reflete a época e o sentimento.",
          "Mood": "Atmosfera emocional.",
          "Prompt": "Detailed descriptive paragraph for music generation using detected emotions and selected instruments, genre and mood. (MUST BE IN ENGLISH)",
          "Config": {
            "Guidance": "How closely the music should follow the prompt (0.0-6.0).",
            "bpm": "Suggested tempo in beats per minute. (60-200)",
            "Density": "Level of orchestration density (0.0-1.0).",
            "Brightness": "Overall brightness of the music (0.0-1.0).",
            "Scale": "Musical scale or mode that reflects the painting's emotional tone. (C_MAJOR_A_MINOR, D_FLAT_MAJOR_B_FLAT_MINOR, D_MAJOR_B_MINOR, E_FLAT_MAJOR_C_MINOR, E_MAJOR_D_FLAT_MINOR, F_MAJOR_D_MINOR, G_FLAT_MAJOR_E_FLAT_MINOR, G_MAJOR_E_MINOR, A_FLAT_MAJOR_F_MINOR, A_MAJOR_G_FLAT_MINOR, B_FLAT_MAJOR_G_MINOR, B_MAJOR_A_FLAT_MINOR, SCALE_UNSPECIFIED)",
            "Mute-bass": "Whether to mute the bass instruments (True/False)."
            "Mute-drums": "Whether to mute the drum/percussion instruments (True/False)."
            "Only-bass-and-drums": "Whether to include only bass and drum/percussion instruments (True/False)."
            "Music-generation-mode": "Indicates to the model if it should focus on QUALITY (default value) or DIVERSITY of music. It can also be set to VOCALIZATION to let the model generate vocalizations as another instrument."
          }
        },
        "DetectedObjects": [
          {
            "Object": "Nome do objeto",
            "SoundEffectPrompt": "Simple, short, and highly identifiable sound effect prompt. Use literal descriptions like 'gentle low frequency clock ticking', 'soft wind whistling', 'distant church bell'. Ensure it is easily recognizable, acoustically clear, and pleasant to listen to. Do not generate harsh, sudden, or jarring sounds. (MUST BE IN ENGLISH)",
            "Pan": "A number between -1.0 (left) and 1.0 (right) representing the object's horizontal position in the painting. (e.g., -0.5 for an object on the mid-left, 0.8 for far right, 0.0 for center)"
          }
        ]
      }`;
    try {
      const result = await this.gemini.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              imagePart
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      let text = result?.text ?? "{}";
      
      // Clean potential Markdown JSON blocks returned by the model
      text = text.trim();
      if (text.startsWith("```json")) {
        text = text.slice(7);
      } else if (text.startsWith("```")) {
        text = text.slice(3);
      }
      if (text.endsWith("```")) {
        text = text.slice(0, -3);
      }
      text = text.trim();

      return JSON.parse(text);

    } catch (error) {
      console.error("Error analyzing painting:", error);
      throw new Error("Failed to analyze painting. Please try again.");
    }
  }
}
