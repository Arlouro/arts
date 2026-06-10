import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { LyriaPlayer } from './LyriaPlayer';
import { useOrchestrator } from '../hooks/useOrchestrator';

vi.mock('../hooks/useOrchestrator', () => ({
  useOrchestrator: vi.fn(() => ({
    isProcessing: false,
    activePainting: null,
    currentPrompt: '',
    detectionStatus: 'idle',
    descriptionText: '',
    analysisText: '',
    authorsIntentionText: '',
    isPaused: false,
    isDescriptionPlaying: false,
    isAnalysisPlaying: false,
    isIntentionPlaying: false,
    settings: { masterVolume: 0.5, descriptionEnabled: true, analysisEnabled: true, intentionEnabled: true, musicEnabled: true, sfxEnabled: true, ttsRate: 1.0 },
    updateSettings: vi.fn(),
    playDescription: vi.fn(),
    playAnalysis: vi.fn(),
    playAuthorsIntention: vi.fn(),
    togglePause: vi.fn(),
    processNewDetection: vi.fn(),
    stopAll: vi.fn(),
  })),
}));

describe('LyriaPlayer Accessibility', () => {
  it('should have no violations on initial load (idle state)', async () => {
    const { container } = render(<LyriaPlayer />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no violations when a painting is detected', async () => {
    vi.mocked(useOrchestrator).mockReturnValue({
      isProcessing: false,
      activePainting: { title: 'Mona Lisa', artist: 'Leonardo da Vinci' } as any,
      currentPrompt: 'A beautiful song',
      detectionStatus: 'centered',
      descriptionText: 'Uma pintura famosa...',
      analysisText: 'Análise detalhada...',
      authorsIntentionText: 'A intenção...',
      isPaused: false,
    isDescriptionPlaying: false,
    isAnalysisPlaying: false,
    isIntentionPlaying: false,
      settings: { masterVolume: 0.5, descriptionEnabled: true, analysisEnabled: true, intentionEnabled: true, musicEnabled: true, sfxEnabled: true, ttsRate: 1.0 },
      updateSettings: vi.fn(),
      playDescription: vi.fn(),
      playAnalysis: vi.fn(),
      playAuthorsIntention: vi.fn(),
      togglePause: vi.fn(),
      processNewDetection: vi.fn(),
      setGlobalDucking: vi.fn(),
      stopAll: vi.fn(),
      sendFrame: vi.fn(),
    });

    const { container } = render(<LyriaPlayer />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no violations when settings menu is open', async () => {
    const { container } = render(<LyriaPlayer />);
    
    const settingsBtn = screen.getByLabelText(/Abrir definições/i);
    fireEvent.click(settingsBtn);
    
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Screen Reader & Blind User Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOrchestrator).mockReturnValue({
      isProcessing: false,
      activePainting: null,
      currentPrompt: '',
      detectionStatus: 'idle',
      descriptionText: '',
      analysisText: '',
      authorsIntentionText: '',
      isPaused: false,
    isDescriptionPlaying: false,
    isAnalysisPlaying: false,
    isIntentionPlaying: false,
      settings: { masterVolume: 0.5, descriptionEnabled: true, analysisEnabled: true, intentionEnabled: true, musicEnabled: true, sfxEnabled: true, ttsRate: 1.0 },
      updateSettings: vi.fn(),
      playDescription: vi.fn(),
      playAnalysis: vi.fn(),
      playAuthorsIntention: vi.fn(),
      togglePause: vi.fn(),
      processNewDetection: vi.fn(),
      setGlobalDucking: vi.fn(),
      stopAll: vi.fn(),
      sendFrame: vi.fn(),
    });
  });

  it('should have an assertive aria-live region for critical system status updates', () => {
    const { container } = render(<LyriaPlayer />);
    const liveRegion = container.querySelector('[aria-live="assertive"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('should have a polite aria-live region for secondary context', () => {
    const { container } = render(<LyriaPlayer />);
    const politeRegion = container.querySelector('[aria-live="polite"]');
    expect(politeRegion).toBeInTheDocument();
    expect(politeRegion).toHaveClass('sr-only');
  });

  it('should use descriptive aria-labels on all action buttons', () => {
    const { getByLabelText } = render(<LyriaPlayer />);
    expect(getByLabelText(/Abrir definições do sistema/i)).toBeInTheDocument();
    expect(getByLabelText(/Pausar sistema e parar áudio/i)).toBeInTheDocument();
    expect(getByLabelText(/Procurar outro quadro/i)).toBeInTheDocument();
  });
});
