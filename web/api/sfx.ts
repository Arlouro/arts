import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const elevenLabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY || "" });

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt } = req.body ?? {};
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
    res.status(200).json({ audioData: buffer.toString('base64') });
  } catch (error) {
    console.error("sfx: ElevenLabs SFX Error:", error);
    res.status(500).json({ error: "Failed to generate SFX" });
  }
}
