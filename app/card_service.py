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
        return self._load()

    def create_card(self, req: CardCreateRequest) -> MonitorCard:
        cards = self._load()
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
        self._save(cards)
        return card

    def update_card(self, card_id: int, req: CardUpdateRequest) -> MonitorCard:
        cards = self._load()
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
                self._save(cards)
                return updated
        raise KeyError(f"Card {card_id} not found")

    def delete_card(self, card_id: int) -> None:
        cards = self._load()
        filtered = [c for c in cards if c.id != card_id]
        if len(filtered) == len(cards):
            raise KeyError(f"Card {card_id} not found")
        self._save(filtered)

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

    def _load(self) -> list[MonitorCard]:
        raw = self._data_file.read_text(encoding="utf-8")
        data = json.loads(raw)
        for item in data:
            if "unit" not in item:
                item["unit"] = item.get("description", "")
            if "color" not in item:
                item["color"] = "#0e7a68"
            item.pop("description", None)
        return [MonitorCard.model_validate(item) for item in data]

    def _save(self, cards: list[MonitorCard]) -> None:
        data = [card.model_dump(mode="json") for card in cards]
        self._data_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    @staticmethod
    def _extract_match_value(match: re.Match[str]) -> str:
        if match.lastindex:
            for index in range(1, match.lastindex + 1):
                group_value = match.group(index)
                if group_value is not None:
                    return group_value
        return match.group(0)
