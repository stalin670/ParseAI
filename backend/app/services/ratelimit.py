import httpx

from app.config import get_settings


class RateLimiter:
    def __init__(self) -> None:
        s = get_settings()
        self._url = s.upstash_redis_rest_url.rstrip("/")
        self._token = s.upstash_redis_rest_token

    async def check_and_increment(
        self, *, key: str, limit: int, window_seconds: int
    ) -> bool:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(
                f"{self._url}/pipeline",
                headers={"Authorization": f"Bearer {self._token}"},
                json=[["INCR", key], ["EXPIRE", key, window_seconds]],
            )
        r.raise_for_status()
        results = r.json()
        count = int(results[0]["result"])
        return count <= limit
