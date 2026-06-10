import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { Painting } from "../types/painting.ts";
import paintingsData from "../../assets/json/paintings.json";

export const useYolo = (
  onDetection: (data: Painting) => void,
  onStatus?: (status: string) => void
) => {
  const socketRef = useRef<Socket | null>(null);

  const emit = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const sendFrame = useCallback((imageData: string) => {
    socketRef.current?.emit("process_frame", { image: imageData });
  }, []);

  useEffect(() => {
    const RELAY_URL = import.meta.env.VITE_RELAY_SERVER_URL || "http://localhost:8000";
    const socket = io(RELAY_URL);
    socketRef.current = socket;

    socket.on("status_update", (data: { status: string }) => {
      console.log("Status update received:", data.status);
      onStatus?.(data.status);
    });

    socket.on("painting_detected", (data: { id: string | number, imageData?: string }) => {
      console.log("Detection received from YOLO:", data);

      let finalPainting: Painting | null = null;
      const idStr = data.id.toString();

      if (idStr.startsWith("unknown")) {
        finalPainting = {
          id: idStr,
          title: "Desconhecido",
          artist: "Desconhecido",
          year: "Desconhecido",
          style: "Desconhecido",
          genre: "Desconhecido",
          medium: "Desconhecido",
          description: "Obra não identificada na base de dados.",
          authors_intention: "Desconhecido",
          context: "Desconhecido",
          imagePath: "",
          imageData: data.imageData
        };
      } else {

        const matched = paintingsData.paintings.find(p => p.$id === data.id);
        if (matched) {
          finalPainting = {
            id: matched.$id,
            title: matched.title,
            artist: matched.artist,
            year: matched.year,
            style: matched.style,
            genre: matched.genre,
            medium: matched.medium,
            description: matched.description,
            authors_intention: matched.authors_intention,
            context: matched.context,
            imagePath: matched.imagePath
          };
        }
      }

      if (finalPainting) {
        onDetection(finalPainting);
      }
    });

    return () => {
      socket.off("painting_detected");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [onDetection]);

  return { emit, sendFrame };
};