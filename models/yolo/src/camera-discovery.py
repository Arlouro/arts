import cv2

def list_cameras():
  index = 0
  arr = []
  while index < 10:
    cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
    if cap.read()[0]:
      name = cap.getBackendName()
      print(f"Index {index} is available (Backend: {name})")
      arr.append(index)
      cap.release()
    index += 1
  return arr

if __name__ == "__main__":
  list_cameras()