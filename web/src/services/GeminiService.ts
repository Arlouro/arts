import type { Painting } from "../types/painting.ts";
import { withRetry, isRetryableError } from "../utils/retry.ts";

// Fallback to localhost if the environment variable is not set
const API_BASE_URL = `${import.meta.env.VITE_RELAY_SERVER_URL || "http://localhost:8000"}/api`;

export class GeminiService {
  constructor() {
  }

  async getBase64Image(path: string, rawData?: string): Promise<string> {
    if (rawData) {
      return rawData.split(',')[1] || rawData;
    }

    const response = await fetch(path);
    const blob = await response.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = (reader.result as string).split(',')[1];
        resolve(base64Data);
      };
      reader.readAsDataURL(blob);
    });
  }

  async analyzePainting(paintingData: Painting, signal?: AbortSignal): Promise<any> {
    const imageData = await this.getBase64Image(
      paintingData.imagePath, 
      paintingData.imageData
    );

    const isUnknown = paintingData.id.toString().startsWith("unknown");
    
    try {
      return await withRetry(
        async () => {
          const response = await fetch(`${API_BASE_URL}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageData,
              paintingTitle: paintingData.title,
              paintingArtist: paintingData.artist,
              paintingYear: paintingData.year,
              context: paintingData.context,
              authors_intention: paintingData.authors_intention,
              isUnknown
            }),
            signal
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Server responded with ${response.status}`);
          }

          return await response.json();
        },
        { maxAttempts: 3, baseDelayMs: 1500, shouldRetry: isRetryableError }
      );
    } catch (error) {
      console.error("Error analyzing painting after all retry attempts:", error);
      throw new Error("Failed to analyze painting. Please try again.");
    }
  }
}
