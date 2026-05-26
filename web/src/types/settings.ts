export interface Settings {
  masterVolume: number;
  musicEnabled: boolean;
  ttsEnabled: boolean;
  sfxEnabled: boolean;
  ttsRate: number;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicEnabled: true,
  ttsEnabled: true,
  sfxEnabled: true,
  ttsRate: 1.0,
};
