import React from 'react';
import type { Settings } from '../types/settings';

interface SettingsMenuProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  onClose: () => void;
  announce: (text: string) => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ settings, onUpdate, onClose, announce }) => {
  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header">
        <h2 id="settings-title">Definições</h2>
        <button 
          className="close-button" 
          onClick={onClose}
          onMouseEnter={() => announce("Fechar definições")}
          onFocus={() => announce("Fechar definições")}
          aria-label="Fechar definições"
        >
          <i className="fa-regular fa-circle-xmark"></i>
        </button>
      </header>

      <div className="settings-grid">
        {/* Master Volume Stepper */}
        <div className="setting-item volume-control">
          <label>Volume Geral: {Math.round(settings.masterVolume * 100)}%</label>
          <div className="volume-stepper">
            <button 
              className="step-button"
              onClick={() => {
                const nextVol = Math.max(0, settings.masterVolume - 0.1);
                onUpdate({ masterVolume: nextVol });
                announce(`Volume: ${Math.round(nextVol * 100)}%`);
              }}
              onMouseEnter={() => announce("Diminuir volume")}
              onFocus={() => announce("Diminuir volume")}
              aria-label="Diminuir volume"
            >
              <i className="fa-solid fa-minus"></i>
            </button>
            
            <div className="volume-bar-container" aria-hidden="true">
              {[...Array(10)].map((_, i) => (
                <div 
                  key={i} 
                  className={`volume-step ${i < Math.round(settings.masterVolume * 10) ? 'filled' : ''}`}
                />
              ))}
            </div>

            <button 
              className="step-button"
              onClick={() => {
                const nextVol = Math.min(1, settings.masterVolume + 0.1);
                onUpdate({ masterVolume: nextVol });
                announce(`Volume: ${Math.round(nextVol * 100)}%`);
              }}
              onMouseEnter={() => announce("Aumentar volume")}
              onFocus={() => announce("Aumentar volume")}
              aria-label="Aumentar volume"
            >
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
        </div>

        {/* Toggles */}
        <button 
          className={`setting-button ${settings.musicEnabled ? 'active' : 'inactive'}`}
          onClick={() => onUpdate({ musicEnabled: !settings.musicEnabled })}
          onMouseEnter={() => announce(`${settings.musicEnabled ? 'Desativar' : 'Ativar'} Música`)}
          onFocus={() => announce(`${settings.musicEnabled ? 'Desativar' : 'Ativar'} Música`)}
        >
          <i className={`fa-regular ${settings.musicEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Música: {settings.musicEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>

        <button 
          className={`setting-button ${settings.ttsEnabled ? 'active' : 'inactive'}`}
          onClick={() => onUpdate({ ttsEnabled: !settings.ttsEnabled })}
          onMouseEnter={() => announce(`${settings.ttsEnabled ? 'Desativar' : 'Ativar'} Voz`)}
          onFocus={() => announce(`${settings.ttsEnabled ? 'Desativar' : 'Ativar'} Voz`)}
        >
          <i className={`fa-regular ${settings.ttsEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Voz: {settings.ttsEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>

        <button 
          className={`setting-button ${settings.sfxEnabled ? 'active' : 'inactive'}`}
          onClick={() => onUpdate({ sfxEnabled: !settings.sfxEnabled })}
          onMouseEnter={() => announce(`${settings.sfxEnabled ? 'Desativar' : 'Ativar'} Efeitos Sonoros`)}
          onFocus={() => announce(`${settings.sfxEnabled ? 'Desativar' : 'Ativar'} Efeitos Sonoros`)}
        >
          <i className={`fa-regular ${settings.sfxEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>SFX: {settings.sfxEnabled ? 'Ligados' : 'Desligados'}</span>
        </button>
      </div>
    </div>
  );
};
