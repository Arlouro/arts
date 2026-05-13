from ultralytics import YOLO
import os
import time
from identification import identify_painting
import socketio
import shutil
import base64

sio = socketio.Client()
try:
    sio.connect('http://localhost:8000', transports=['websocket'])
except:
    sio.connect('http://localhost:8000')

model = YOLO("../weights/best.pt")
print("YOLO12 Painting Detection model loaded successfully!")

saved_ids = set()
START_DELAY = 2
save_path = 'captured_paintings'
paintings_json = 'assets/json/paintings.json'
detection_start_times = {}

if not os.path.exists(save_path):
    os.makedirs(save_path)

results = model.track(
    source=0, 
    show=True, 
    stream=True, 
    conf=0.70, 
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
                sio.emit('status_update', {'status': 'focusing'})

            if obj_id in detection_start_times and obj_id not in saved_ids:
                elapsed = current_time - detection_start_times[obj_id]
                
                if elapsed >= START_DELAY:                    
                    id_save_path = os.path.join(save_path, str(obj_id))
                    if os.path.exists(id_save_path):
                        shutil.rmtree(id_save_path, ignore_errors=True)
                    
                    
                    coords_norm = r.boxes.xywhn[i]
                    print(f"Normalized bounding box for ID {obj_id}: {coords_norm}")

                    # Check if the detected object is approximately centered (10% margin) in the frame
                    if coords_norm[0] > 0.45 and coords_norm[0] < 0.55 and coords_norm[1] > 0.45 and coords_norm[1] < 0.55 and r.boxes.conf[i] > 0.85:
                        print(f"ID {obj_id} is centered in frame. Saving capture.")
                        sio.emit('status_update', {'status': 'centered'})
                    else:
                        print(f"ID {obj_id} is not centered in frame. Skipping capture.")
                        sio.emit('status_update', {'status': 'need_center'})
                        continue

                    r[i].save_crop(save_dir=id_save_path)
            
                    captured_image_path = os.path.join(id_save_path, 'painting', 'im.jpg')
                    
                    if os.path.exists(captured_image_path):
                        painting_info = identify_painting(captured_image_path, paintings_json)
                        
                        if painting_info:
                            sio.emit('painting_detected', {
                                'id': painting_info.get('$id')
                            })
                            print(f"Sent ID: {painting_info.get('$id')} ({painting_info.get('title')})")
                        else:
                            print(f"ID {obj_id} not matched in database. Sending image for analysis.")
                            with open(captured_image_path, "rb") as img_file:
                                b64_string = base64.b64encode(img_file.read()).decode('utf-8')
                                sio.emit('painting_detected', {
                                    'id': f'unknown_{obj_id}',
                                    'imageData': f"data:image/jpeg;base64,{b64_string}"
                                })
                    
                    saved_ids.add(obj_id)
                    if obj_id in detection_start_times:
                        del detection_start_times[obj_id] 

    if len(saved_ids) >= 50: 
        saved_ids.clear()
        print("Saved IDs cleared.")