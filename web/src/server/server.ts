import { Server } from "socket.io";
import type { Painting } from "../types/painting";

const io = new Server(8000, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });

  socket.on("painting_detected", (data: Painting) => {
    console.log("Painting detected:", data);
    io.emit("painting_detected", data);
  });

  socket.on("status_update", (data: { status: string }) => {
    console.log("Status update:", data);
    io.emit("status_update", data);
  });
  });


console.log("Server running on port 8000");

