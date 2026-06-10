import '@testing-library/jest-dom';
import * as matchers from 'vitest-axe/matchers';
import { expect, vi } from 'vitest';
import type { AxeMatchers } from 'vitest-axe';

expect.extend(matchers);

declare module 'vitest' {
  export interface Assertion<T = any> extends AxeMatchers {}
  export interface AsymmetricMatchersContaining extends AxeMatchers {}
}

Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => []),
  },
});

// @ts-ignore
window.SpeechSynthesisUtterance = class {
  lang = '';
  text = '';
  constructor(text?: string) {
    this.text = text || '';
  }
};

global.fetch = vi.fn().mockImplementation(() => 
  Promise.resolve({
    json: () => Promise.resolve({ paintings: [] }),
    ok: true,
  })
);
