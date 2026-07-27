import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if (import.meta.env.DEV) {
  const axe = await import('@axe-core/react');
  axe.default(React, { createRoot }, 1000);
}

if (new URLSearchParams(window.location.search).has('reset')) {
  try {
    localStorage.removeItem('arts_onboarding_seen');
    localStorage.removeItem('arts-settings');
  } catch {
  }
  window.history.replaceState(null, '', window.location.pathname);
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
