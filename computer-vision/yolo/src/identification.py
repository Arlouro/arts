import cv2
import json
import os

def identify_painting(captured_path, paintings_json_path):
    if not os.path.exists(captured_path):
        print(f"Error: Captured image not found at {captured_path}")
        return None

    # Load captured image
    img1 = cv2.imread(captured_path, cv2.IMREAD_GRAYSCALE)
    if img1 is None:
        print("Error: Could not read captured image.")
        return None

    # Load JSON data
    try:
        with open(paintings_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            paintings = data.get("paintings", [])
    except Exception as e:
        print(f"Error loading JSON: {e}")
        return None

    orb = cv2.ORB_create(nfeatures=1000)
    kp1, des1 = orb.detectAndCompute(img1, None)
    
    if des1 is None:
        print("Error: No features detected in captured image.")
        return None

    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    
    best_match = None
    max_matches = 0

    json_dir = os.path.dirname(paintings_json_path)
    project_root = os.path.dirname(json_dir) 
    yolo_root = os.path.abspath(os.path.join(json_dir, "..", ".."))

    for painting in paintings:
        image_rel_path = painting.get("imagePath")
        if not image_rel_path:
            continue
            
        ref_path = os.path.join(yolo_root, image_rel_path)
        
        if not os.path.exists(ref_path):
            print(f"Warning: Reference image not found at {ref_path}")
            continue

        img2 = cv2.imread(ref_path, cv2.IMREAD_GRAYSCALE)
        if img2 is None:
            continue

        kp2, des2 = orb.detectAndCompute(img2, None)
        if des2 is None:
            continue

        matches = bf.match(des1, des2)
        
        matches = sorted(matches, key = lambda x:x.distance)
        
        num_matches = len(matches)
        
        if num_matches > max_matches:
            max_matches = num_matches
            best_match = painting

    if max_matches < 20:
        print(f"Low match count ({max_matches}). Identification uncertain.")
        return None

    print(f"Matched with: {best_match.get('title')} ({max_matches} matches)")
    return best_match