export interface Settings {
  masterVolume: number;
  musicEnabled: boolean;
  descriptionEnabled: boolean;
  analysisEnabled: boolean;
  sfxEnabled: boolean;
  intentionEnabled: boolean;
  ttsRate: number;
  screenReaderMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicEnabled: true,
  descriptionEnabled: true,
  analysisEnabled: true,
  sfxEnabled: true,
  intentionEnabled: true,
  ttsRate: 1.0,
  screenReaderMode: true,
};
