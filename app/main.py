from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .card_service import CardService
from .models import CardCreateRequest, CardUpdateRequest, ConnectRequest, SendRequest
from .serial_service import SerialService

BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "static"
DATA_FILE = BASE_DIR / "data" / "monitor_cards.json"

app = FastAPI(title="Neo UART Assistant API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

serial_service = SerialService()
card_service = CardService(DATA_FILE)

app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/styles.css")
def styles() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "styles.css")


@app.get("/app.js")
def app_js() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "app.js")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/serial/ports")
def list_ports() -> dict[str, list[dict[str, str]]]:
    return {"items": serial_service.list_ports()}


@app.get("/api/serial/status")
def serial_status() -> dict:
    return serial_service.status()


@app.post("/api/serial/connect")
def connect_serial(req: ConnectRequest) -> dict[str, str]:
    try:
        serial_service.connect(
            port=req.port,
            baudrate=req.baudrate,
            bytesize=req.bytesize,
            parity=req.parity,
            stopbits=req.stopbits,
            timeout=req.timeout,
        )
        return {"message": "connected"}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/serial/disconnect")
def disconnect_serial() -> dict[str, str]:
    serial_service.disconnect()
    return {"message": "disconnected"}


@app.post("/api/serial/send")
def send_serial(req: SendRequest) -> dict[str, int]:
    try:
        if req.mode == "hex":
            payload = bytes.fromhex(req.payload.strip())
        else:
            text = req.payload + ("\n" if req.append_newline else "")
            payload = text.encode("utf-8")
        count = serial_service.send(payload)
        return {"written": count}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/serial/messages")
def list_messages(after_id: int = 0, limit: int = 200) -> dict:
    items = serial_service.get_messages(after_id=after_id, limit=limit)
    return {"items": [m.model_dump(mode="json") for m in items]}


@app.get("/api/cards")
def list_cards() -> dict:
    items = card_service.list_cards()
    return {"items": [c.model_dump(mode="json") for c in items]}


@app.post("/api/cards")
def create_card(req: CardCreateRequest) -> dict:
    card = card_service.create_card(req)
    return card.model_dump(mode="json")


@app.put("/api/cards/{card_id}")
def update_card(card_id: int, req: CardUpdateRequest) -> dict:
    try:
        card = card_service.update_card(card_id, req)
        return card.model_dump(mode="json")
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/cards/{card_id}")
def delete_card(card_id: int) -> dict[str, str]:
    try:
        card_service.delete_card(card_id)
        return {"message": "deleted"}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
