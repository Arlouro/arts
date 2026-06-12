from ultralytics import YOLO
import os
import time
from identification import identify_painting
import socketio
import shutil
import base64
import cv2
import numpy as np

sio = socketio.Client()
RELAY_URL = os.environ.get('RELAY_SERVER_URL', 'http://localhost:8000')

latest_frame = None

@sio.on('process_frame')
def on_process_frame(data):
    global latest_frame
    try:
        # data['image'] is a data URL: "data:image/jpeg;base64,..."
        encoded_data = data['image'].split(',')[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is not None:
            latest_frame = frame
    except Exception as e:
        print(f"Error decoding frame: {e}")

try:
    sio.connect(RELAY_URL, transports=['websocket'])
except:
    sio.connect(RELAY_URL)

is_paused = False

@sio.on('pause_detection')
def on_pause():
    global is_paused
    is_paused = True
    print("YOLO processing paused by frontend to save performance.")

@sio.on('resume_detection')
def on_resume():
    global is_paused
    is_paused = False
    print("YOLO processing resumed.")

model = YOLO("./weights/best.pt")
print("YOLO12 Painting Detection model loaded successfully!")

saved_ids = set()
START_DELAY = 1
save_path = 'captured_paintings'
paintings_json = 'assets/json/paintings.json'
detection_start_times = {}

if not os.path.exists(save_path):
    os.makedirs(save_path)

print("Waiting for frames from frontend...")

while True:
    if latest_frame is None:
        time.sleep(0.01)
        continue

    frame = latest_frame.copy()

    if is_paused:
        cv2.putText(frame, "DETECTION PAUSED (AUDIO PLAYING)", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.imshow("Sonic Canvas - YOLO Tracking", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
        continue

    results = model.track(
        source=frame, 
        conf=0.70, 
        persist=True, 
        device="cpu",
        verbose=False
    )
    
    r = results[0]

    annotated_frame = r.plot()
    cv2.imshow("Sonic Canvas - YOLO Tracking", annotated_frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

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
                    
                    #TODO: CHANGE THE WAY THE CENTERED CHECK IS DONE USING A ROLLING EMA
                    # Check if the detected object is approximately centered (10% margin) in the frame
                    if coords_norm[0] > 0.45 and coords_norm[0] < 0.55 and coords_norm[1] > 0.45 and coords_norm[1] < 0.55 and r.boxes.conf[i] > 0.85:
                        print(f"ID {obj_id} is centered in frame. Saving capture.")
                        sio.emit('status_update', {'status': 'centered'})
                    else:
                        print(f"ID {obj_id} is not centered in frame. Skipping capture.")
                        x_offset = coords_norm[0].item() - 0.5
                        y_offset = coords_norm[1].item() - 0.5
                        
                        if abs(x_offset) > abs(y_offset):
                            if x_offset < -0.05:
                                sio.emit('status_update', {'status': 'need_center_left'})
                            else:
                                sio.emit('status_update', {'status': 'need_center_right'})
                        else:
                            if y_offset < -0.05:
                                sio.emit('status_update', {'status': 'need_center_up'})
                            else:
                                sio.emit('status_update', {'status': 'need_center_down'})
                        continue

                    os.makedirs(os.path.join(id_save_path, 'painting'), exist_ok=True)
                    captured_image_path = os.path.join(id_save_path, 'painting', 'im.jpg')
                    
                    r[i].save_crop(save_dir=id_save_path)
            
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

cv2.destroyAllWindows()