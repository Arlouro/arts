import React, { useEffect, useRef } from 'react';

interface OnboardingModalProps {
  onStart: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onStart }) => {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <div className="onboarding-overlay">
      <div 
        className="onboarding-content"
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
      >
        <h1 id="onboarding-title" ref={titleRef} tabIndex={-1}>Bem-vindo ao ARTS</h1>
        <p id="onboarding-desc" className="onboarding-subtitle">
          Este sistema utiliza obras de arte visuais para gerar paisagens sonoras, criando uma experiência alternativa e imersiva para a apreciação da arte.
        </p>
        
        <div className="onboarding-steps">
          <p className="step-item">
            <strong>Passo 1 - Aponte a câmara:</strong> Direcione o seu dispositivo para uma obra de arte. O sistema irá guiar a sua câmara por áudio para centrar a imagem.
          </p>
          <p className="step-item">
            <strong>Passo 2 - Aguarde a análise:</strong> O processamento da imagem e a geração da música demoram alguns segundos.
          </p>
          <p className="step-item">
            <strong>Passo 3 - Explore o som:</strong> Ouvirá a paisagem sonora e poderá explorar descrições e detalhes através dos botões no ecrã.
          </p>
        </div>

        <button 
          type="button" 
          className="big-button btn-start onboarding-start-btn" 
          onClick={onStart}
          aria-label="Começar Experiência"
        >
          <span>Começar Experiência</span>
        </button>
      </div>
    </div>
  );
};
