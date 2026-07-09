import { useState, useEffect, useRef } from 'react';
import { LyriaService } from '../services/LyriaService.ts';
import type { ServiceStatus } from '../types/lyria.ts';

export const useLyria = (apiKey: string) => {
  const [status, setStatus] = useState<ServiceStatus>('idle');
  const serviceRef = useRef<LyriaService | null>(null);

  useEffect(() => {
    const service = new LyriaService(apiKey);
    service.onStatusChange = (newStatus) => setStatus(newStatus);
    serviceRef.current = service;

    return () => { void service.stop(); };
  }, [apiKey]);

  const generateMusic = (prompt: string) => {
    serviceRef.current?.connect([{ text: prompt, weight: 1.0 }]);
  };

  const stopMusic = () => {
    serviceRef.current?.stop();
  };

  return { status, generateMusic, stopMusic };
};