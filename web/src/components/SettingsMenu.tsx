import React from 'react';
import type { Settings } from '../types/settings';

interface SettingsMenuProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  onClose: () => void;
  announce: (text: string, key?: string) => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ settings, onUpdate, onClose, announce }) => {
  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-header">
        <h2 id="settings-title">Definições</h2>
        <button 
          className="close-button" 
          onClick={onClose}
          onMouseEnter={() => announce("Fechar definições", "close_settings")}
          onFocus={() => announce("Fechar definições", "close_settings")}
          aria-label="Fechar definições"
        >
          <i className="fa-regular fa-circle-xmark"></i>
        </button>
      </div>

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
                announce(`Volume: ${Math.round(nextVol * 100)}%`, `vol_${Math.round(nextVol * 100)}`);
              }}
              onMouseEnter={() => announce("Diminuir volume", "decrease_volume")}
              onFocus={() => announce("Diminuir volume", "decrease_volume")}
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
                announce(`Volume: ${Math.round(nextVol * 100)}%`, `vol_${Math.round(nextVol * 100)}`);
              }}
              onMouseEnter={() => announce("Aumentar volume", "increase_volume")}
              onFocus={() => announce("Aumentar volume", "increase_volume")}
              aria-label="Aumentar volume"
            >
              <i className="fa-solid fa-plus"></i>
            </button>
          </div>
        </div>

        {/* Filters */}
        <button 
          className={`setting-button ${settings.musicEnabled ? 'active' : 'inactive'}`}
          onClick={() => onUpdate({ musicEnabled: !settings.musicEnabled })}
          onMouseEnter={() => announce(`${settings.musicEnabled ? 'Desativar' : 'Ativar'} Música`, settings.musicEnabled ? 'disable_music' : 'enable_music')}
          onFocus={() => announce(`${settings.musicEnabled ? 'Desativar' : 'Ativar'} Música`, settings.musicEnabled ? 'disable_music' : 'enable_music')}
        >
          <i className={`fa-regular ${settings.musicEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Música: {settings.musicEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>

        <button 
          className={`setting-button ${settings.descriptionEnabled ? 'active' : 'inactive'}`}
          onClick={() => onUpdate({ descriptionEnabled: !settings.descriptionEnabled })}
          onMouseEnter={() => announce(`${settings.descriptionEnabled ? 'Desativar' : 'Ativar'} Áudio-descrição`, settings.descriptionEnabled ? 'disable_description' : 'enable_description')}
          onFocus={() => announce(`${settings.descriptionEnabled ? 'Desativar' : 'Ativar'} Áudio-descrição`, settings.descriptionEnabled ? 'disable_description' : 'enable_description')}
        >
          <i className={`fa-regular ${settings.descriptionEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Descrição: {settings.descriptionEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>

        <button 
          className={`setting-button ${settings.analysisEnabled ? 'active' : 'inactive'}`}
          onClick={() => onUpdate({ analysisEnabled: !settings.analysisEnabled })}
          onMouseEnter={() => announce(`${settings.analysisEnabled ? 'Desativar' : 'Ativar'} Análise Detalhada`, settings.analysisEnabled ? 'disable_analysis' : 'enable_analysis')}
          onFocus={() => announce(`${settings.analysisEnabled ? 'Desativar' : 'Ativar'} Análise Detalhada`, settings.analysisEnabled ? 'disable_analysis' : 'enable_analysis')}
        >
          <i className={`fa-regular ${settings.analysisEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Análise: {settings.analysisEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>

        <button 
          className={`setting-button ${settings.sfxEnabled ? 'active' : 'inactive'}`}
          onClick={() => onUpdate({ sfxEnabled: !settings.sfxEnabled })}
          onMouseEnter={() => announce(`${settings.sfxEnabled ? 'Desativar' : 'Ativar'} Efeitos Sonoros`, settings.sfxEnabled ? 'disable_sfx' : 'enable_sfx')}
          onFocus={() => announce(`${settings.sfxEnabled ? 'Desativar' : 'Ativar'} Efeitos Sonoros`, settings.sfxEnabled ? 'disable_sfx' : 'enable_sfx')}
        >
          <i className={`fa-regular ${settings.sfxEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>SFX: {settings.sfxEnabled ? 'Ligados' : 'Desligados'}</span>
        </button>

        <button 
          className={`setting-button ${settings.intentionEnabled ? 'active' : 'inactive'}`}
          onClick={() => onUpdate({ intentionEnabled: !settings.intentionEnabled })}
          onMouseEnter={() => announce(`${settings.intentionEnabled ? 'Desativar' : 'Ativar'} Intenção do Autor`, settings.intentionEnabled ? 'disable_intention' : 'enable_intention')}
          onFocus={() => announce(`${settings.intentionEnabled ? 'Desativar' : 'Ativar'} Intenção do Autor`, settings.intentionEnabled ? 'disable_intention' : 'enable_intention')}
        >
          <i className={`fa-regular ${settings.intentionEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Intenção: {settings.intentionEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>
      </div>
    </div>
  );
};
