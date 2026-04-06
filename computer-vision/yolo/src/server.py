import asyncio
import threading
from fastapi import FastAPI, WebSocket
import uvicorn
import json

app = FastAPI()

connected_clients = set()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        connected_clients.remove(websocket)

# # NOTE: For testing purposes detection will be sent to every connected client
async def broadcast_detection(painting_info):
    message = json.dumps(painting_info)
    for client in connected_clients:
        await client.send_text(message)

def communicate_yolo():
    asyncio.run(broadcast_detection())

if __name__ == "__main__":
    threading.Thread(target=communicate_yolo, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)
    

