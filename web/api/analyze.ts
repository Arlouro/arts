import { GoogleGenAI } from "@google/genai";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageData, paintingTitle, paintingArtist, paintingYear, context, authors_intention, isUnknown } = req.body ?? {};

    if (!imageData) {
      return res.status(400).json({ error: "Missing imageData" });
    }

    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: "image/jpeg",
      },
    };

    const prompt = `### ROLE:
      Expert Art Historian, Semiotician, Musicologist, and Audio Engineer.

      ### OBJECTIVE:
      Analyze ${isUnknown ? "this unidentified artwork" : `"${paintingTitle}" by ${paintingArtist} (${paintingYear})`} to generate a multifaceted emotional and auditory profile.

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
      - **Contexto Histórico:** ${context}
      - **Intenção do Autor:** ${authors_intention}`}

      ### TASKS:
      1. Conduct an analysis of the visual elements ${isUnknown ? "purely from the image" : "integrated with the provided historical context and the author's intention (if available)"}.
      2. Generate a "Soundscape Profile" and a single unified Prompt for the Lyria AI music generator that captures all detected emotions.
      3. Generate recognizable SFX prompts for specific detected objects.

      ### OUTPUT REQUIREMENTS:
      - **Language:** Strings intended for user playback (ArtDescription, ArtAnalysis, DetectedEmotions, Object) MUST be in European Portuguese (PT-PT). Strings intended for AI generation models (MusicPrompt.Prompt and SoundEffectPrompt) MUST be strictly in English.
      - **Format:** Strict JSON. No conversational filler.
      - **Tone:** Analytical, evocative, and psychologically grounded.
      - **Detected Objects Rules:** List of the most relevantly detected objects in the painting (up to 5 objects). Do not force 5 objects; only include objects that are significant to the composition or atmosphere. Can be as few as 1 or 2 if the painting is simple. Order by relevance (Size > High Color Saturation > Symmetry or Off-Center Balance).
      - **Detected Emotions Limit:** List of up to 3 primary emotions evoked by the painting, based on visual analysis and historical context.
      - **Emotion Selection Rules:** The detected emotions should be from the following selection: Alarmed, Aroused, Afraid, Tense, Angry, Distressed, Annoyed, Frustrated, Miserable, Depressed, Sad, Gloomy, Bored, Droopy, Tired, Sleepy, Relaxed, At Ease, Calm, Serene, Content, Satisfied, Pleased, Happy, Glad, Delighted, Excited, Astonished
      - **Music Prompt Rules:** The prompt must be a single, unified descriptive paragraph that weaves together ALL detected emotions, the selected instruments, genre, mood, and, when available, the author's stated intention for the artwork. The author's intention should influence the emotional tone, instrument choices, and overall character of the music.
      - **Audio Description Rules:** Write for a Blind or Low Vision audience. Use a clear spatial logic (e.g., foreground to background, or left to right) to help the user construct a mental map.

      ### JSON SCHEMA & KEYS:
      {
        "ArtDescription": "Breve descrição física da obra.",
        "ArtAnalysis": "Análise profunda correlacionando estética e contexto histórico.",
        "DetectedEmotions": ["Emoção 1", "Emoção 2"],
        "MusicPrompt": {
          "Instruments": "Lista de instrumentos baseada na textura visual.",
          "MusicGenre": "Género musical que reflete a época e o sentimento.",
          "Mood": "Atmosfera emocional based on the detected emotions.",
          "Prompt": "Detailed descriptive paragraph for music generation. Must weave together ALL detected emotions, selected instruments, genre, mood, and (when available) the author's stated intention, and apply the sonification rules into one cohesive musical direction. (MUST BE IN ENGLISH)",
          "Config": {
            "Guidance": "How closely the music should follow the prompt (0.0-6.0).",
            "bpm": "Suggested tempo in beats per minute. (60-200)",
            "Density": "Level of orchestration density (0.0-1.0).",
            "Brightness": "Overall brightness of the music (0.0-1.0).",
            "Scale": "Musical scale or mode that reflects the painting's emotional tone. (C_MAJOR_A_MINOR, D_FLAT_MAJOR_B_FLAT_MINOR, D_MAJOR_B_MINOR, E_FLAT_MAJOR_C_MINOR, E_MAJOR_D_FLAT_MINOR, F_MAJOR_D_MINOR, G_FLAT_MAJOR_E_FLAT_MINOR, G_MAJOR_E_MINOR, A_FLAT_MAJOR_F_MINOR, A_MAJOR_G_FLAT_MINOR, B_FLAT_MAJOR_G_MINOR, B_MAJOR_A_FLAT_MINOR, SCALE_UNSPECIFIED)",
            "Mute-bass": "Whether to mute the bass instruments (True/False).",
            "Mute-drums": "Whether to mute the drum/percussion instruments (True/False).",
            "Only-bass-and-drums": "Whether to include only bass and drum/percussion instruments (True/False).",
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

    const analysisModels = ["gemini-3-flash-preview", "gemini-2.5-flash"];
    let text: string | undefined;
    let lastError: unknown;

    for (const model of analysisModels) {
      try {
        const result = await gemini.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }, imagePart] }],
          config: { responseMimeType: "application/json" }
        });

        let t = result?.text ?? "{}";
        t = t.trim();
        if (t.startsWith("```json")) t = t.slice(7);
        else if (t.startsWith("```")) t = t.slice(3);
        if (t.endsWith("```")) t = t.slice(0, -3);
        text = t.trim();
        break;
      } catch (err) {
        lastError = err;
        console.warn(`analyze: model "${model}" failed; trying fallback if available:`, err);
      }
    }

    if (text === undefined) throw lastError ?? new Error("Analysis failed");

    res.status(200).json(JSON.parse(text));
  } catch (error) {
    console.error("analyze: Gemini Analysis Error:", error);
    const detail = (error as Error)?.message ?? String(error);
    res.status(500).json({ error: "Failed to analyze painting", detail });
  }
}
