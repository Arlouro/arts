import React, { useEffect, useRef, useState } from 'react';

interface OnboardingModalProps {
  onStart: () => void;
  announce: (text: string, key?: string, force?: boolean) => void;
}

interface OnboardingPage {
  icon: string;
  title: string;
  description: string;
  detail: string;
}

const PAGES: OnboardingPage[] = [
  {
    icon: 'fa-solid fa-music',
    title: 'Bem-vindo ao ARTS',
    description:
      'Transformamos obras de arte visuais em experiências sonoras acessíveis.',
    detail:
      'Uma forma alternativa e inclusiva de apreciar a arte através do som.',
  },
  {
    icon: 'fa-solid fa-camera',
    title: 'Aponte a Câmara',
    description:
      'Clique no botão "Procurar quadro" e direcione o seu dispositivo para uma obra de arte.',
    detail:
      'O sistema deteta a obra automaticamente. Mantenha o dispositivo estável para uma captura precisa.',
  },
  {
    icon: 'fa-solid fa-wand-magic-sparkles',
    title: 'Aguarde a Criação',
    description:
      'O sistema analisa o contexto emocional da obra e compõe uma paisagem sonora única.',
    detail:
      'Este processo demora alguns segundos — aguarde enquanto a paisagem sonora é gerada.',
  },
  {
    icon: 'fa-solid fa-headphones',
    title: 'Explore o Som',
    description:
      'Ouça a paisagem sonora e explore as diferentes camadas de informação sobre a obra.',
    detail:
      'Áudio-descrição, análise detalhada e intenção do autor — tudo ao toque de um botão.',
  },
];

/** Each page gets its own accent colour for visual differentiation */
const PAGE_COLORS = ['#2196f3', '#ffeb3b', '#ff9800', '#4caf50'];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onStart, announce }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isLastPage = currentPage === PAGES.length - 1;
  const isFirstPage = currentPage === 0;
  const page = PAGES[currentPage];

  // Move focus to the page heading whenever the step changes
  useEffect(() => {
    requestAnimationFrame(() => {
      headingRef.current?.focus();
    });
  }, [currentPage]);

  // Keyboard focus trap: Tab cycles within the dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [currentPage]);

  const navigateTo = (pageIndex: number) => {
    setDirection(pageIndex > currentPage ? 'next' : 'prev');
    setCurrentPage(pageIndex);
  };

  const handleNext = () => {
    if (isLastPage) {
      onStart();
    } else {
      navigateTo(currentPage + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstPage) {
      navigateTo(currentPage - 1);
    }
  };

  return (
    <div className="onboarding-overlay">
      <div
        ref={dialogRef}
        className="onboarding-wizard"
        role="dialog"
        aria-modal="true"
        aria-roledescription="assistente de configuração"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-desc"
        style={
          { '--page-accent': PAGE_COLORS[currentPage] } as React.CSSProperties
        }
      >
        {/* Skip button */}
        {!isLastPage && (
          <button
            type="button"
            className="onboarding-skip"
            onClick={onStart}
            onMouseEnter={() => announce("Saltar introdução", "onboarding_skip", true)}
            aria-label="Saltar introdução e começar a usar o ARTS"
          >
            Saltar
            <i className="fa-solid fa-forward" aria-hidden="true" />
          </button>
        )}

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          Passo {currentPage + 1} de {PAGES.length}: {page.title}
        </div>

        <div
          className="onboarding-page"
          key={currentPage}
          data-direction={direction}
        >
          <div className="onboarding-icon-wrapper" aria-hidden="true">
            <div className="onboarding-icon-glow" />
            <div className="onboarding-icon-circle">
              <i className={page.icon} />
            </div>
          </div>

          <h1
            id="onboarding-title"
            ref={headingRef}
            tabIndex={-1}
            className="onboarding-page-title"
          >
            {page.title}
          </h1>

          <p id="onboarding-desc" className="onboarding-page-description">
            {page.description}
          </p>

          <p className="onboarding-page-detail">{page.detail}</p>
        </div>

        {/* Step indicator dots */}
        <nav
          className="onboarding-step-nav"
          aria-label="Passos da introdução"
        >
          <ol className="onboarding-dots">
            {PAGES.map((p, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`onboarding-dot${
                    i === currentPage ? ' onboarding-dot--active' : ''
                  }`}
                  onClick={() => navigateTo(i)}
                  onMouseEnter={() => announce(`Ir para passo ${i + 1}`, `onboarding_dot_${i}`, true)}
                  aria-label={`Ir para passo ${i + 1} de ${PAGES.length}: ${
                    p.title
                  }`}
                  aria-current={i === currentPage ? 'step' : undefined}
                />
              </li>
            ))}
          </ol>
        </nav>

        {/* Navigation buttons */}
        <div className="onboarding-nav">
          <button
            type="button"
            className="onboarding-nav-btn onboarding-nav-btn--prev"
            onClick={handlePrev}
            onMouseEnter={() => !isFirstPage && announce("Passo anterior", "onboarding_prev", true)}
            disabled={isFirstPage}
            aria-label="Passo anterior"
          >
            <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            <span>Anterior</span>
          </button>

          <button
            type="button"
            className={`onboarding-nav-btn onboarding-nav-btn--next${
              isLastPage ? ' onboarding-nav-btn--start' : ''
            }`}
            onClick={handleNext}
            onMouseEnter={() => announce(isLastPage ? "Começar" : "Próximo passo", "onboarding_next", true)}
            aria-label={
              isLastPage ? 'Começar a usar o ARTS' : 'Próximo passo'
            }
          >
            <span>{isLastPage ? 'Começar' : 'Seguinte'}</span>
            <i
              className={`fa-solid ${
                isLastPage ? 'fa-play' : 'fa-chevron-right'
              }`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
};
