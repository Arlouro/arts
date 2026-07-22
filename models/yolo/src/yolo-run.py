from ultralytics import YOLO
import os
import time
from identification import PaintingIndex
import socketio
import shutil
import base64
import cv2
import numpy as np

sio = socketio.Client()
RELAY_URL = os.environ.get('RELAY_SERVER_URL', 'http://localhost:8000')

latest_frame = None

EMA_ALPHA     = 0.4
DWELL_SECONDS = 0.7
CENTER_ZONE   = 0.08
BORDER_MARGIN = 0.06
START_DELAY   = 0.5
MIN_SIZE_FRACTION = 0.25

ema_positions      = {}  
dwell_start_times  = {}

@sio.on('process_frame')
def on_process_frame(data):
    global latest_frame
    try:
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

saved_ids          = set()
save_path          = 'captured_paintings'
paintings_json     = 'assets/json/paintings.json'
detection_start_times = {}

if not os.path.exists(save_path):
    os.makedirs(save_path)

# Build the SIFT feature index once at startup (not per-capture).
painting_index = PaintingIndex(paintings_json)
print("Painting identification index ready.")

while True:
    if latest_frame is None:
        time.sleep(0.01)
        continue

    frame = latest_frame.copy()

    if is_paused:
        cv2.putText(frame, "DETECTION PAUSED (AUDIO PLAYING)", (50, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.imshow("ARTS - YOLO Tracking", frame)
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
    cv2.imshow("ARTS - YOLO Tracking", annotated_frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

    if r.boxes.id is None:
        continue

    ids          = r.boxes.id.int().cpu().tolist()
    current_time = time.time()

    # ── EVALUATION ───────────────────────────────────────────────────
    candidates = []

    for i, obj_id in enumerate(ids):

        if obj_id not in saved_ids and obj_id not in detection_start_times:
            detection_start_times[obj_id] = current_time
            print(f"ID {obj_id} detected. Waiting {START_DELAY}s for focus...")
            sio.emit('status_update', {'status': 'focusing'})

        if obj_id in saved_ids:
            continue
        if obj_id not in detection_start_times:
            continue
        if current_time - detection_start_times[obj_id] < START_DELAY:
            continue

        coords_norm = r.boxes.xywhn[i]
        cx   = coords_norm[0].item()
        cy   = coords_norm[1].item()
        w    = coords_norm[2].item()
        h    = coords_norm[3].item()
        conf = r.boxes.conf[i].item()

        if obj_id not in ema_positions:
            ema_positions[obj_id] = (cx, cy)
        else:
            prev_x, prev_y = ema_positions[obj_id]
            ema_positions[obj_id] = (
                EMA_ALPHA * cx + (1 - EMA_ALPHA) * prev_x,
                EMA_ALPHA * cy + (1 - EMA_ALPHA) * prev_y,
            )

        ema_x, ema_y = ema_positions[obj_id]

        # ── Border proximity check ────────────────────────────────────────
        left_edge   = cx - w / 2
        right_edge  = cx + w / 2
        top_edge    = cy - h / 2
        bottom_edge = cy + h / 2

        is_fully_in_frame = (
            left_edge   >= BORDER_MARGIN         and
            right_edge  <= 1.0 - BORDER_MARGIN   and
            top_edge    >= BORDER_MARGIN          and
            bottom_edge <= 1.0 - BORDER_MARGIN
        )

        dist_from_center = ((ema_x - 0.5) ** 2 + (ema_y - 0.5) ** 2) ** 0.5

        size_ok = w >= MIN_SIZE_FRACTION and h >= MIN_SIZE_FRACTION

        candidates.append({
            'obj_id':           obj_id,
            'index':            i,
            'ema_x':            ema_x,
            'ema_y':            ema_y,
            'conf':             conf,
            'in_frame':         is_fully_in_frame,
            'size_ok':          size_ok,
            'dist_from_center': dist_from_center,
            'left_edge':        left_edge,
            'right_edge':       right_edge,
            'top_edge':         top_edge,
            'bottom_edge':      bottom_edge,
        })

    if not candidates:
        continue

    # ── CANDIDATE SELECTION ──────────────────────────────────────────
    # Composite score: prefer centred paintings, with a confidence bonus.
    def ranking_score(c):
        return c['dist_from_center'] - 0.3 * c['conf']

    fully_in_frame = [c for c in candidates if c['in_frame']]

    if fully_in_frame:
        active      = min(fully_in_frame, key=ranking_score)
        can_capture = True
    else:
        active      = min(candidates, key=ranking_score)
        can_capture = False

    # ── PROCESSING ───────────────────────────────────────────────────
    obj_id = active['obj_id']
    i      = active['index']
    ema_x  = active['ema_x']
    ema_y  = active['ema_y']
    conf   = active['conf']

    # ── Continuous framing feedback ──
    beacon_centered = (
        can_capture
        and active['size_ok']
        and abs(ema_x - 0.5) < CENTER_ZONE
        and abs(ema_y - 0.5) < CENTER_ZONE
        and conf > 0.85
    )
    sio.emit('tracking_update', {
        'dx': round(ema_x - 0.5, 3),
        'dy': round(ema_y - 0.5, 3),
        'inFrame': bool(can_capture),
        'centered': bool(beacon_centered),
    })

    if not can_capture:
        violations = {
            'left':   BORDER_MARGIN - active['left_edge'],
            'right':  active['right_edge'] - (1.0 - BORDER_MARGIN),
            'top':    BORDER_MARGIN - active['top_edge'],
            'bottom': active['bottom_edge'] - (1.0 - BORDER_MARGIN),
        }
        active_violations = {k: v for k, v in violations.items() if v > 0}

        if active_violations:
            if len(active_violations) >= 3:
                print(f"ID {obj_id} cut on multiple edges {list(active_violations)}. Asking to move back.")
                sio.emit('status_update', {'status': 'out_of_frame_multiple'})
            else:
                worst_edge = max(active_violations, key=active_violations.get)
                print(f"ID {obj_id} not fully in frame. Most violated edge: {worst_edge}")
                sio.emit('status_update', {'status': f'out_of_frame_{worst_edge}'})

        continue

    if not active['size_ok']:
        print(f"ID {obj_id} framed but too small. Asking user to move closer.")
        sio.emit('status_update', {'status': 'too_small'})
        continue

    # ── In-frame dwell logic ─────
    if obj_id not in dwell_start_times:
        dwell_start_times[obj_id] = current_time
        sio.emit('status_update', {'status': 'centered'})

    dwell_elapsed = current_time - dwell_start_times[obj_id]

    if dwell_elapsed >= DWELL_SECONDS:
        print(f"ID {obj_id} stable for {dwell_elapsed:.1f}s. Committing capture.")

        id_save_path = os.path.join(save_path, str(obj_id))
        if os.path.exists(id_save_path):
            shutil.rmtree(id_save_path, ignore_errors=True)

        os.makedirs(os.path.join(id_save_path, 'painting'), exist_ok=True)
        captured_image_path = os.path.join(id_save_path, 'painting', 'im.jpg')

        r[i].save_crop(save_dir=id_save_path)

        if os.path.exists(captured_image_path):
            painting_info = painting_index.identify(captured_image_path)

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
        detection_start_times.pop(obj_id, None)
        dwell_start_times.pop(obj_id, None)

    # ── Clean up dwell timers for paintings that left the frame ───────
    active_in_frame_ids = {c['obj_id'] for c in candidates if c['in_frame']}
    for tracked_id in list(dwell_start_times.keys()):
        if tracked_id not in active_in_frame_ids:
            dwell_start_times.pop(tracked_id, None)

    if len(saved_ids) >= 50:
        saved_ids.clear()
        print("Saved IDs cleared.")

cv2.destroyAllWindows()