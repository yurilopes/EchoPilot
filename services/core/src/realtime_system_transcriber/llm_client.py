from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx


class LlmClient:
    async def analyze(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str,
        prompt: str,
        transcript: str,
        timeout_seconds: int = 60,
    ) -> str:
        chunks: list[str] = []
        async for chunk in self.analyze_stream(
            base_url=base_url,
            model=model,
            api_key=api_key,
            prompt=prompt,
            transcript=transcript,
            timeout_seconds=timeout_seconds,
        ):
            chunks.append(chunk)
        return "".join(chunks)

    async def analyze_stream(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str,
        prompt: str,
        transcript: str,
        timeout_seconds: int = 60,
    ) -> AsyncIterator[str]:
        endpoint = base_url.rstrip("/") + "/v1/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": transcript},
            ],
            "temperature": 0.2,
            "stream": True,
        }
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            async with client.stream("POST", endpoint, json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    chunk = _parse_stream_line(line)
                    if chunk:
                        yield chunk


def _parse_stream_line(line: str) -> str:
    data = line.strip()
    if not data or not data.startswith("data:"):
        return ""
    data = data.removeprefix("data:").strip()
    if data == "[DONE]":
        return ""
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return ""
    choices = payload.get("choices") or []
    if not choices:
        return ""
    delta = choices[0].get("delta") or {}
    content = delta.get("content")
    return content if isinstance(content, str) else ""
