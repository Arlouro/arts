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
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div className="settings-body">
        <h3 className="settings-section-title" id="title-filtros">Filtros</h3>
        <div className="settings-grid" role="group" aria-labelledby="title-filtros">
          {/* Filters */}
          <button type="button"
            className={`setting-button ${settings.musicEnabled ? 'active' : 'inactive'}`}
            aria-pressed={settings.musicEnabled}
            onClick={() => onUpdate({ musicEnabled: !settings.musicEnabled })}
            onMouseEnter={() => announce(`${settings.musicEnabled ? 'Desativar' : 'Ativar'} Música`, settings.musicEnabled ? 'disable_music' : 'enable_music')}
            aria-label={`Música: ${settings.musicEnabled ? 'Ligada. A paisagem sonora musical gerada para a obra é reproduzida.' : 'Desligada. A paisagem sonora musical não é reproduzida.'}`}
          >
            <i className={`fa-regular ${settings.musicEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
            <span>Música: {settings.musicEnabled ? 'Ligada' : 'Desligada'}</span>
          </button>

          <button type="button"
            className={`setting-button ${settings.descriptionEnabled ? 'active' : 'inactive'}`}
            aria-pressed={settings.descriptionEnabled}
            onClick={() => onUpdate({ descriptionEnabled: !settings.descriptionEnabled })}
            onMouseEnter={() => announce(`${settings.descriptionEnabled ? 'Desativar' : 'Ativar'} Áudio-descrição`, settings.descriptionEnabled ? 'disable_description' : 'enable_description')}
            aria-label={`Áudio-descrição: ${settings.descriptionEnabled ? 'Ligada. Fica disponível uma audio-descrição da obra.' : 'Desligada. A audio-descrição da obra fica indisponível.'}`}
          >
            <i className={`fa-regular ${settings.descriptionEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
            <span>Áudio-descrição: {settings.descriptionEnabled ? 'Ligada' : 'Desligada'}</span>
          </button>

          <button type="button"
            className={`setting-button ${settings.analysisEnabled ? 'active' : 'inactive'}`}
            aria-pressed={settings.analysisEnabled}
            onClick={() => onUpdate({ analysisEnabled: !settings.analysisEnabled })}
            onMouseEnter={() => announce(`${settings.analysisEnabled ? 'Desativar' : 'Ativar'} Análise Detalhada`, settings.analysisEnabled ? 'disable_analysis' : 'enable_analysis')}
            aria-label={`Análise Detalhada: ${settings.analysisEnabled ? 'Ligada. Fica disponível uma análise aprofundada do significado e contexto da obra.' : 'Desligada. A análise aprofundada da obra não fica disponível.'}`}
          >
            <i className={`fa-regular ${settings.analysisEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
            <span>Análise Detalhada: {settings.analysisEnabled ? 'Ligada' : 'Desligada'}</span>
          </button>

          <button type="button"
            className={`setting-button ${settings.sfxEnabled ? 'active' : 'inactive'}`}
            aria-pressed={settings.sfxEnabled}
            onClick={() => onUpdate({ sfxEnabled: !settings.sfxEnabled })}
            onMouseEnter={() => announce(`${settings.sfxEnabled ? 'Desativar' : 'Ativar'} Som de objetos identificados`, settings.sfxEnabled ? 'disable_sfx' : 'enable_sfx')}
            aria-label={`Som de objetos identificados: ${settings.sfxEnabled ? 'Ligado. São reproduzidos efeitos sonoros para os objetos detetados na obra.' : 'Desligado. Não são reproduzidos efeitos sonoros para os objetos da obra.'}`}
          >
            <i className={`fa-regular ${settings.sfxEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
            <span>Som de objetos identificados: {settings.sfxEnabled ? 'Ligado' : 'Desligado'}</span>
          </button>

          <button type="button"
            className={`setting-button ${settings.intentionEnabled ? 'active' : 'inactive'}`}
            aria-pressed={settings.intentionEnabled}
            onClick={() => onUpdate({ intentionEnabled: !settings.intentionEnabled })}
            onMouseEnter={() => announce(`${settings.intentionEnabled ? 'Desativar' : 'Ativar'} Intenção do Autor`, settings.intentionEnabled ? 'disable_intention' : 'enable_intention')}
            aria-label={`Intenção do Autor: ${settings.intentionEnabled ? 'Ligada. Fica disponível a leitura da intenção do autor sobre a obra.' : 'Desligada. A intenção do autor não fica disponível.'}`}
          >
            <i className={`fa-regular ${settings.intentionEnabled ? 'fa-square-check' : 'fa-square'}`}></i>
            <span>Intenção do Autor: {settings.intentionEnabled ? 'Ligada' : 'Desligada'}</span>
          </button>
        </div>

        <h3 className="settings-section-title" id="title-acessibilidade">Acessibilidade</h3>
        <div className="settings-grid" role="group" aria-labelledby="title-acessibilidade">
          <button type="button"
            className={`setting-button ${settings.screenReaderMode ? 'active' : 'inactive'}`}
            aria-pressed={settings.screenReaderMode}
            onClick={() => onUpdate({ screenReaderMode: !settings.screenReaderMode })}
            onMouseEnter={() => announce(`${settings.screenReaderMode ? 'Desativar' : 'Ativar'} Modo leitor de ecrã`, settings.screenReaderMode ? 'disable_screenreader' : 'enable_screenreader')}
            aria-label={`Modo leitor de ecrã: ${settings.screenReaderMode ? 'Ligado. A narração automática da aplicação está desativada para o seu leitor de ecrã ser a única voz. Desative esta opção apenas se não utilizar um leitor de ecrã.' : 'Desligado. A aplicação anuncia em voz alta. Ative esta opção se utilizar um leitor de ecrã, para evitar duas vozes em simultâneo.'}`}
          >
            <i className={`fa-regular ${settings.screenReaderMode ? 'fa-square-check' : 'fa-square'}`}></i>
            <span>Modo leitor de ecrã: {settings.screenReaderMode ? 'Ligado' : 'Desligado'}</span>
          </button>
        </div>

        <h3 className="settings-section-title" id="title-assistencia">Assistência e feedback</h3>
        <div className="settings-grid" role="group" aria-labelledby="title-assistencia">
          {([
            { key: 'centeringBeaconEnabled', label: 'Guia sonoro de enquadramento', on: 'Ligado. Um som contínuo ajuda a apontar e a centrar a obra.', off: 'Desligado. A orientação é apenas por voz.' },
            { key: 'earconsEnabled', label: 'Sons de estado', on: 'Ligados. Pequenos sons assinalam deteção, captura e conclusão.', off: 'Desligados.' },
            { key: 'hapticsEnabled', label: 'Vibração', on: 'Ligada. O dispositivo vibra nos momentos-chave.', off: 'Desligada.' },
            { key: 'processingBedEnabled', label: 'Som de espera', on: 'Ligado. Um som ambiente suave preenche o tempo de geração.', off: 'Desligado.' },
            { key: 'autoNarrate', label: 'Narração automática', on: 'Ligada. A áudio-descrição e a análise são lidas automaticamente.', off: 'Desligada. Escolhe o que ouvir através dos botões.' },
          ] as const).map((t) => {
            const active = settings[t.key];
            return (
              <button type="button"
                key={t.key}
                className={`setting-button ${active ? 'active' : 'inactive'}`}
                aria-pressed={settings[t.key]}
                onClick={() => onUpdate({ [t.key]: !active } as Partial<Settings>)}
                onMouseEnter={() => announce(`${active ? 'Desativar' : 'Ativar'} ${t.label}`)}
                aria-label={`${t.label}: ${active ? t.on : t.off}`}
              >
                <i className={`fa-regular ${active ? 'fa-square-check' : 'fa-square'}`}></i>
                <span>{t.label}: {active ? 'Ligado' : 'Desligado'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

