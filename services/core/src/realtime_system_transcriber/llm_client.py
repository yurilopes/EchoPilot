from __future__ import annotations

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
        endpoint = base_url.rstrip("/") + "/v1/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": transcript},
            ],
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(endpoint, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        return data["choices"][0]["message"]["content"]
