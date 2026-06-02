from __future__ import annotations

import keyring


class SecretStore:
    def __init__(self, service_name: str, username: str) -> None:
        self.service_name = service_name
        self.username = username

    def get_api_key(self) -> str | None:
        return keyring.get_password(self.service_name, self.username)

    def get_api_key_hint(self) -> str | None:
        value = (self.get_api_key() or "").strip()
        if not value:
            return None
        if len(value) <= 5:
            return "***"
        prefix = value[:3]
        suffix = value[-2:]
        return f"{prefix}***{suffix}"

    def set_api_key(self, value: str) -> None:
        keyring.set_password(self.service_name, self.username, value)

    def clear_api_key(self) -> None:
        keyring.delete_password(self.service_name, self.username)
