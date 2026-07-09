import cv2
import json
import os
import numpy as np
import time

MIN_MATCH_COUNT = 15
MIN_INLIERS = 15
DISAMBIGUATION_RATIO = 1.3

EARLY_EXIT_INLIERS = 50
EARLY_EXIT_RATIO = 2.0

MAX_IMAGE_DIM = 800


def _resize_for_sift(img, max_dim=MAX_IMAGE_DIM):
    h, w = img.shape[:2]
    if max(h, w) <= max_dim:
        return img
    scale = max_dim / max(h, w)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


class PaintingIndex:
    def __init__(self, paintings_json_path):
        self.sift = cv2.SIFT_create()

        FLANN_INDEX_KDTREE = 1
        index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
        search_params = dict(checks=50)
        self.flann = cv2.FlannBasedMatcher(index_params, search_params)

        self.entries = []
        self._build_index(paintings_json_path)

    def _build_index(self, paintings_json_path):
        start = time.time()

        try:
            with open(paintings_json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                paintings = data.get("paintings", [])
        except Exception as e:
            print(f"Error loading paintings JSON: {e}")
            return

        json_dir = os.path.dirname(paintings_json_path)
        yolo_root = os.path.abspath(os.path.join(json_dir, "..", ".."))

        for painting in paintings:
            image_rel_path = painting.get("imagePath")
            if not image_rel_path:
                continue

            ref_path = os.path.join(yolo_root, image_rel_path)

            if not os.path.exists(ref_path):
                print(f"  Warning: Reference image not found at {ref_path}")
                continue

            img = cv2.imread(ref_path)
            if img is None:
                continue

            img = _resize_for_sift(img)
            keypoints, descriptors = self.sift.detectAndCompute(img, None)
            if descriptors is None:
                continue

            self.entries.append({
                'painting': painting,
                'keypoints': keypoints,
                'descriptors': descriptors,
            })
            print(f"  Indexed: {painting.get('title', '?')} ({len(keypoints)} keypoints)")

        elapsed = time.time() - start
        print(f"PaintingIndex: Indexed {len(self.entries)} paintings in {elapsed:.2f}s")

    def identify(self, captured_path):
        if not os.path.exists(captured_path):
            print(f"Error: Captured image not found at {captured_path}")
            return None

        img = cv2.imread(captured_path)
        if img is None:
            print("Error: Could not read captured image.")
            return None

        img = _resize_for_sift(img)
        keypoints, descriptors = self.sift.detectAndCompute(img, None)
        if descriptors is None:
            print("Error: No features detected in captured image.")
            return None

        start = time.time()

        best_match = None
        max_inliers = 0
        second_max_inliers = 0

        for entry in self.entries:
            ref_kp = entry['keypoints']
            ref_desc = entry['descriptors']

            try:
                matches = self.flann.knnMatch(descriptors, ref_desc, k=2)
            except Exception:
                continue

            # ── Lowe's ratio test ─────────────────────────────────────────────────
            good_matches = []
            for m_info in matches:
                if len(m_info) == 2:
                    m, n = m_info
                    if m.distance < 0.7 * n.distance:
                        good_matches.append(m)

            inliers = 0

            # ── Geometric verification (RANSAC homography) ────────────────────────
            if len(good_matches) >= MIN_MATCH_COUNT:
                src_pts = np.float32(
                    [keypoints[m.queryIdx].pt for m in good_matches]
                ).reshape(-1, 1, 2)
                dst_pts = np.float32(
                    [ref_kp[m.trainIdx].pt for m in good_matches]
                ).reshape(-1, 1, 2)

                M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

                if mask is not None:
                    inliers = int(np.sum(mask))

            if inliers > max_inliers:
                second_max_inliers = max_inliers
                max_inliers = inliers
                best_match = entry['painting']
            elif inliers > second_max_inliers:
                second_max_inliers = inliers

            if max_inliers >= EARLY_EXIT_INLIERS and second_max_inliers > 0:
                ratio = max_inliers / second_max_inliers
                if ratio >= EARLY_EXIT_RATIO:
                    print(f"  Early exit: {max_inliers} inliers, ratio {ratio:.2f}")
                    break

        elapsed = time.time() - start

        # ── Minimum inlier threshold ──────────────────────────────────────
        if max_inliers < MIN_INLIERS:
            print(f"No good match found. Max inliers: {max_inliers} ({elapsed:.2f}s)")
            return None

        # ── Ratio-of-Inliers Disambiguation ──────────────────────────────
        if second_max_inliers > 0:
            ratio = max_inliers / second_max_inliers
            if ratio < DISAMBIGUATION_RATIO:
                print(f"Ambiguous match rejected. Ratio: {ratio:.2f} ({elapsed:.2f}s)")
                return None

        print(f"Best match: {best_match.get('title')} with {max_inliers} inliers "
              f"(second best: {second_max_inliers}) in {elapsed:.2f}s")
        return best_match


def identify_painting(captured_path, paintings_json_path):
    index = PaintingIndex(paintings_json_path)
    return index.identify(captured_path)