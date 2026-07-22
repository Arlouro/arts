import { useEffect, useRef, useCallback } from 'react';
import type { Painting } from '../types/painting.ts';
import type { Detection } from '../detection/yoloDetector';
import { YoloDetector } from '../detection/yoloDetector';
import { IouTracker } from '../detection/tracker';
import { FramingController, type CaptureBox } from '../detection/framingController';
import { resolvePainting } from './paintingResolver';

const API_BASE = import.meta.env.VITE_RELAY_SERVER_URL || '';

async function identifyCrop(cropDataUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData: cropDataUrl }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.id ?? null;
  } catch {
    return null;
  }
}

function decodeDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function cropToDataUrl(img: HTMLImageElement, box: CaptureBox): string {
  const w = Math.max(1, Math.round(box.x2 - box.x1));
  const h = Math.max(1, Math.round(box.y2 - box.y1));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, box.x1, box.y1, w, h, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.95);
}

export interface DevDetections {
  boxes: Detection[];
  frameW: number;
  frameH: number;
}

export const useLocalYolo = (
  active: boolean,
  onDetection: (data: Painting) => void,
  onStatus?: (status: string) => void,
  onTracking?: (data: { dx: number; dy: number; inFrame: boolean; centered: boolean }) => void,
  onDevDetections?: (data: DevDetections) => void,
) => {
  const detectorRef = useRef<YoloDetector | null>(null);
  const trackerRef = useRef(new IouTracker());
  const controllerRef = useRef(new FramingController());
  const busyRef = useRef(false);
  const pausedRef = useRef(false);
  const unknownCounterRef = useRef(0);

  const onDetectionRef = useRef(onDetection);
  onDetectionRef.current = onDetection;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const onTrackingRef = useRef(onTracking);
  onTrackingRef.current = onTracking;
  const onDevDetectionsRef = useRef(onDevDetections);
  onDevDetectionsRef.current = onDevDetections;

  useEffect(() => {
    if (!active) return;
    if (!detectorRef.current) detectorRef.current = new YoloDetector();
    detectorRef.current.load().catch(err => {
      console.error('Local YOLO: failed to load model:', err);
    });
  }, [active]);

  const emit = useCallback((event: string, _data?: unknown) => {
    if (event === 'pause_detection') pausedRef.current = true;
    else if (event === 'resume_detection') pausedRef.current = false;
  }, []);

  const handleCapture = useCallback(async (img: HTMLImageElement, trackId: number, box: CaptureBox) => {
    const crop = cropToDataUrl(img, box);
    const id = await identifyCrop(crop);
    if (id) {
      const painting = resolvePainting(id);
      if (painting) {
        onDetectionRef.current(painting);
        return;
      }
    }
    const unknown = resolvePainting(`unknown_local_${++unknownCounterRef.current}_${trackId}`, crop);
    if (unknown) onDetectionRef.current(unknown);
  }, []);

  const sendFrame = useCallback(async (imageData: string) => {
    if (!active || pausedRef.current || busyRef.current) return;
    const detector = detectorRef.current;
    if (!detector || !detector.isReady) return;

    busyRef.current = true;
    try {
      const img = await decodeDataUrl(imageData);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const detections = await detector.detect(img, w, h);
      onDevDetectionsRef.current?.({ boxes: detections, frameW: w, frameH: h });
      const now = performance.now() / 1000;
      const tracks = trackerRef.current.update(detections, now);

      controllerRef.current.process(tracks, w, h, now, {
        onStatus: s => onStatusRef.current?.(s),
        onTracking: t => onTrackingRef.current?.(t),
        onCapture: (trackId, box) => {
          handleCapture(img, trackId, box).catch(err =>
            console.error('Local YOLO: capture handling failed:', err),
          );
        },
      });
    } catch (err) {
      console.error('Local YOLO: frame processing failed:', err);
    } finally {
      busyRef.current = false;
    }
  }, [active, handleCapture]);

  return { emit, sendFrame };
};
