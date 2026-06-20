import { useEffect } from 'react';
import './App.css';
import { LyriaPlayer } from './components/LyriaPlayer';

const playUiClick = (element: HTMLElement) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    if (!(window as any).__uiAudioContext) {
      (window as any).__uiAudioContext = new AudioContextClass();
    }
    const ctx = (window as any).__uiAudioContext;
    
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    let startFreq = 600;
    let endFreq = 400;

    if (element.classList.contains('setting-button')) {
      if (element.classList.contains('active')) {
        startFreq = 400;
        endFreq = 200;
      } else {
        startFreq = 800;
        endFreq = 1200;
      }
    } else if (element.classList.contains('close-button')) {
      startFreq = 400;
      endFreq = 200;
    }

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.warn("UI Click audio failed", e);
  }
};

function App() {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button');
      if (button) {
        playUiClick(button);
      }
    };
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <LyriaPlayer />
  );
}

export default App;
