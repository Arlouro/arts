# ARTS - Art Real-Time Soundscapes

An AI-driven accessibility system that offers an alternative way to perceive visual art using emotional soundscapes for the BLV community, using YOLOv12 and the Magenta Lyria RealTime API.

**Live deployment:** [https://arts-lac.vercel.app](https://arts-lac.vercel.app)

## How it works

A camera feed is scanned for paintings (YOLOv12), the framed painting is matched against a small reference gallery (SIFT feature matching), and the result is turned into a generated soundscape, spoken description, and detected-object SFX (Gemini + ElevenLabs + Lyria), all delivered through an accessible, screen-reader-friendly interface.

The detection/identification step can run in one of two modes, controlled by `VITE_DETECTION_MODE` in `web/.env`:

- **`local`** — YOLO detection runs client-side in the browser via `onnxruntime-web`, and painting identification is handled by a serverless function (`web/api/identify.py`). No extra processes to run, no tunnel needed. This is what a Vercel deployment uses automatically.
- **`socket`** — YOLO detection runs on a full-size PyTorch model (`models/yolo/weights/best.pt`) in a separate Python process with a live OpenCV preview window, relayed to the browser over Socket.IO. Useful for local development/tuning of the detector itself, or when testing on a phone with the same detector running on a laptop.

## Prerequisites

- Node.js and npm
- Python 3 (only needed for the relay-server mode below)
- API keys: Google Gemini, ElevenLabs

## Environment setup

Copy the example env files and fill in your keys:

```bash
cp web/.env.example web/.env
cp models/yolo/src/.env.example models/yolo/src/.env   # only needed for relay-server mode
```

`web/.env`:

| Variable | Purpose |
|---|---|
| `VITE_DETECTION_MODE` | `local` or `socket`. Defaults to `socket` if `VITE_RELAY_SERVER_URL` is set, otherwise `local`. |
| `VITE_RELAY_SERVER_URL` | URL of the relay/proxy server (`http://localhost:8000` locally, or an ngrok URL — see below). Only used in `socket` mode, or as the local dev API proxy. |
| `VITE_GEMINI_API_KEY` / `GEMINI_API_KEY` | Google Gemini key, client- and server-side. |
| `ELEVENLABS_API_KEY` | ElevenLabs key, used server-side for sound effects. |

Install dependencies:

```bash
cd web
npm install
```

## Option A — Run without ngrok (recommended, matches production)

Everything runs locally with no separate detector process and no tunnel: YOLO inference happens in the browser, and identification/analysis/TTS/SFX are served from the same origin (mirroring the Vercel serverless functions in `web/api/`).

1. In `web/.env`, set `VITE_DETECTION_MODE=local`.
2. Start the dev server:

   ```bash
   cd web
   npm run dev
   ```

3. Open the printed local URL and allow camera access.

This is also exactly how the deployed Vercel app behaves — `web/api/identify.py`, `analyze.ts`, `tts/gemini.ts`, and `sfx.ts` are same-origin serverless functions, so no relay server or tunnel is involved in production either.

## Option B — Run with the relay server + ngrok

Use this when you want the higher-accuracy PyTorch detector (`best.pt`) with its live tracking window, or when testing the app on a phone that can't reach your laptop's `localhost`.

This mode needs three processes running at once, plus optionally ngrok:

1. **Relay/proxy server** (Socket.IO hub + local stand-in for the Gemini/ElevenLabs serverless functions):

   ```bash
   cd web
   npx tsx src/server/server.ts
   ```

   Runs on port `8000` by default.

2. **Python YOLO detector** (must be run from `models/yolo`, since it loads `./weights/best.pt` and `assets/json/paintings.json` relative to the working directory):

   ```bash
   pip install ultralytics opencv-python python-socketio numpy
   cd models/yolo
   python src/yolo-run.py
   ```

   Opens a local OpenCV preview window and connects to the relay server via `RELAY_SERVER_URL` (from `models/yolo/src/.env`).

3. **Frontend**, with `VITE_DETECTION_MODE=socket` (or just `VITE_RELAY_SERVER_URL` set) in `web/.env`:

   ```bash
   cd web
   npm run dev
   ```

4. **(Optional) Expose the relay server with ngrok** — needed if the device running the browser (e.g. a phone) isn't on the same machine as the relay server and Python detector:

   ```bash
   ngrok http 8000
   ```

   Copy the resulting `https://<id>.ngrok-free.app` URL into **both**:
   - `web/.env` → `VITE_RELAY_SERVER_URL`
   - `models/yolo/src/.env` → `RELAY_SERVER_URL`

   then restart the frontend and the Python detector so they pick up the new URL. The `ngrok-skip-browser-warning` header is already sent by the frontend and accepted by the relay server, so ngrok's free-tier interstitial page won't get in the way.

## Testing

```bash
cd web
npm test
```