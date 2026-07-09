export interface MusicLayer {
  Emotion?: string;
  Texture?: string;
  Intensity?: number | string;
}

export interface WeightedPrompt {
  text: string;
  weight: number;
}

export function buildWeightedPrompts(
  mainPrompt: string,
  layers: MusicLayer[] = [],
  options: { mainWeight?: number; maxEmotionWeight?: number } = {}
): WeightedPrompt[] {
  const mainWeight = options.mainWeight ?? 1.0;
  const cap = options.maxEmotionWeight ?? 0.8;

  const prompts: WeightedPrompt[] = [];

  if (mainPrompt && mainPrompt.trim()) {
    prompts.push({ text: mainPrompt.trim(), weight: mainWeight });
  }

  const n = layers.length;
  layers.forEach((layer, i) => {
    const text = (layer?.Texture ?? "").toString().trim();
    if (!text) return;

    let intensity =
      typeof layer.Intensity === "string" ? parseFloat(layer.Intensity) : layer.Intensity;
    if (typeof intensity !== "number" || isNaN(intensity)) {
      intensity = (n - i) / n;
    }

    const weight = Math.round(Math.min(cap, Math.max(0, intensity)) * 100) / 100;
    if (weight > 0) prompts.push({ text, weight });
  });

  if (prompts.length === 0) {
    prompts.push({ text: "calm ambient soundscape", weight: 1.0 });
  }

  return prompts;
}
