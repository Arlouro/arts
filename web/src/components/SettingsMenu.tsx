import React, { useEffect, useRef } from 'react';
import type { Settings } from '../types/settings';

interface SettingsMenuProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  onClose: () => void;
  announce: (text: string, key?: string) => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ settings, onUpdate, onClose, announce }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dialogRef.current) {
      dialogRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements && focusableElements.length > 0) {
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey && document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    const dialog = dialogRef.current;
    dialog?.addEventListener('keydown', handleKeyDown);
    return () => dialog?.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      className="settings-overlay" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="settings-title"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="settings-header">
        <h2 id="settings-title">Definições</h2>
        <button type="button"
          className="close-button" 
          onClick={onClose}
          onMouseEnter={() => announce("Fechar definições", "close_settings")}
          aria-label="Fechar definições"
        >
          <i className="fa-regular fa-circle-xmark"></i>
        </button>
      </div>

      <div className="settings-grid">
        <h2 className="settings-section-title">Filtros</h2>
        
        {/* Filters */}
        <button type="button"
          className={`setting-button ${settings.musicEnabled ? 'active' : 'inactive'}`}
          aria-pressed={settings.musicEnabled ? "true" : "false"}
          onClick={() => onUpdate({ musicEnabled: !settings.musicEnabled })}
          onMouseEnter={() => announce(`${settings.musicEnabled ? 'Desativar' : 'Ativar'} Música`, settings.musicEnabled ? 'disable_music' : 'enable_music')}
        >
          <i className={`fa-regular ${settings.musicEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Música: {settings.musicEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>

        <button type="button"
          className={`setting-button ${settings.descriptionEnabled ? 'active' : 'inactive'}`}
          aria-pressed={settings.descriptionEnabled ? "true" : "false"}
          onClick={() => onUpdate({ descriptionEnabled: !settings.descriptionEnabled })}
          onMouseEnter={() => announce(`${settings.descriptionEnabled ? 'Desativar' : 'Ativar'} Áudio-descrição`, settings.descriptionEnabled ? 'disable_description' : 'enable_description')}
        >
          <i className={`fa-regular ${settings.descriptionEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Áudio-descrição: {settings.descriptionEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>

        <button type="button"
          className={`setting-button ${settings.analysisEnabled ? 'active' : 'inactive'}`}
          aria-pressed={settings.analysisEnabled ? "true" : "false"}
          onClick={() => onUpdate({ analysisEnabled: !settings.analysisEnabled })}
          onMouseEnter={() => announce(`${settings.analysisEnabled ? 'Desativar' : 'Ativar'} Análise Detalhada`, settings.analysisEnabled ? 'disable_analysis' : 'enable_analysis')}
        >
          <i className={`fa-regular ${settings.analysisEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Análise Detalhada: {settings.analysisEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>

        <button type="button"
          className={`setting-button ${settings.sfxEnabled ? 'active' : 'inactive'}`}
          aria-pressed={settings.sfxEnabled ? "true" : "false"}
          onClick={() => onUpdate({ sfxEnabled: !settings.sfxEnabled })}
          onMouseEnter={() => announce(`${settings.sfxEnabled ? 'Desativar' : 'Ativar'} Som de objetos identificados`, settings.sfxEnabled ? 'disable_sfx' : 'enable_sfx')}
        >
          <i className={`fa-regular ${settings.sfxEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Som de objetos identificados: {settings.sfxEnabled ? 'Ligado' : 'Desligado'}</span>
        </button>

        <button type="button"
          className={`setting-button ${settings.intentionEnabled ? 'active' : 'inactive'}`}
          aria-pressed={settings.intentionEnabled ? "true" : "false"}
          onClick={() => onUpdate({ intentionEnabled: !settings.intentionEnabled })}
          onMouseEnter={() => announce(`${settings.intentionEnabled ? 'Desativar' : 'Ativar'} Intenção do Autor`, settings.intentionEnabled ? 'disable_intention' : 'enable_intention')}
        >
          <i className={`fa-regular ${settings.intentionEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
          <span>Intenção do Autor: {settings.intentionEnabled ? 'Ligada' : 'Desligada'}</span>
        </button>
      </div>
    </div>
  );
};

