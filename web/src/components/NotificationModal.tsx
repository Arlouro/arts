import React, { useEffect, useRef } from 'react';

interface NotificationModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
  announce: (text: string, key?: string) => void;
  title?: string;
  /** 'warning' shows a close button. 'error' shows a restart button and red styling. */
  variant?: 'warning' | 'error';
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ 
  isOpen, 
  message, 
  onClose, 
  announce, 
  title = "Alerta",
  variant = 'warning'
}) => {
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isInitialFocus = useRef(true);

  const isError = variant === 'error';

  useEffect(() => {
    if (isOpen) {
      isInitialFocus.current = true;
      const timer = setTimeout(() => {
        const suffix = isError ? 'Botão Reiniciar Sistema.' : 'Botão Fechar.';
        const prefix = isError ? 'Erro do sistema: ' : '';
        announce(`${prefix}${message}. ${suffix}`);
        actionButtonRef.current?.focus();
      }, 150);
      
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
      
      return () => {
        clearTimeout(timer);
        dialog?.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, message, announce, isError]);

  const idPrefix = React.useId();
  const titleId = `notification-title-${idPrefix}`;
  const descId = `notification-desc-${idPrefix}`;

  if (!isOpen) return null;

  const buttonLabel = isError ? 'Reiniciar Sistema' : 'Fechar';
  const buttonAriaLabel = isError ? 'Reiniciar o sistema' : 'Fechar alerta';
  const buttonIcon = isError ? 'fa-arrows-rotate' : 'fa-circle-xmark';
  const buttonClass = isError ? 'btn-restart' : 'btn-ok';
  const dialogTitle = isError ? 'Erro do Sistema' : title;

  const content = (
    <>
      <h2 id={titleId} className="sr-only">{dialogTitle}</h2>
      <div id={descId} className="notification-message">
        {message}
      </div>
      <button type="button"
        ref={actionButtonRef}
        className={`big-button ${buttonClass}`}
        onClick={onClose}
        onMouseEnter={() => announce(buttonLabel, undefined)}
        onFocus={() => {
          // Prevent the initial auto-focus from cutting off the full message announcement
          if (!isInitialFocus.current) {
            announce(buttonLabel, undefined);
          }
          isInitialFocus.current = false;
        }}
        aria-label={buttonAriaLabel}
      >
        <span className="icon" aria-hidden="true">
          <i className={`fa-regular ${buttonIcon}`}></i>
        </span>
        <span>{buttonLabel}</span>
      </button>
    </>
  );

  return (
    <div 
      ref={dialogRef}
      className="notification-overlay" 
    >
      {isError ? (
        <div 
          className="notification-content error-variant"
          role="alertdialog"
          aria-modal="true" 
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          {content}
        </div>
      ) : (
        <div 
          className="notification-content"
          role="dialog"
          aria-modal="true" 
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          {content}
        </div>
      )}
    </div>
  );
};
