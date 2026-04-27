import datetime

import httpx

from app.config import get_settings


class GeminiQuotaGuard:
    def __init__(self) -> None:
        s = get_settings()
        self._url = s.upstash_redis_rest_url.rstrip("/")
        self._token = s.upstash_redis_rest_token
        self._limit = s.gemini_daily_global_limit

    def _key(self) -> str:
        today = datetime.date.today().isoformat()
        return f"gemini-global:{today}"

    async def check_and_increment(self) -> bool:
        soft_cap = int(self._limit * 0.9)
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(
                f"{self._url}/pipeline",
                headers={"Authorization": f"Bearer {self._token}"},
                json=[["INCR", self._key()], ["EXPIRE", self._key(), 86400]],
            )
        r.raise_for_status()
        count = int(r.json()[0]["result"])
        return count <= soft_cap
