import queue
import threading
import time
from collections import deque
from datetime import datetime
from typing import Any

import serial
import serial.tools.list_ports

from .models import SerialMessage


# Keep the message buffer bounded to avoid unbounded memory growth and ensure the UI
# can keep up when the device is sending very high frequency data.
_MAX_MESSAGES = 20_000
_TRIM_BATCH = 1_000
# A bounded write queue keeps write requests from blocking the API thread.
_WRITE_QUEUE_MAXSIZE = 1_000


class SerialService:
    def __init__(self) -> None:
        self._write_lock = threading.Lock()  # 保护串口写入和连接状态
        self._messages_lock = threading.Lock()  # 保护消息缓冲区
        self._serial: serial.Serial | None = None
        self._reader_thread: threading.Thread | None = None
        self._writer_thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._messages: deque[SerialMessage] = deque()
        self._write_queue: queue.Queue[bytes] = queue.Queue(maxsize=_WRITE_QUEUE_MAXSIZE)
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
        with self._write_lock:
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
        with self._write_lock:
            if self._serial and self._serial.is_open:
                raise RuntimeError("Serial port is already connected.")

            ser = serial.Serial(
                port=port,
                baudrate=baudrate,
                bytesize=bytesize,
                parity=parity,
                stopbits=stopbits,
                timeout=timeout,
                write_timeout=timeout,
            )
            self._serial = ser

            # Reset writer queue and start a dedicated writer thread to avoid
            # blocking the FastAPI request thread when the serial driver is busy.
            self._write_queue = queue.Queue(maxsize=_WRITE_QUEUE_MAXSIZE)
            self._writer_thread = threading.Thread(target=self._writer_loop, daemon=True)
            self._writer_thread.start()

            self._stop_event.clear()
            self._reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self._reader_thread.start()
            connect_message = f"Connected to {port} @ {baudrate}"
        self._append_message("sys", connect_message)

    def disconnect(self) -> None:
        should_log = False
        with self._write_lock:
            if not self._serial:
                return
            self._stop_event.set()

            # Wake up writer thread if it's waiting for work
            try:
                self._write_queue.put_nowait(None)
            except queue.Full:
                pass

            try:
                if self._serial.is_open:
                    self._serial.close()
            finally:
                self._serial = None
                should_log = True

        # Give writer thread a moment to exit cleanly
        if self._writer_thread:
            self._writer_thread.join(timeout=1)
            self._writer_thread = None

        if should_log:
            self._append_message("sys", "Disconnected.")

    def send(self, payload: bytes, display_text: str | None = None) -> int:
        with self._write_lock:
            if not self._serial or not self._serial.is_open:
                raise RuntimeError("Serial port is not connected.")
            try:
                self._write_queue.put(payload, timeout=0.1)
            except queue.Full:
                raise RuntimeError("Send queue is full (device may be busy).")

        # Use display_text if provided (user input format), otherwise show as hex
        message_content = display_text if display_text is not None else payload.hex(" ")
        self._append_message("tx", message_content)
        return len(payload)

    def get_messages(self, after_id: int = 0, limit: int = 200) -> list[SerialMessage]:
        if limit <= 0:
            return []
        with self._messages_lock:
            filtered = [m for m in self._messages if m.id > after_id]
        return filtered[:limit]

    def _append_message(self, direction: str, content: str) -> None:
        with self._messages_lock:
            msg = SerialMessage(
                id=self._next_message_id,
                ts=datetime.utcnow(),
                direction=direction,  # type: ignore[arg-type]
                content=content,
            )
            self._messages.append(msg)
            self._next_message_id += 1

            # Keep the buffer bounded to avoid unbounded memory growth when the device
            # is emitting data at a very high rate.
            if len(self._messages) > _MAX_MESSAGES:
                for _ in range(_TRIM_BATCH):
                    if len(self._messages) <= _MAX_MESSAGES:
                        break
                    self._messages.popleft()

    def _reader_loop(self) -> None:
        while not self._stop_event.is_set():
            with self._write_lock:
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

    def _writer_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                payload = self._write_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            # Sentinel value for clean shutdown
            if payload is None:
                break

            with self._write_lock:
                ser = self._serial
                if not ser or not ser.is_open:
                    continue
                try:
                    written = ser.write(payload)
                    if written != len(payload):
                        self._append_message(
                            "sys",
                            f"Write incomplete ({written}/{len(payload)} bytes).",
                        )
                except Exception as exc:  # noqa: BLE001
                    self._append_message("sys", f"Write error: {exc}")
