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
    description: Optional[str] = Field(default="", max_length=256)


class CardUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=64)
    pattern: Optional[str] = Field(default=None, min_length=1, max_length=256)
    enabled: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=256)


class MonitorCard(BaseModel):
    id: int
    name: str
    pattern: str
    enabled: bool
    description: str = ""
    created_at: datetime
