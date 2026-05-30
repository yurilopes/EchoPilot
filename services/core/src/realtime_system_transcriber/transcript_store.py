from __future__ import annotations

import re
from dataclasses import dataclass, field

LINEBREAK_PATTERN = r"[\r\n\u000B\u000C\u0085\u2028\u2029]+"
CONTROL_PATTERN = r"[\u0000-\u0009\u000E-\u001F\u007F]+"


@dataclass(slots=True)
class TranscriptStore:
    chunks: list[str] = field(default_factory=list)

    @staticmethod
    def normalize(chunk: str) -> str:
        # Join artificial line wraps and remove newline-driven hyphen splits.
        text = re.sub(rf"-\s*{LINEBREAK_PATTERN}\s*", "", chunk)
        # Also normalize literal escaped linebreak tokens that may come from serialized payloads.
        text = text.replace("\\r\\n", " ").replace("\\n", " ").replace("\\r", " ")
        text = re.sub(LINEBREAK_PATTERN, " ", text)
        text = re.sub(CONTROL_PATTERN, " ", text)
        text = re.sub(r"\s{2,}", " ", text)
        return text.strip()

    def add(self, chunk: str) -> str | None:
        normalized = self.normalize(chunk)
        if normalized:
            # Heal cross-chunk wrap artifacts like "I-" + "idea".
            if self.chunks and self.chunks[-1].endswith("-"):
                merged = f"{self.chunks[-1][:-1]}{normalized.lstrip()}"
                self.chunks[-1] = self.normalize(merged)
                return self.chunks[-1]
            self.chunks.append(normalized)
            return normalized
        return None

    def full_text(self) -> str:
        # Re-normalize existing chunks to heal legacy entries created before normalization rules.
        return self.normalize(" ".join(self.chunks))

    def clear(self) -> None:
        self.chunks.clear()
