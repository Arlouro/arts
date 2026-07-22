import base64
import json
import os
from http.server import BaseHTTPRequestHandler

import cv2
import numpy as np

MIN_MATCH_COUNT = 15
MIN_INLIERS = 15
DISAMBIGUATION_RATIO = 1.3
EARLY_EXIT_INLIERS = 50
EARLY_EXIT_RATIO = 2.0
MAX_IMAGE_DIM = 800

CLAHE_CLIP_LIMIT = 2.0
CLAHE_TILE_GRID = (8, 8)
_clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID)

_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
_PAINTINGS_JSON = os.path.join(_ROOT, "public", "assets", "json", "paintings.json")

_index = None  # built lazily, reused across warm invocations


import urllib.request

def _urlread(url):
    try:
        req = urllib.request.urlopen(url)
        arr = np.asarray(bytearray(req.read()), dtype=np.uint8)
        if arr.size == 0:
            return None
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None

def _resize_for_sift(img, max_dim=MAX_IMAGE_DIM):
    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / max(h, w)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)

def _preprocess_for_sift(img):
    img = _resize_for_sift(img)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return _clahe.apply(gray)

def _build_index(base_url):
    sift = cv2.SIFT_create()
    entries = []
    
    json_url = f"{base_url}/assets/json/paintings.json"
    try:
        req = urllib.request.urlopen(json_url)
        paintings = json.loads(req.read().decode('utf-8')).get("paintings", [])
    except Exception as e:
        print(f"Failed to fetch json from {json_url}: {e}")
        paintings = []

    for painting in paintings:
        rel = painting.get("imagePath")
        if not rel:
            continue
        
        img_url = f"{base_url}/{rel}"
        img = _urlread(img_url)
        if img is None:
            continue
        
        img = _preprocess_for_sift(img)
        keypoints, descriptors = sift.detectAndCompute(img, None)
        if descriptors is None:
            continue
            
        entries.append({
            "painting": painting,
            "keypoints": keypoints,
            "descriptors": descriptors,
        })

    flann = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=50))
    return {"sift": sift, "flann": flann, "entries": entries}

def _identify(img, base_url):
    global _index
    if _index is None:
        _index = _build_index(base_url)

    img = _preprocess_for_sift(img)
    keypoints, descriptors = _index["sift"].detectAndCompute(img, None)
    if descriptors is None:
        return None

    best_match = None
    max_inliers = 0
    second_max_inliers = 0

    for entry in _index["entries"]:
        try:
            matches = _index["flann"].knnMatch(descriptors, entry["descriptors"], k=2)
        except Exception:
            continue

        good = [m for pair in matches if len(pair) == 2
                for m, n in [pair] if m.distance < 0.7 * n.distance]

        inliers = 0
        if len(good) >= MIN_MATCH_COUNT:
            src = np.float32([keypoints[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
            dst = np.float32([entry["keypoints"][m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
            _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
            if mask is not None:
                inliers = int(np.sum(mask))

        if inliers > max_inliers:
            second_max_inliers = max_inliers
            max_inliers = inliers
            best_match = entry["painting"]
        elif inliers > second_max_inliers:
            second_max_inliers = inliers

        if max_inliers >= EARLY_EXIT_INLIERS and second_max_inliers > 0:
            if max_inliers / second_max_inliers >= EARLY_EXIT_RATIO:
                break

    if max_inliers < MIN_INLIERS:
        return None
    if second_max_inliers > 0 and max_inliers / second_max_inliers < DISAMBIGUATION_RATIO:
        return None
    return best_match


class handler(BaseHTTPRequestHandler):
    def _respond(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
            if data.get("debug"):
                global _index
                if _index is None:
                    host = self.headers.get("Host", "arts-lac.vercel.app")
                    scheme = self.headers.get("X-Forwarded-Proto", "https")
                    _index = _build_index(f"{scheme}://{host}")
                return self._respond(200, {"loaded_paintings": len(_index["entries"])})

            image_data = data.get("imageData", "")
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            if not image_data:
                return self._respond(400, {"error": "Missing imageData"})

            arr = np.frombuffer(base64.b64decode(image_data), np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                return self._respond(400, {"error": "Could not decode image"})

            host = self.headers.get("Host", "arts-lac.vercel.app")
            scheme = self.headers.get("X-Forwarded-Proto", "https")
            base_url = f"{scheme}://{host}"

            match = _identify(img, base_url)
            self._respond(200, {"id": match.get("$id") if match else None})
        except Exception as exc:  # pragma: no cover
            self._respond(500, {"error": str(exc)})
