from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class TranscriptStore:
    chunks: list[str] = field(default_factory=list)

    def add(self, chunk: str) -> None:
        if chunk.strip():
            self.chunks.append(chunk.strip())

    def full_text(self) -> str:
        return "\n".join(self.chunks)

    def clear(self) -> None:
        self.chunks.clear()
