import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Tuple

from .models import CardCreateRequest, CardRuntimeStatus, CardUpdateRequest, MonitorCard, SerialMessage


class CardService:
    def __init__(self, data_file: Path) -> None:
        self._data_file = data_file
        self._data_file.parent.mkdir(parents=True, exist_ok=True)
        # Cache compiled regex patterns with their associated tokens to avoid recompiling on every call
        # Format: pattern -> (compiled_regex, truthy_tokens, falsy_tokens)
        self._pattern_cache: Dict[str, Tuple[re.Pattern[str], set[str], set[str]]] = {}
        # Cache the parsed JSON payload to avoid frequent file I/O
        self._payload_cache: dict | None = None
        self._cache_timestamp: float = 0
        self._cache_ttl: float = 1.0  # Cache for 1 second
        if not self._data_file.exists():
            template = self._data_file.parent / "monitor_cards_template.json"
            if template.exists():
                self._data_file.write_text(template.read_text(encoding="utf-8"), encoding="utf-8")
            else:
                self._data_file.write_text("[]", encoding="utf-8")

    def clear_pattern_cache(self) -> None:
        """Clear all compiled pattern cache. Useful for memory management."""
        self._pattern_cache.clear()

    def list_cards(self) -> list[MonitorCard]:
        payload = self._load_payload()
        return self._normalize_cards(payload["current"]["cards"])

    def current_name(self) -> str:
        payload = self._load_payload()
        return str(payload["current"].get("name") or "")

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
        now = datetime.now(timezone.utc).isoformat()
        cards = [card.model_dump(mode="json") for card in self._normalize_cards(payload["current"]["cards"])]
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
        payload["current"]["name"] = name
        self._save_payload(payload)

    def load_preset(self, name: str) -> None:
        payload = self._load_payload()
        presets = payload.get("presets", [])
        for preset in presets:
            if preset.get("name") == name:
                payload["current"]["cards"] = preset.get("cards", [])
                payload["current"]["name"] = name
                self._save_payload(payload)
                return
        raise KeyError(f"Preset {name} not found")

    def create_card(self, req: CardCreateRequest) -> MonitorCard:
        payload = self._load_payload()
        cards = self._normalize_cards(payload["current"]["cards"])
        new_id = max((c.id for c in cards), default=0) + 1
        card = MonitorCard(
            id=new_id,
            name=req.name,
            pattern=req.pattern,
            type=req.type,
            enabled=req.enabled,
            unit=req.unit or "",
            color=req.color,
            created_at=datetime.now(timezone.utc),
        )
        cards.append(card)
        payload["current"]["cards"] = [c.model_dump(mode="json") for c in cards]
        self._save_payload(payload)
        return card

    def update_card(self, card_id: int, req: CardUpdateRequest) -> MonitorCard:
        payload = self._load_payload()
        cards = self._normalize_cards(payload["current"]["cards"])
        for idx, card in enumerate(cards):
            if card.id == card_id:
                # Clear pattern cache if pattern is being updated
                if req.pattern is not None and req.pattern != card.pattern:
                    self._pattern_cache.pop(card.pattern, None)
                updated = card.model_copy(
                    update={
                        "name": req.name if req.name is not None else card.name,
                        "pattern": req.pattern if req.pattern is not None else card.pattern,
                        "type": req.type if req.type is not None else card.type,
                        "enabled": req.enabled if req.enabled is not None else card.enabled,
                        "unit": req.unit if req.unit is not None else card.unit,
                        "color": req.color if req.color is not None else card.color,
                    }
                )
                cards[idx] = updated
                payload["current"]["cards"] = [c.model_dump(mode="json") for c in cards]
                self._save_payload(payload)
                return updated
        raise KeyError(f"Card {card_id} not found")

    def delete_card(self, card_id: int) -> None:
        payload = self._load_payload()
        cards = self._normalize_cards(payload["current"]["cards"])
        # Find the card to be deleted and clean up its pattern cache
        card_to_delete = None
        for card in cards:
            if card.id == card_id:
                card_to_delete = card
                break
        
        filtered = [c for c in cards if c.id != card_id]
        if len(filtered) == len(cards):
            raise KeyError(f"Card {card_id} not found")
        
        # Clean up pattern cache for the deleted card
        if card_to_delete:
            self._pattern_cache.pop(card_to_delete.pattern, None)
        
        payload["current"]["cards"] = [c.model_dump(mode="json") for c in filtered]
        self._save_payload(payload)

    def build_runtime_status(
        self, cards: list[MonitorCard], messages: list[SerialMessage]
    ) -> list[CardRuntimeStatus]:
        # Only process recent messages to avoid performance issues with large message buffers
        # Limit to last 250 RX messages for performance
        rx_messages = [m for m in messages[-250:] if m.direction == "rx"]
        statuses: list[CardRuntimeStatus] = []

        for card in cards:
            status = CardRuntimeStatus(card_id=card.id, matched=False)
            if not card.enabled:
                statuses.append(status)
                continue

            try:
                # Use cached pattern if available
                if card.pattern not in self._pattern_cache:
                    if card.type == "boolean":
                        pattern_text, truthy_tokens, falsy_tokens = self._parse_boolean_pattern(card.pattern)
                    else:
                        pattern_text, truthy_tokens, falsy_tokens = card.pattern, set(), set()
                    compiled_pattern = re.compile(pattern_text)
                    self._pattern_cache[card.pattern] = (compiled_pattern, truthy_tokens, falsy_tokens)
                
                pattern, truthy_tokens, falsy_tokens = self._pattern_cache[card.pattern]

                # Search from most recent messages backwards
                for message in reversed(rx_messages):
                    match = pattern.search(message.content)
                    if not match:
                        continue
                    value = (
                        self._extract_boolean_value(match, truthy_tokens, falsy_tokens)
                        if card.type == "boolean"
                        else self._extract_match_value(match)
                    )
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
                # Clear from cache to avoid repeated compilation attempts
                self._pattern_cache.pop(card.pattern, None)
                for message in reversed(rx_messages):
                    if card.pattern in message.content:
                        statuses.append(
                            CardRuntimeStatus(
                                card_id=card.id,
                                matched=True,
                                latest_value="true"
                                if card.type == "boolean"
                                else (message.content.strip() or card.pattern),
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
        import time
        current_time = time.time()
        
        # Use cached payload if it's still fresh
        if self._payload_cache is not None and (current_time - self._cache_timestamp) < self._cache_ttl:
            return self._payload_cache.copy()
        
        # Load from file
        raw = self._data_file.read_text(encoding="utf-8-sig")
        if not raw.strip():
            raw = self._restore_from_template()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            raw = self._restore_from_template()
            data = json.loads(raw)
        if isinstance(data, list):
            data = {"current": {"name": "", "cards": data}, "presets": []}
        if "current" not in data:
            data["current"] = {"name": "", "cards": []}
        elif isinstance(data["current"], list):
            data["current"] = {"name": "", "cards": data["current"]}
        else:
            data["current"].setdefault("name", "")
            data["current"].setdefault("cards", [])
        if "presets" not in data:
            data["presets"] = []
        
        # Cache the result
        self._payload_cache = data.copy()
        self._cache_timestamp = current_time
        return data

    def _restore_from_template(self) -> str:
        template = self._data_file.parent / "monitor_cards_template.json"
        if template.exists():
            content = template.read_text(encoding="utf-8")
        else:
            content = "[]"
        self._data_file.write_text(content, encoding="utf-8")
        return content

    def _save_payload(self, payload: dict) -> None:
        self._data_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        # Update cache
        self._payload_cache = payload.copy()
        import time
        self._cache_timestamp = time.time()

    @staticmethod
    def _normalize_cards(data: list[dict]) -> list[MonitorCard]:
        for item in data:
            if "unit" not in item:
                item["unit"] = item.get("description", "")
            if "color" not in item:
                item["color"] = "#0e7a68"
            if "type" not in item:
                item["type"] = "numeric"
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

    @staticmethod
    def _extract_boolean_value(
        match: re.Match[str], truthy_tokens: set[str], falsy_tokens: set[str]
    ) -> str:
        if match.lastindex:
            for index in range(1, match.lastindex + 1):
                group_value = match.group(index)
                if group_value is not None:
                    return CardService._token_to_bool(group_value, truthy_tokens, falsy_tokens)
        return CardService._token_to_bool(match.group(0), truthy_tokens, falsy_tokens)

    @staticmethod
    def _token_to_bool(
        token: str, truthy_tokens: set[str], falsy_tokens: set[str]
    ) -> str:
        normalized = str(token).strip().lower()
        if normalized in truthy_tokens:
            return "true"
        if normalized in falsy_tokens:
            return "false"
        return "unknown"

    @staticmethod
    def _parse_boolean_pattern(pattern: str) -> tuple[str, set[str], set[str]]:
        parts = [part.strip() for part in pattern.split(";") if part.strip()]
        regex_text = parts[0] if parts else pattern
        truthy_tokens: set[str] = set()
        falsy_tokens: set[str] = set()
        for part in parts[1:]:
            if "=" not in part:
                continue
            key, value = part.split("=", 1)
            key = key.strip().lower()
            if key in {"true", "truthy", "t"}:
                target = truthy_tokens
            elif key in {"false", "falsy", "f"}:
                target = falsy_tokens
            else:
                continue
            for token in re.split(r"[|,]", value):
                cleaned = token.strip().lower()
                if cleaned:
                    target.add(cleaned)

        if not truthy_tokens:
            truthy_tokens.update({"on", "true", "1", "yes", "y"})
        if not falsy_tokens:
            falsy_tokens.update({"off", "false", "0", "no", "n"})
        return regex_text, truthy_tokens, falsy_tokens
