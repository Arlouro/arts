export interface Affect {
  valence: number;
  arousal: number;
}

const EN: Record<string, Affect> = {
  'alarmed':     { valence: -0.50, arousal: 0.95 },
  'aroused':     { valence:  0.20, arousal: 0.90 },
  'afraid':      { valence: -0.70, arousal: 0.85 },
  'tense':       { valence: -0.60, arousal: 0.80 },
  'angry':       { valence: -0.80, arousal: 0.85 },
  'distressed':  { valence: -0.70, arousal: 0.75 },
  'annoyed':     { valence: -0.60, arousal: 0.65 },
  'frustrated':  { valence: -0.60, arousal: 0.65 },
  'miserable':   { valence: -0.85, arousal: 0.35 },
  'depressed':   { valence: -0.85, arousal: 0.25 },
  'sad':         { valence: -0.75, arousal: 0.35 },
  'gloomy':      { valence: -0.70, arousal: 0.30 },
  'bored':       { valence: -0.50, arousal: 0.20 },
  'droopy':      { valence: -0.40, arousal: 0.15 },
  'tired':       { valence: -0.35, arousal: 0.15 },
  'sleepy':      { valence: -0.15, arousal: 0.10 },
  'relaxed':     { valence:  0.60, arousal: 0.20 },
  'at ease':     { valence:  0.60, arousal: 0.25 },
  'calm':        { valence:  0.60, arousal: 0.15 },
  'serene':      { valence:  0.70, arousal: 0.20 },
  'content':     { valence:  0.75, arousal: 0.30 },
  'satisfied':   { valence:  0.75, arousal: 0.35 },
  'pleased':     { valence:  0.80, arousal: 0.45 },
  'happy':       { valence:  0.90, arousal: 0.60 },
  'glad':        { valence:  0.80, arousal: 0.55 },
  'delighted':   { valence:  0.90, arousal: 0.70 },
  'excited':     { valence:  0.80, arousal: 0.85 },
  'astonished':  { valence:  0.50, arousal: 0.85 },
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function affectOf(name: string): Affect | null {
  if (!name) return null;
  const n = normalize(name);
  if (EN[n]) return EN[n];
  const first = n.split(/[\s,/;]+/)[0];
  if (EN[first]) return EN[first];
  return null;
}

export interface ArcShape {
  homeValence: number;
  homeArousal: number;
  peakArousal: number;
  arousalRise: number;
  climaxPos: number;
  totalSeconds: number;
  complexity: number;
  resolved: boolean;
}

const ARC_COMPLEXITY_REF = 6;

const ARC_MIN_SECONDS = 90;
const ARC_PER_OBJECT = 18;
const ARC_MAX_SECONDS = 220;

export function computeArcShape(emotions: string[] | undefined, objectCount: number): ArcShape {
  const affects = (emotions ?? [])
    .map(affectOf)
    .filter((a): a is Affect => a !== null);

  const oc = Math.max(0, objectCount || 0);
  const totalSeconds = Math.min(ARC_MAX_SECONDS, ARC_MIN_SECONDS + oc * ARC_PER_OBJECT);
  const climaxPos = Math.min(0.72, 0.5 + 0.03 * oc);
  const complexity = Math.min(1, oc / ARC_COMPLEXITY_REF);

  if (affects.length === 0) {
    return {
      homeValence: 0, homeArousal: 0.4, peakArousal: 0.65,
      arousalRise: 0.25, climaxPos, totalSeconds, complexity, resolved: false,
    };
  }

  const home = affects[0];
  const peakArousal = Math.max(...affects.map(a => a.arousal));
  return {
    homeValence: home.valence,
    homeArousal: home.arousal,
    peakArousal,
    arousalRise: Math.max(0, peakArousal - home.arousal),
    climaxPos,
    totalSeconds,
    complexity,
    resolved: true,
  };
}

export function tensionAt(t: number, climaxPos: number): number {
  const p = Math.min(0.95, Math.max(0.05, climaxPos));
  const x = Math.min(1, Math.max(0, t));
  if (x <= p) return Math.sin((Math.PI / 2) * (x / p));
  return Math.sin((Math.PI / 2) * (1 - (x - p) / (1 - p)));
}
