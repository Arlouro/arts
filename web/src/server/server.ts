import { Server } from "socket.io";
import type { Painting } from "../types/painting";
import * as fs from "fs";
import * as path from "path";

const DEBUG_FOLDER = path.join(process.cwd(), "debug_analysis");

if (!fs.existsSync(DEBUG_FOLDER)) {
  fs.mkdirSync(DEBUG_FOLDER, { recursive: true });
}

const io = new Server(8000, {
  cors: {
    origin: "*",
    allowedHeaders: ["ngrok-skip-browser-warning"]
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

  socket.on("pause_detection", () => {
    console.log("Pausing YOLO detection to save performance.");
    io.emit("pause_detection");
  });

  socket.on("resume_detection", () => {
    console.log("Resuming YOLO detection.");
    io.emit("resume_detection");
  });

  socket.on("process_frame", (data: { image: string }) => {
    // Relay the image to the Python script
    io.emit("process_frame", data);
  });

  socket.on("status_update", (data: { status: string }) => {
    console.log("Status update:", data);
    io.emit("status_update", data);
  });

  socket.on("save_analysis", (data: { title: string, analysis: any }) => {
    const filename = `analysis_${data.title.replace(/\s+/g, '_')}_${Date.now()}.json`;
    const filePath = path.join(DEBUG_FOLDER, filename);
    
    fs.writeFile(filePath, JSON.stringify(data.analysis, null, 2), (err) => {
      if (err) {
        console.error("Failed to save debug analysis:", err);
      } else {
        console.log(`Debug analysis saved to: ${filePath}`);
      }
    });
  });
});

console.log("Server running on port 8000");

