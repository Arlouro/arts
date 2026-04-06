from ultralytics import YOLO
import os
import time
from identification import identify_painting

model = YOLO("runs/detect/train2/weights/best.pt")
print("YOLO12 Painting Detection model loaded successfully!")

saved_ids = set()
START_DELAY = 1
save_path = 'captured_paintings'
paintings_json = 'assets/json/paintings.json'
detection_start_times = {}


if not os.path.exists(save_path):
    os.makedirs(save_path)

results = model.track(
    source=1, 
    show=True, 
    stream=True, 
    conf=0.80, 
    persist=True, 
    device="cpu",
    verbose=False
)

for r in results:
    if r.boxes.id is not None:
        ids = r.boxes.id.int().cpu().tolist()
        current_time = time.time()
        
        for i, obj_id in enumerate(ids):
            if obj_id not in saved_ids and obj_id not in detection_start_times:
                detection_start_times[obj_id] = current_time
                print(f"ID {obj_id} detected. Waiting {START_DELAY}s for focus...")

            if obj_id in detection_start_times and obj_id not in saved_ids:
                elapsed = current_time - detection_start_times[obj_id]
                
                if elapsed >= START_DELAY:
                    r[i].save_crop(save_dir=save_path)
                    
                    captured_image_path = os.path.join(save_path, 'painting', 'im.jpg')
                    
                    print(f"Focus achieved! Painting ID {obj_id} saved. Identifying...")
                    
                    painting_info = identify_painting(captured_image_path, paintings_json)
                    
                    if painting_info:
                        print(f"--- PAINTING IDENTIFIED ---")
                        print(f"Title: {painting_info.get('title')}")
                        print(f"Artist: {painting_info.get('artist')}")
                        print(f"Year: {painting_info.get('year')}")
                        print(f"Description: {painting_info.get('description')}")
                        print(f"----------------------------")
                    else:
                        print("Could not identify the painting from reference images.")
                    
                    saved_ids.add(obj_id)
                    del detection_start_times[obj_id] 
                    
    if len(saved_ids) >= 10: 
        saved_ids.clear()
        print("Saved IDs cleared to manage memory.")