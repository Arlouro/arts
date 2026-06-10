import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    reporters: ['default', 'html', 'json'],
    outputFile: {
      html: './test-reports/index.html',
      json: './test-reports/report.json',
    },
  },
})
