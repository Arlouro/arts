import { useEffect } from "react";

export const useYolo = (onDetection: (data:any) => void) => {
  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8000/ws/");
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("Painting Detected:", data);
      onDetection(data);
    };
    
    socket.close = () => {      console.log("WebSocket connection closed.");
      console.log("WebSocket connection closed.");
    };

    return () => {
      socket.close();
    };
  }, [onDetection]);
};