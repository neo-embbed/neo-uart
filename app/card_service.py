import json
import re
from datetime import datetime
from pathlib import Path

from .models import CardCreateRequest, CardRuntimeStatus, CardUpdateRequest, MonitorCard, SerialMessage


class CardService:
    def __init__(self, data_file: Path) -> None:
        self._data_file = data_file
        self._data_file.parent.mkdir(parents=True, exist_ok=True)
        if not self._data_file.exists():
            self._data_file.write_text("[]", encoding="utf-8")

    def list_cards(self) -> list[MonitorCard]:
        payload = self._load_payload()
        return self._normalize_cards(payload["current"])

    def list_presets(self) -> list[dict]:
        payload = self._load_payload()
        presets = payload.get("presets", [])
        return [
            {
                "name": item.get("name", ""),
                "count": len(item.get("cards", [])),
                "saved_at": item.get("saved_at", ""),
            }
            for item in presets
        ]

    def save_preset(self, name: str) -> None:
        payload = self._load_payload()
        now = datetime.utcnow().isoformat()
        cards = [card.model_dump(mode="json") for card in self._normalize_cards(payload["current"])]
        presets = payload.get("presets", [])
        updated = False
        for preset in presets:
            if preset.get("name") == name:
                preset["cards"] = cards
                preset["saved_at"] = now
                updated = True
                break
        if not updated:
            presets.append({"name": name, "cards": cards, "saved_at": now})
        payload["presets"] = presets
        self._save_payload(payload)

    def load_preset(self, name: str) -> None:
        payload = self._load_payload()
        presets = payload.get("presets", [])
        for preset in presets:
            if preset.get("name") == name:
                payload["current"] = preset.get("cards", [])
                self._save_payload(payload)
                return
        raise KeyError(f"Preset {name} not found")

    def create_card(self, req: CardCreateRequest) -> MonitorCard:
        payload = self._load_payload()
        cards = self._normalize_cards(payload["current"])
        new_id = max((c.id for c in cards), default=0) + 1
        card = MonitorCard(
            id=new_id,
            name=req.name,
            pattern=req.pattern,
            enabled=req.enabled,
            unit=req.unit or "",
            color=req.color,
            created_at=datetime.utcnow(),
        )
        cards.append(card)
        payload["current"] = [c.model_dump(mode="json") for c in cards]
        self._save_payload(payload)
        return card

    def update_card(self, card_id: int, req: CardUpdateRequest) -> MonitorCard:
        payload = self._load_payload()
        cards = self._normalize_cards(payload["current"])
        for idx, card in enumerate(cards):
            if card.id == card_id:
                updated = card.model_copy(
                    update={
                        "name": req.name if req.name is not None else card.name,
                        "pattern": req.pattern if req.pattern is not None else card.pattern,
                        "enabled": req.enabled if req.enabled is not None else card.enabled,
                        "unit": req.unit if req.unit is not None else card.unit,
                        "color": req.color if req.color is not None else card.color,
                    }
                )
                cards[idx] = updated
                payload["current"] = [c.model_dump(mode="json") for c in cards]
                self._save_payload(payload)
                return updated
        raise KeyError(f"Card {card_id} not found")

    def delete_card(self, card_id: int) -> None:
        payload = self._load_payload()
        cards = self._normalize_cards(payload["current"])
        filtered = [c for c in cards if c.id != card_id]
        if len(filtered) == len(cards):
            raise KeyError(f"Card {card_id} not found")
        payload["current"] = [c.model_dump(mode="json") for c in filtered]
        self._save_payload(payload)

    def build_runtime_status(
        self, cards: list[MonitorCard], messages: list[SerialMessage]
    ) -> list[CardRuntimeStatus]:
        rx_messages = [m for m in messages if m.direction == "rx"]
        statuses: list[CardRuntimeStatus] = []

        for card in cards:
            status = CardRuntimeStatus(card_id=card.id, matched=False)
            if not card.enabled:
                statuses.append(status)
                continue

            try:
                pattern = re.compile(card.pattern)
                for message in reversed(rx_messages):
                    match = pattern.search(message.content)
                    if not match:
                        continue
                    value = self._extract_match_value(match)
                    statuses.append(
                        CardRuntimeStatus(
                            card_id=card.id,
                            matched=True,
                            latest_value=value,
                            matched_at=message.ts,
                            source_message_id=message.id,
                        )
                    )
                    break
                else:
                    statuses.append(status)
            except re.error as exc:
                # Fallback for plain keyword matching when pattern is not a valid regex.
                for message in reversed(rx_messages):
                    if card.pattern in message.content:
                        statuses.append(
                            CardRuntimeStatus(
                                card_id=card.id,
                                matched=True,
                                latest_value=message.content.strip() or card.pattern,
                                matched_at=message.ts,
                                source_message_id=message.id,
                                pattern_error=str(exc),
                            )
                        )
                        break
                else:
                    statuses.append(status.model_copy(update={"pattern_error": str(exc)}))

        return statuses

    def _load_payload(self) -> dict:
        raw = self._data_file.read_text(encoding="utf-8-sig")
        data = json.loads(raw)
        if isinstance(data, list):
            return {"current": data, "presets": []}
        if "current" not in data:
            data["current"] = []
        if "presets" not in data:
            data["presets"] = []
        return data

    def _save_payload(self, payload: dict) -> None:
        self._data_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def _normalize_cards(data: list[dict]) -> list[MonitorCard]:
        for item in data:
            if "unit" not in item:
                item["unit"] = item.get("description", "")
            if "color" not in item:
                item["color"] = "#0e7a68"
            item.pop("description", None)
        return [MonitorCard.model_validate(item) for item in data]

    @staticmethod
    def _extract_match_value(match: re.Match[str]) -> str:
        if match.lastindex:
            for index in range(1, match.lastindex + 1):
                group_value = match.group(index)
                if group_value is not None:
                    return group_value
        return match.group(0)
