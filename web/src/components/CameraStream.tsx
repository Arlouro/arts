import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { DevDetections } from '../hooks/useLocalYolo';

/**
 * Runtime debug overlay flag.
 * - Activate:   add ?debug=1 to the URL (persists via localStorage)
 * - Deactivate: add ?debug=0 to the URL
 * - Also always active when running the Vite dev server.
 */
function useDebugOverlay(): boolean {
  const [enabled, setEnabled] = useState(() => {
    if (import.meta.env.DEV) return true;
    const params = new URLSearchParams(window.location.search);
    const urlFlag = params.get('debug');
    if (urlFlag !== null) {
      const on = urlFlag === '1' || urlFlag === 'true';
      try { localStorage.setItem('arts_debug_overlay', on ? '1' : '0'); } catch {}
      return on;
    }
    try { return localStorage.getItem('arts_debug_overlay') === '1'; } catch { return false; }
  });

  useEffect(() => {
    const check = () => {
      const params = new URLSearchParams(window.location.search);
      const urlFlag = params.get('debug');
      if (urlFlag !== null) {
        const on = urlFlag === '1' || urlFlag === 'true';
        try { localStorage.setItem('arts_debug_overlay', on ? '1' : '0'); } catch {}
        setEnabled(on);
      }
    };
    window.addEventListener('popstate', check);
    return () => window.removeEventListener('popstate', check);
  }, []);

  return enabled;
}

interface CameraStreamProps {
  onFrame: (imageData: string) => void;
  isPaused: boolean;
  isActive: boolean;
  /** Raw YOLO detections to draw as bounding-box overlays (debug mode). */
  devDetections?: DevDetections | null;
}

export const CameraStream: React.FC<CameraStreamProps> = ({ onFrame, isPaused, isActive, devDetections }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<number | null>(null);
  const showOverlay = useDebugOverlay();

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment', // Use back camera on mobile
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    if (isActive) {
      startCamera();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive]);

  useEffect(() => {
    if (isActive && !isPaused) {
      intervalRef.current = window.setInterval(() => {
        captureFrame();
      }, 200); // Send frame every 200ms
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isPaused]);

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      if (!srcW || !srcH) return;

      const MAX_DIM = 1280;
      const scale = Math.min(MAX_DIM / srcW, MAX_DIM / srcH, 1);
      canvas.width = Math.round(srcW * scale);
      canvas.height = Math.round(srcH * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Compress to JPEG
      const imageData = canvas.toDataURL('image/jpeg', 0.85);
      onFrame(imageData);
    }
  };

  // ── Debug overlay: draw bounding boxes ────────────────────────────
  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video || !devDetections) return;

    const { boxes, frameW, frameH } = devDetections;

    // Match canvas resolution to the displayed video size so strokes stay crisp
    const rect = overlay.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    overlay.width = rect.width * dpr;
    overlay.height = rect.height * dpr;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Scale detection pixel coords → overlay CSS coords
    const sx = rect.width / frameW;
    const sy = rect.height / frameH;

    for (const det of boxes) {
      const x = det.x1 * sx;
      const y = det.y1 * sy;
      const w = (det.x2 - det.x1) * sx;
      const h = (det.y2 - det.y1) * sy;
      const pct = (det.conf * 100).toFixed(0);

      // Color: green when high confidence, amber otherwise
      const color = det.conf > 0.85 ? '#00ff88' : '#ffaa00';

      // Box
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // Label background
      const label = `painting ${pct}%`;
      ctx.font = 'bold 11px monospace';
      const tm = ctx.measureText(label);
      const lh = 16;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y - lh, tm.width + 8, lh);

      // Label text
      ctx.fillStyle = color;
      ctx.fillText(label, x + 4, y - 4);
    }
  }, [devDetections]);

  useEffect(() => {
    if (showOverlay && devDetections) {
      drawOverlay();
    }
  }, [showOverlay, devDetections, drawOverlay]);

  if (!isActive) return null;

  const devStyle: React.CSSProperties = showOverlay ? {
    opacity: 1,
    zIndex: 100,
    width: '30vw',
    height: 'auto',
    minWidth: '150px',
    top: 'auto',
    bottom: '2vh',
    left: '2vw',
    border: '3px solid var(--accent)',
    borderRadius: '1.5vh',
    overflow: 'hidden',
    boxShadow: '0 0 20px rgba(0,0,0,0.8)'
  } : {};

  return (
    <div className="camera-viewfinder" aria-hidden="true" style={{ ...devStyle, position: showOverlay ? 'fixed' : undefined }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {showOverlay && (
        <canvas
          ref={overlayRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
      )}
      {!showOverlay && <div className="scan-line"></div>}
    </div>
  );
};
