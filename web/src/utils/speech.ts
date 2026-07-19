let cachedVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;

function refreshVoice(): void {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return;
  voicesLoaded = true;
  cachedVoice =
    voices.find(v => v.lang === 'pt-PT') ??
    voices.find(v => v.lang?.toLowerCase().startsWith('pt')) ??
    null;
}

export function primeSpeechVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  refreshVoice();
  if (!voicesLoaded) {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoice, { once: true });
  }
}

export interface SpeakOptions {
  rate?: number;
  onDone?: () => void;
}

export function speakHardened(text: string, opts: SpeakOptions = {}): SpeechSynthesisUtterance | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    opts.onDone?.();
    return null;
  }

  const rate = opts.rate ?? 1;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-PT';
  utterance.rate = rate;
  if (cachedVoice) utterance.voice = cachedVoice;

  let finished = false;
  let keepalive: number | null = null;
  let watchdog: number | null = null;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (keepalive !== null) window.clearInterval(keepalive);
    if (watchdog !== null) window.clearTimeout(watchdog);
    opts.onDone?.();
  };

  utterance.onend = finish;
  utterance.onerror = finish;

  const expectedMs = Math.min(2000 + (text.length * 70) / rate, 30000);
  watchdog = window.setTimeout(finish, expectedMs);

  keepalive = window.setInterval(() => {
    if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
  }, 5000);

  window.speechSynthesis.speak(utterance);
  return utterance;
}