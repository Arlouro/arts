function getCtx(): AudioContext | null {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const w = window as unknown as { __uiAudioContext?: AudioContext };
  if (!w.__uiAudioContext) {
    try { w.__uiAudioContext = new AC(); } catch { return null; }
  }
  const ctx = w.__uiAudioContext!;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type EarconType = "detected" | "capturing" | "ready" | "error";

function playTones(tones: { freq: number; delay: number; dur: number }[], peak: number): void {
  const ctx = getCtx();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  for (const t of tones) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(t.freq, now + t.delay);
    g.gain.setValueAtTime(0, now + t.delay);
    g.gain.linearRampToValueAtTime(peak, now + t.delay + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t.delay + t.dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now + t.delay);
    osc.stop(now + t.delay + t.dur + 0.03);
  }
}

export function playEarcon(type: EarconType, volume = 1): void {
  const v = 0.12 * clamp(volume, 0, 1);
  switch (type) {
    case "detected": 
      playTones([{ freq: 660, delay: 0, dur: 0.12 }, { freq: 880, delay: 0.1, dur: 0.14 }], v);
      break;
    case "capturing":
      playTones([{ freq: 523, delay: 0, dur: 0.09 }, { freq: 659, delay: 0.07, dur: 0.09 }, { freq: 784, delay: 0.14, dur: 0.12 }], v);
      break;
    case "ready": 
      playTones([{ freq: 523, delay: 0, dur: 0.5 }, { freq: 659, delay: 0, dur: 0.5 }, { freq: 784, delay: 0, dur: 0.5 }], v * 0.9);
      break;
    case "error": 
      playTones([{ freq: 440, delay: 0, dur: 0.16 }, { freq: 330, delay: 0.12, dur: 0.2 }], v);
      break;
  }
}


export const HAPTICS = {
  detected: 25,
  centered: [20, 40, 20],
  capture: 80,
  ready: [40, 60, 40],
  error: [100, 50, 100],
} as const;

export function haptic(pattern: number | readonly number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
    }
  } catch { /* unsupported; ignore */ }
}


let waitingAudio: HTMLAudioElement | null = null;
let fadeInterval: number | null = null;

export function startProcessingBed(volume = 1): void {
  if (fadeInterval) {
    window.clearInterval(fadeInterval);
    fadeInterval = null;
  }
  if (!waitingAudio) {
    waitingAudio = new Audio('/assets/audio/ui/generation_waiting_music.mp3');
    waitingAudio.loop = true;
  }
  waitingAudio.volume = clamp(volume * 0.25, 0, 1);
  waitingAudio.play().catch(() => {});
}

export function duckProcessingBed(duck: boolean, volume = 1): void {
  if (!waitingAudio || fadeInterval) return;
  waitingAudio.volume = clamp(volume * (duck ? 0.06 : 0.25), 0, 1);
}

export function stopProcessingBed(fade = 1.0): void {
  if (!waitingAudio) return;
  if (fadeInterval) {
    window.clearInterval(fadeInterval);
    fadeInterval = null;
  }
  
  if (fade <= 0) {
    waitingAudio.pause();
    waitingAudio.currentTime = 0;
    return;
  }
  
  const steps = 20;
  const stepTime = (fade * 1000) / steps;
  const initialVol = waitingAudio.volume;
  let currentStep = 0;
  
  fadeInterval = window.setInterval(() => {
    currentStep++;
    if (!waitingAudio) {
      window.clearInterval(fadeInterval!);
      return;
    }
    const nextVol = initialVol * (1 - currentStep / steps);
    waitingAudio.volume = Math.max(0, nextVol);
    if (currentStep >= steps) {
      waitingAudio.pause();
      waitingAudio.currentTime = 0;
      window.clearInterval(fadeInterval!);
      fadeInterval = null;
    }
  }, stepTime);
}


let beacon: {
  carrier: OscillatorNode;
  gain: GainNode;
  panner: StereoPannerNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  ctx: AudioContext;
} | null = null;


export function beaconUpdate(dx: number, dy: number, centered: boolean, volume = 1): void {
  const ctx = getCtx();
  if (!ctx || ctx.state !== "running") return;

  if (!beacon) {
    const carrier = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();

    carrier.type = "sine";
    lfo.type = "sine";
    const peak = 0.08 * clamp(volume, 0, 1);
    gain.gain.value = peak / 2;      // AM baseline
    lfoDepth.gain.value = peak / 2;  // AM depth

    carrier.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);
    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);

    carrier.start();
    lfo.start();
    beacon = { carrier, gain, panner, lfo, lfoDepth, ctx };
  }

  const now = ctx.currentTime;
  const dist = clamp(Math.hypot(dx, dy) * 2, 0, 1);
  beacon.panner.pan.setTargetAtTime(clamp(dx * 2, -1, 1), now, 0.08);
  beacon.carrier.frequency.setTargetAtTime(420 + (1 - dist) * 520, now, 0.08);
  beacon.lfo.frequency.setTargetAtTime(centered ? 0.001 : 2 + (1 - dist) * 8, now, 0.08);
  const peak = 0.08 * clamp(volume, 0, 1);
  beacon.lfoDepth.gain.setTargetAtTime(centered ? 0 : peak / 2, now, 0.05);
  beacon.gain.gain.setTargetAtTime(centered ? peak : peak / 2, now, 0.05);
}

export function beaconStop(): void {
  const b = beacon;
  beacon = null;
  if (!b) return;
  const now = b.ctx.currentTime;
  try {
    b.gain.gain.cancelScheduledValues(now);
    b.gain.gain.setValueAtTime(b.gain.gain.value, now);
    b.gain.gain.linearRampToValueAtTime(0, now + 0.15);
    b.carrier.stop(now + 0.2);
    b.lfo.stop(now + 0.2);
  } catch { /* already stopped */ }
}
