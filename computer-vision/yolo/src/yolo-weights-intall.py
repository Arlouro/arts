from ultralytics import YOLO

# This will automatically download 'yolov12n.pt' (Where n corresponds to the model size version) from the 2026 Ultralytics CDN
model = YOLO("yolo12n.pt") 

print("Weights downloaded successfully!")