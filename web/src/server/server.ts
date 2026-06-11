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

  socket.on("save_analysis", (data: { title: string, analysis: any, painting: Painting }) => {
    const timestamp = Date.now();
    const folderName = `${data.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_')}_${timestamp}`;
    const paintingFolder = path.join(DEBUG_FOLDER, folderName);

    if (!fs.existsSync(paintingFolder)) {
      fs.mkdirSync(paintingFolder, { recursive: true });
    }

    // Save raw JSON
    const jsonPath = path.join(paintingFolder, 'analysis.json');
    fs.writeFile(jsonPath, JSON.stringify(data.analysis, null, 2), (err) => {
      if (err) console.error("Failed to save JSON analysis:", err);
    });

    // Save Music Prompt as text file for easy reading
    if (data.analysis.MusicPrompt?.Prompt) {
      const promptPath = path.join(paintingFolder, 'music_prompt.txt');
      fs.writeFile(promptPath, data.analysis.MusicPrompt.Prompt, (err) => {
        if (err) console.error("Failed to save music prompt text:", err);
      });
    }

    // Save a summary report
    const reportPath = path.join(paintingFolder, 'summary.txt');
    const summary = `
Title: ${data.painting?.title || data.title}
Artist: ${data.painting?.artist || 'Unknown'}
Year: ${data.painting?.year || 'Unknown'}
Generated at: ${new Date(timestamp).toLocaleString()}

--- DESCRIPTION ---
${data.analysis.ArtDescription || 'N/A'}

--- ANALYSIS ---
${data.analysis.ArtAnalysis || 'N/A'}

--- MUSIC PROMPT ---
${data.analysis.MusicPrompt?.Prompt || 'N/A'}

--- DETECTED OBJECTS ---
${(data.analysis.DetectedObjects || []).map((obj: any) => `- ${obj.Object}: ${obj.SoundEffectPrompt}`).join('\n')}
    `.trim();

    fs.writeFile(reportPath, summary, (err) => {
      if (err) {
        console.error("Failed to save summary report:", err);
      } else {
        console.log(`Saved analysis results to: ${paintingFolder}`);
      }
    });
  });
});

console.log("Server running on port 8000");

