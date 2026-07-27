import React, { useEffect, useRef } from 'react';
import type { Settings } from '../types/settings';

interface SettingsMenuProps {
  settings: Settings;
  onUpdate: (updates: Partial<Settings>) => void;
  onClose: () => void;
  announce: (text: string, key?: string, force?: boolean) => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ settings, onUpdate, onClose, announce }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const handleBackToTop = () => {
    titleRef.current?.focus({ preventScroll: true });
    const reduceMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    dialogRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

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

  type ToggleItem = { key: keyof Settings; label: string; on: string; off: string };

  const filterToggles: ToggleItem[] = [
    { key: 'musicEnabled', label: 'Música', on: 'Ligada. A paisagem sonora musical gerada para o quadro é reproduzida.', off: 'Desligada. A paisagem sonora musical não é reproduzida.' },
    { key: 'descriptionEnabled', label: 'Áudio-descrição', on: 'Ligada. Fica disponível uma audio-descrição do quadro.', off: 'Desligada. A audio-descrição do quadro fica indisponível.' },
    { key: 'analysisEnabled', label: 'Análise Detalhada', on: 'Ligada. Fica disponível uma análise aprofundada do significado e contexto do quadro.', off: 'Desligada. A análise aprofundada do quadro não fica disponível.' },
    { key: 'sfxEnabled', label: 'Som de objetos identificados', on: 'Ligado. São reproduzidos efeitos sonoros para os objetos detetados no quadro.', off: 'Desligado. Não são reproduzidos efeitos sonoros para os objetos do quadro.' },
    { key: 'intentionEnabled', label: 'Intenção do Autor', on: 'Ligada. Fica disponível a leitura da intenção do autor sobre o quadro.', off: 'Desligada. A intenção do autor não fica disponível.' },
  ];

  const accessibilityToggles: ToggleItem[] = [
    { key: 'screenReaderMode', label: 'Modo leitor de ecrã', on: 'Ligado. A narração automática da aplicação está desativada para o seu leitor de ecrã ser a única voz. Desative esta opção apenas se não utilizar um leitor de ecrã.', off: 'Desligado. A aplicação anuncia em voz alta. Ative esta opção se utilizar um leitor de ecrã, para evitar duas vozes em simultâneo.' },
  ];

  const assistanceToggles: ToggleItem[] = [
    { key: 'centeringBeaconEnabled', label: 'Guia sonoro de enquadramento', on: 'Ligado. Um som contínuo ajuda a apontar e a centrar o quadro.', off: 'Desligado. A orientação é apenas por voz.' },
    { key: 'framingVoiceEnabled', label: 'Guia por voz de enquadramento', on: 'Ligado. O sistema diz como mover o dispositivo até o quadro ficar enquadrado.', off: 'Desligado. O enquadramento é indicado apenas pelo guia sonoro e pela vibração.' },
    { key: 'hapticsEnabled', label: 'Vibração', on: 'Ligada. O dispositivo vibra nos momentos-chave.', off: 'Desligada. O dispositivo não vibra.' },
    { key: 'autoNarrate', label: 'Narração automática', on: 'Ligada. A áudio-descrição e a análise são lidas automaticamente.', off: 'Desligada. Escolhe o que ouvir através dos botões.' },
  ];

  const renderToggle = (t: ToggleItem) => {
    const active = !!settings[t.key];
    const shortState = (active ? t.on : t.off).split('.')[0];
    return (
      <button type="button"
        key={t.key}
        className={`setting-button ${active ? 'active' : 'inactive'}`}
        aria-pressed={active}
        onClick={() => {
          const next = !active;
          onUpdate({ [t.key]: next } as Partial<Settings>);
          announce(`${t.label}: ${next ? t.on : t.off}`, undefined, true);
        }}
        onMouseEnter={() => announce(`${active ? 'Desativar' : 'Ativar'} ${t.label}`, undefined, true)}
        aria-label={`${t.label}: ${active ? t.on : t.off}`}
      >
        <i className={`fa-regular ${active ? 'fa-square-check' : 'fa-square'}`}></i>
        <span>{t.label}: {shortState}</span>
      </button>
    );
  };

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
        <h1 id="settings-title" ref={titleRef} tabIndex={-1}>Definições</h1>
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
        <h2 className="settings-section-title" id="title-filtros">Filtros</h2>
        <div className="settings-grid" role="group" aria-labelledby="title-filtros">
          {filterToggles.map(renderToggle)}
        </div>

        <h2 className="settings-section-title" id="title-acessibilidade">Acessibilidade</h2>
        <div className="settings-grid" role="group" aria-labelledby="title-acessibilidade">
          {accessibilityToggles.map(renderToggle)}
        </div>

        <h2 className="settings-section-title" id="title-assistencia">Assistência e feedback</h2>
        <div className="settings-grid" role="group" aria-labelledby="title-assistencia">
          {assistanceToggles.map(renderToggle)}
        </div>

        <button type="button"
          className="settings-back-to-top"
          onClick={handleBackToTop}
          onMouseEnter={() => announce("Voltar ao topo das definições", undefined, true)}
          aria-label="Voltar ao topo das definições"
        >
          <i className="fa-solid fa-arrow-up" aria-hidden="true"></i>
          <span>Voltar ao topo</span>
        </button>
      </div>
    </div>
  );
};

