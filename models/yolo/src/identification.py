import cv2
import json
import os
import numpy as np

MIN_MATCH_COUNT = 15
MIN_INLIERS = 15
DISAMBIGUATION_RATIO = 1.3

def identify_painting(captured_path, paintings_json_path):

    if not os.path.exists(captured_path):
        print(f"Error: Captured image not found at {captured_path}")
        return None

    img1 = cv2.imread(captured_path)
    if img1 is None:
        print("Error: Could not read captured image.")
        return None

    sift = cv2.SIFT_create()
    keypoints, descriptors = sift.detectAndCompute(img1, None)
    if descriptors is None:
        print("Error: No features detected in captured image.")
        return None

    # ── FLANN matcher setup ───────────────────────────────────────────────────
    FLANN_INDEX_KDTREE = 1
    index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)

    # ── Database loading ──────────────────────────────────────────────────────
    try:
        with open(paintings_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            paintings = data.get("paintings", [])
    except Exception as e:
        print(f"Error loading JSON: {e}")
        return None

    # ── Candidate tracking ────────────────────────────────────────────────────
    best_match         = None
    max_inliers        = 0
    second_max_inliers = 0

    json_dir = os.path.dirname(paintings_json_path)
    yolo_root = os.path.abspath(os.path.join(json_dir, "..", ".."))

    # ── Reference image loop ──────────────────────────────────────────────────
    for painting in paintings:
        image_rel_path = painting.get("imagePath")
        if not image_rel_path:
            continue
            
        ref_path = os.path.join(yolo_root, image_rel_path)
        
        if not os.path.exists(ref_path):
            print(f"Warning: Reference image not found at {ref_path}")
            continue

        img2 = cv2.imread(ref_path)
        if img2 is None:
            continue

        keypoints2, descriptors2 = sift.detectAndCompute(img2, None)
        if descriptors2 is None:
            continue

        try:
            matches = flann.knnMatch(descriptors, descriptors2, k=2)
        except Exception as e:
            continue

        # ── Lowe's ratio test ─────────────────────────────────────────────────
        good_matches = []
        for m_info in matches:
            if len(m_info) == 2:
                m, n = m_info
                if m.distance < 0.7 * n.distance:
                    good_matches.append(m)

        inliers = 0

        # ── Geometric verification RANSAC homography ────────────────────────
        if len(good_matches) >= MIN_MATCH_COUNT:
            src_pts = np.float32([ keypoints[m.queryIdx].pt  for m in good_matches ]).reshape(-1, 1, 2)
            dst_pts = np.float32([ keypoints2[m.trainIdx].pt for m in good_matches ]).reshape(-1, 1, 2)

            M, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

            if mask is not None:
                inliers = np.sum(mask)
        
        if inliers > max_inliers:
            second_max_inliers = max_inliers
            max_inliers = inliers
            best_match = painting
        elif inliers > second_max_inliers:
            second_max_inliers = inliers

    # ── Minimum inlier threshold ──────────────────────────────────────────────
    if max_inliers < MIN_INLIERS:
        print(f"No good geometric match found. Max inliers: {max_inliers}")
        return None

    # ── Ratio-of-Inliers Disambiguation ──────────────────────────────────────
    if second_max_inliers > 0:
        ratio = max_inliers / second_max_inliers
        if ratio < DISAMBIGUATION_RATIO:
            print(f"Ambiguous match rejected. Ratio: {ratio:.2f} (needs to be >= {DISAMBIGUATION_RATIO})")
            return None
    
    print(f"Best match: {best_match.get('title')} with {max_inliers} inliers (second best: {second_max_inliers})")
    return best_match