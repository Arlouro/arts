import React, { useEffect, useRef } from 'react';

interface CameraStreamProps {
  onFrame: (imageData: string) => void;
  isPaused: boolean;
  isActive: boolean;
}

export const CameraStream: React.FC<CameraStreamProps> = ({ onFrame, isPaused, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<number | null>(null);

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

      const MAX_DIM = 640;
      const scale = Math.min(MAX_DIM / srcW, MAX_DIM / srcH, 1);
      canvas.width = Math.round(srcW * scale);
      canvas.height = Math.round(srcH * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Compress to JPEG to save bandwidth
      const imageData = canvas.toDataURL('image/jpeg', 0.6);
      onFrame(imageData);
    }
  };

  if (!isActive) return null;

  const isDevMode = import.meta.env.DEV;

  const devStyle: React.CSSProperties = isDevMode ? {
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
    <div className="camera-viewfinder" aria-hidden="true" style={devStyle}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {!isDevMode && <div className="scan-line"></div>}
    </div>
  );
};
