import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { Painting } from "../types/painting.ts";
import { resolvePainting } from "./paintingResolver";
import { useLocalYolo, type DevDetections } from "./useLocalYolo";

export interface TrackingUpdate {
  dx: number;       // horizontal offset from centre
  dy: number;       // vertical offset from centre
  inFrame: boolean; // whole artwork is within the frame
  centered: boolean;
}

const DETECTION_MODE: 'local' | 'socket' =
  import.meta.env.VITE_DETECTION_MODE === 'local' ? 'local'
  : import.meta.env.VITE_DETECTION_MODE === 'socket' ? 'socket'
  : import.meta.env.VITE_RELAY_SERVER_URL ? 'socket'
  : 'local';

const useSocketYolo = (
  active: boolean,
  onDetection: (data: Painting) => void,
  onStatus?: (status: string) => void,
  onTracking?: (data: TrackingUpdate) => void
) => {
  const socketRef = useRef<Socket | null>(null);

  const onTrackingRef = useRef(onTracking);
  onTrackingRef.current = onTracking;

  const emit = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const sendFrame = useCallback((imageData: string) => {
    socketRef.current?.emit("process_frame", { image: imageData });
  }, []);

  useEffect(() => {
    if (!active) return;

    const RELAY_URL = import.meta.env.VITE_RELAY_SERVER_URL || "http://localhost:8000";
    const socket = io(RELAY_URL, {
      extraHeaders: {
        "ngrok-skip-browser-warning": "true"
      }
    });
    socketRef.current = socket;

    socket.on("status_update", (data: { status: string }) => {
      console.log("Status update received:", data.status);
      onStatus?.(data.status);
    });

    socket.on("tracking_update", (data: TrackingUpdate) => {
      onTrackingRef.current?.(data);
    });

    socket.on("painting_detected", (data: { id: string | number, imageData?: string }) => {
      console.log("Detection received from YOLO:", data);
      const finalPainting = resolvePainting(data.id, data.imageData);
      if (finalPainting) {
        onDetection(finalPainting);
      }
    });

    return () => {
      socket.off("painting_detected");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [active, onDetection]);

  return { emit, sendFrame };
};

export const useYolo = (
  onDetection: (data: Painting) => void,
  onStatus?: (status: string) => void,
  onTracking?: (data: TrackingUpdate) => void,
  onDevDetections?: (data: DevDetections) => void,
) => {
  const socket = useSocketYolo(DETECTION_MODE === 'socket', onDetection, onStatus, onTracking);
  const local = useLocalYolo(DETECTION_MODE === 'local', onDetection, onStatus, onTracking, onDevDetections);
  return DETECTION_MODE === 'local' ? local : socket;
};
