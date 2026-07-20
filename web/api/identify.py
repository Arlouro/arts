"""Vercel serverless port of models/yolo/src/identification.py.

Receives a captured painting crop (base64 data URL) and matches it against the
reference images in public/assets/images using SIFT + FLANN + RANSAC
homography. The index is built once per warm instance; a cold start pays a
few seconds building it, which is acceptable for a once-per-capture call.
"""
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

_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
_PAINTINGS_JSON = os.path.join(_ROOT, "public", "assets", "json", "paintings.json")

_index = None  # built lazily, reused across warm invocations


def _imread(path):
    try:
        data = np.fromfile(path, dtype=np.uint8)
        if data.size == 0:
            return None
        return cv2.imdecode(data, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _resize_for_sift(img, max_dim=MAX_IMAGE_DIM):
    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / max(h, w)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _build_index():
    sift = cv2.SIFT_create()
    entries = []
    with open(_PAINTINGS_JSON, "r", encoding="utf-8") as f:
        paintings = json.load(f).get("paintings", [])

    for painting in paintings:
        rel = painting.get("imagePath")
        if not rel:
            continue
        ref_path = os.path.join(_ROOT, "public", rel)
        img = _imread(ref_path)
        if img is None:
            continue
        img = _resize_for_sift(img)
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


def _identify(img):
    global _index
    if _index is None:
        _index = _build_index()

    img = _resize_for_sift(img)
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
            image_data = data.get("imageData", "")
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            if not image_data:
                return self._respond(400, {"error": "Missing imageData"})

            arr = np.frombuffer(base64.b64decode(image_data), np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                return self._respond(400, {"error": "Could not decode image"})

            match = _identify(img)
            self._respond(200, {"id": match.get("$id") if match else None})
        except Exception as exc:  # pragma: no cover
            self._respond(500, {"error": str(exc)})
