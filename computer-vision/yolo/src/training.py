from ultralytics import YOLO

model = YOLO("yolo12n.pt") 
print("Weights downloaded successfully!")

results = model.train(data="datasets/painting_detection/data.yaml", epochs=100, imgsz=640)
print("Training completed successfully!")

results = model.val()
print("Validation completed successfully!")