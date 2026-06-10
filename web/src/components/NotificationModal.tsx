import React, { useEffect, useRef } from 'react';

interface NotificationModalProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
  announce: (text: string, key?: string) => void;
  title?: string;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({ 
  isOpen, 
  message, 
  onClose, 
  announce, 
  title = "Alerta" 
}) => {
  const okButtonRef = useRef<HTMLButtonElement>(null);
  const isInitialFocus = useRef(true);

  useEffect(() => {
    if (isOpen) {
      isInitialFocus.current = true;
      const timer = setTimeout(() => {
        announce(`${message}. Botão Fechar.`);
        okButtonRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, message, announce]);

  if (!isOpen) return null;

  return (
    <div 
      className="notification-overlay" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="notification-title"
      aria-describedby="notification-desc"
    >
      <div className="notification-content">
        <h2 id="notification-title" className="sr-only">{title}</h2>
        <div id="notification-desc" className="notification-message">
          {message}
        </div>
        <button 
          ref={okButtonRef}
          className="big-button btn-ok"
          onClick={onClose}
          onMouseEnter={() => announce("Fechar", undefined)}
          onFocus={() => {
            // Prevent the initial auto-focus from cutting off the full message announcement
            if (!isInitialFocus.current) {
              announce("Fechar", undefined);
            }
            isInitialFocus.current = false;
          }}
          aria-label="Fechar alerta"
        >
          <span className="icon" aria-hidden="true">
            <i className="fa-regular fa-circle-xmark"></i>
          </span>
          <span>Fechar</span>
        </button>
      </div>
    </div>
  );
};
