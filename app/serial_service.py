import threading
from collections import deque
from datetime import datetime
from typing import Any

import serial
import serial.tools.list_ports

from .models import SerialMessage


class SerialService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._serial: serial.Serial | None = None
        self._reader_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._messages: deque[SerialMessage] = deque(maxlen=5000)
        self._next_message_id = 1

    def list_ports(self) -> list[dict[str, str]]:
        ports = []
        for p in serial.tools.list_ports.comports():
            ports.append(
                {
                    "device": p.device,
                    "name": p.name or "",
                    "description": p.description or "",
                    "hwid": p.hwid or "",
                }
            )
        return ports

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "connected": self._serial is not None and self._serial.is_open,
                "port": self._serial.port if self._serial else None,
                "baudrate": self._serial.baudrate if self._serial else None,
            }

    def connect(
        self,
        port: str,
        baudrate: int,
        bytesize: int,
        parity: str,
        stopbits: float,
        timeout: float,
    ) -> None:
        connect_message = ""
        with self._lock:
            if self._serial and self._serial.is_open:
                raise RuntimeError("Serial port is already connected.")

            ser = serial.Serial(
                port=port,
                baudrate=baudrate,
                bytesize=bytesize,
                parity=parity,
                stopbits=stopbits,
                timeout=timeout,
            )
            self._serial = ser
            self._stop_event.clear()
            self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self._reader_thread.start()
            connect_message = f"Connected to {port} @ {baudrate}"
        self._append_message("sys", connect_message)

    def disconnect(self) -> None:
        should_log = False
        with self._lock:
            if not self._serial:
                return
            self._stop_event.set()
            try:
                if self._serial.is_open:
                    self._serial.close()
            finally:
                self._serial = None
                should_log = True
        if should_log:
            self._append_message("sys", "Disconnected.")

    def send(self, payload: bytes, display_text: str | None = None) -> int:
        with self._lock:
            if not self._serial or not self._serial.is_open:
                raise RuntimeError("Serial port is not connected.")
            written = self._serial.write(payload)
        # Use display_text if provided (user input format), otherwise show as hex
        message_content = display_text if display_text is not None else payload.hex(" ")
        self._append_message("tx", message_content)
        return written

    def get_messages(self, after_id: int = 0, limit: int = 200) -> list[SerialMessage]:
        if limit <= 0:
            return []
        with self._lock:
            filtered = [m for m in self._messages if m.id > after_id]
        return filtered[:limit]

    def _append_message(self, direction: str, content: str) -> None:
        with self._lock:
            msg = SerialMessage(
                id=self._next_message_id,
                ts=datetime.utcnow(),
                direction=direction,  # type: ignore[arg-type]
                content=content,
            )
            self._messages.append(msg)
            self._next_message_id += 1

    def _reader_loop(self) -> None:
        while not self._stop_event.is_set():
            ser = self._serial
            if not ser or not ser.is_open:
                break
            try:
                data = ser.read(256)
                if data:
                    text = data.decode(errors="replace")
                    self._append_message("rx", text)
            except Exception as exc:  # noqa: BLE001
                self._append_message("sys", f"Read error: {exc}")
                break
