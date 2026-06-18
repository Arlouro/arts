import { useState, useCallback, useMemo } from 'react';
import { GeminiService } from '../services/GeminiService.ts';
import type { Painting } from '../types/painting.ts';

export const useGemini = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = useMemo(() => new GeminiService(), []);

  const generatePrompt = useCallback(async (painting: Painting) => {
    setLoading(true);
    setError(null);
    try {
      const prompt = await service.analyzePainting(painting);
      return prompt;
    } catch (err) {
      console.error("Error generating prompt:", err);
      setError("Failed to generate prompt. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [service]);

  return { loading, error, generatePrompt };
}
