import json
from datetime import datetime
from pathlib import Path

from .models import CardCreateRequest, CardUpdateRequest, MonitorCard


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
            description=req.description or "",
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
                        "description": req.description if req.description is not None else card.description,
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

    def _load(self) -> list[MonitorCard]:
        raw = self._data_file.read_text(encoding="utf-8")
        data = json.loads(raw)
        return [MonitorCard.model_validate(item) for item in data]

    def _save(self, cards: list[MonitorCard]) -> None:
        data = [card.model_dump(mode="json") for card in cards]
        self._data_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
