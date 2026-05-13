import cv2
import json
import os

def identify_painting(captured_path, paintings_json_path):

    if not os.path.exists(captured_path):
        print(f"Error: Captured image not found at {captured_path}")
        return None
    
    # Load captured image
    img1 = cv2.imread(captured_path)
    if img1 is None:
        print("Error: Could not read captured image.")
        return None

    sift = cv2.SIFT_create()
    keypoints, descriptors = sift.detectAndCompute(img1, None)
    if descriptors is None:
        print("Error: No features detected in captured image.")
        return None
    
    FLANN_INDEX_KDTREE = 1
    index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
    search_params = dict(checks=50)
    flann = cv2.FlannBasedMatcher(index_params, search_params)
    
    # Load JSON data
    try:
        with open(paintings_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            paintings = data.get("paintings", [])
    except Exception as e:
        print(f"Error loading JSON: {e}")
        return None
    
    best_match = None
    max_matches = 0
    second_max_matches = 0

    json_dir = os.path.dirname(paintings_json_path)
    yolo_root = os.path.abspath(os.path.join(json_dir, "..", ".."))

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

        matches = flann.knnMatch(descriptors, descriptors2, k=2)
        
        good_matches = []
        for m, n in matches:
            if m.distance < 0.75 * n.distance:
                good_matches.append(m)                

        
        num_matches = len(good_matches)
        
        if num_matches > max_matches:
            second_max_matches = max_matches
            max_matches = num_matches
            best_match = painting

    MIN_MATCHES = 5
    if max_matches < MIN_MATCHES:
        print(f"No good match found. Max matches: {max_matches}")
        return None
    
    print(f"Best match: {best_match.get('title')} with {max_matches} matches (second best: {second_max_matches})")
    return best_match