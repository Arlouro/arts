import { GoogleGenAI } from "@google/genai";

const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { text } = req.body ?? {};
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

        const audioPart = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
        base64Audio = audioPart?.inlineData?.data;
        if (base64Audio) break;
        throw new Error('TTS returned empty audio data');
      } catch (err) {
        lastError = err;
        console.warn(`tts: model "${model}" failed; trying fallback if available:`, err);
      }
    }

    if (!base64Audio) throw lastError ?? new Error('TTS returned empty audio data');

    res.status(200).json({ audioData: base64Audio });
  } catch (error) {
    console.error("tts: Gemini TTS Error:", error);
    res.status(500).json({ error: "Failed to generate TTS" });
  }
}
