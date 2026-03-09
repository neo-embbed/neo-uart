from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ConnectRequest(BaseModel):
    port: str
    baudrate: int = 115200
    bytesize: int = 8
    parity: Literal["N", "E", "O", "M", "S"] = "N"
    stopbits: float = 1
    timeout: float = 0.1


class SendRequest(BaseModel):
    payload: str = Field(min_length=1)
    mode: Literal["text", "hex"] = "text"
    append_newline: bool = False


class SerialMessage(BaseModel):
    id: int
    ts: datetime
    direction: Literal["rx", "tx", "sys"]
    content: str


class CardCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    pattern: str = Field(min_length=1, max_length=256)
    enabled: bool = True
    unit: Optional[str] = Field(default="", max_length=32)
    color: str = Field(default="#0e7a68", pattern=r"^#[0-9a-fA-F]{6}$")


class CardUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    pattern: Optional[str] = Field(default=None, min_length=1, max_length=256)
    enabled: Optional[bool] = None
    unit: Optional[str] = Field(default=None, max_length=32)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class MonitorCard(BaseModel):
    id: int
    name: str
    pattern: str
    enabled: bool
    unit: str = ""
    color: str = "#0e7a68"
    created_at: datetime


class CardRuntimeStatus(BaseModel):
    card_id: int
    matched: bool
    latest_value: str = ""
    matched_at: Optional[datetime] = None
    source_message_id: Optional[int] = None
    pattern_error: str = ""
