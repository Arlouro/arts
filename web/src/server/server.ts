import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { GoogleGenAI } from "@google/genai";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Painting } from "../types/painting";

dotenv.config();

const app = express();
const httpServer = createServer(app);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "ngrok-skip-browser-warning"]
}));

app.set('trust proxy', 1)
app.use(express.json({ limit: "100mb" }));

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});
app.use("/api/", apiLimiter);

// Initialize SDKs using server-side keys
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY || process.env.VITE_ELEVENLABS_API_KEY;

const gemini = new GoogleGenAI({ apiKey: geminiApiKey || "" });
const elevenLabs = new ElevenLabsClient({ apiKey: elevenLabsApiKey || "" });

app.post("/api/analyze", async (req, res) => {
  try {
    const { imageData, paintingTitle, paintingArtist, paintingYear, context, authors_intention, isUnknown } = req.body;

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
      Never let a visual property influence any musical property other
      than the one assigned to it.
      - Temperature -> Tempo (Warm palette = fast tempo; cold palette = slow tempo).
      - Saturation -> Harmony, Mode (High saturation = major mode; low saturation = minor mode).
      - Brightness -> Pitch (High brightness = high pitch; low brightness = low pitch).
      - Line Curvature -> Timbre (Rounded or curved = pure timbre; sharp or angular = sharp timbre). The instrument selection follows from this rule alone.
      - Visual Complexity -> Musical Form Complexity (High complexity = high formal complexity WITH high dynamism; low complexity = low formal complexity).
      - Lighting Direction & Shadows -> Volume Envelope (Hard, directional shadows = sharp attack; diffused light = slow attack).
      - Lighting Temperature -> Articulation (Warmer light = legato; colder light = staccato).
      
      ${isUnknown ? `### SPECIAL INSTRUCTION:
      As this painting is not in our database, please perform a blind visual analysis. Identify the likely style, potential period, and key visual elements to create the soundscape.` : `### CONTEXT:
      - **Contexto:** ${context}
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
          "Instruments": "Lista de instrumentos, determinada apenas pela regra Line Curvature -> Timbre.",
          "MusicGenre": "Género musical que reflete a época e o sentimento.",
          "Mood": "Atmosfera emocional.",
          "Prompt": "Detailed descriptive paragraph for music generation. Must weave together ALL detected emotions, selected instruments, genre, mood, and (when available) the author's stated intention into one cohesive musical direction. (MUST BE IN ENGLISH)",
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
        if (t.startsWith("\`\`\`json")) t = t.slice(7);
        else if (t.startsWith("\`\`\`")) t = t.slice(3);
        if (t.endsWith("\`\`\`")) t = t.slice(0, -3);
        text = t.trim();
        break;
      } catch (err) {
        lastError = err;
        console.warn(`Proxy: analysis model "${model}" failed; trying fallback if available:`, err);
      }
    }

    if (text === undefined) throw lastError ?? new Error("Analysis failed");

    res.json(JSON.parse(text));
  } catch (error) {
    console.error("Proxy: Gemini Analysis Error:", error);
    const detail = (error as Error)?.message ?? String(error);
    const status = (error as { status?: number })?.status;
    res.status(500).json({ error: "Failed to analyze painting", detail, status });
  }
});

app.post("/api/tts/gemini", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const ttsModels = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
    let base64Audio: string | undefined;
    let lastError: unknown;

    for (const model of ttsModels) {
      try {
        const result = await gemini.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } },
              languageCode: "pt-PT",
            }
          }
        });

        const audioPart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        base64Audio = audioPart?.inlineData?.data;
        if (base64Audio) break;
        throw new Error('TTS returned empty audio data');
      } catch (err) {
        lastError = err;
        console.warn(`Proxy: TTS model "${model}" failed; trying fallback if available:`, err);
      }
    }

    if (!base64Audio) throw lastError ?? new Error('TTS returned empty audio data');

    res.json({ audioData: base64Audio });
  } catch (error) {
    console.error("Proxy: Gemini TTS Error:", error);
    res.status(500).json({ error: "Failed to generate TTS" });
  }
});

app.post("/api/sfx", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const audioStream = await elevenLabs.textToSoundEffects.convert({
      text: prompt,
      durationSeconds: 5,
      promptInfluence: 0.5,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream as any) {
      chunks.push(Buffer.from(chunk));
    }

    if (chunks.length === 0) throw new Error('ElevenLabs returned empty audio stream');

    const buffer = Buffer.concat(chunks);
    res.json({ audioData: buffer.toString('base64') });
  } catch (error) {
    console.error("Proxy: ElevenLabs SFX Error:", error);
    res.status(500).json({ error: "Failed to generate SFX" });
  }
});

const DEBUG_FOLDER = path.join(process.cwd(), "debug_analysis");

if (!fs.existsSync(DEBUG_FOLDER)) {
  fs.mkdirSync(DEBUG_FOLDER, { recursive: true });
}

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    allowedHeaders: ["ngrok-skip-browser-warning"]
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });

  socket.on("painting_detected", (data: Painting) => {
    console.log("Painting detected:", data);
    io.emit("painting_detected", data);
  });

  socket.on("pause_detection", () => {
    console.log("Pausing YOLO detection to save performance.");
    io.emit("pause_detection");
  });

  socket.on("resume_detection", () => {
    console.log("Resuming YOLO detection.");
    io.emit("resume_detection");
  });

  socket.on("process_frame", (data: { image: string }) => {
    // Relay the image to the Python script
    io.emit("process_frame", data);
  });

  socket.on("status_update", (data: { status: string }) => {
    console.log("Status update:", data);
    io.emit("status_update", data);
  });

  socket.on("tracking_update", (data: { dx: number; dy: number; inFrame: boolean; centered: boolean }) => {
    io.emit("tracking_update", data);
  });

  socket.on("save_analysis", (data: { title: string, analysis: any, painting: Painting }) => {
    const timestamp = Date.now();
    const folderName = `${data.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_${timestamp}`;
    const paintingFolder = path.join(DEBUG_FOLDER, folderName);

    if (!fs.existsSync(paintingFolder)) {
      fs.mkdirSync(paintingFolder, { recursive: true });
    }

    // Save raw JSON
    const jsonPath = path.join(paintingFolder, 'analysis.json');
    fs.writeFile(jsonPath, JSON.stringify(data.analysis, null, 2), (err) => {
      if (err) console.error("Failed to save JSON analysis:", err);
    });

    // Save Music Prompt as text file for easy reading
    if (data.analysis.MusicPrompt?.Prompt) {
      const promptPath = path.join(paintingFolder, 'music_prompt.txt');
      fs.writeFile(promptPath, data.analysis.MusicPrompt.Prompt, (err) => {
        if (err) console.error("Failed to save music prompt text:", err);
      });
    }

    // Save a summary report
    const reportPath = path.join(paintingFolder, 'summary.txt');
    const summary = `
Title: ${data.painting?.title || data.title}
Artist: ${data.painting?.artist || 'Unknown'}
Year: ${data.painting?.year || 'Unknown'}
Generated at: ${new Date(timestamp).toLocaleString()}

--- DESCRIPTION ---
${data.analysis.ArtDescription || 'N/A'}

--- ANALYSIS ---
${data.analysis.ArtAnalysis || 'N/A'}

--- MUSIC PROMPT ---
${data.analysis.MusicPrompt?.Prompt || 'N/A'}

--- DETECTED OBJECTS ---
${(data.analysis.DetectedObjects || []).map((obj: any) => `- ${obj.Object}: ${obj.SoundEffectPrompt}`).join('\n')}
    `.trim();

    fs.writeFile(reportPath, summary, (err) => {
      if (err) {
        console.error("Failed to save summary report:", err);
      } else {
        console.log(`Saved analysis results to: ${paintingFolder}`);
      }
    });
  });
});

const PORT = process.env.PORT || 8000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
