import pytest
import respx
from httpx import Response

from app.services.ratelimit import RateLimiter


@pytest.mark.asyncio
async def test_allows_under_limit(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://r")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "t")
    from app.config import get_settings

    get_settings.cache_clear()
    rl = RateLimiter()
    with respx.mock(assert_all_called=False) as m:
        m.post("https://r/pipeline").mock(
            return_value=Response(200, json=[{"result": 1}, {"result": 1}])
        )
        ok = await rl.check_and_increment(
            key="user:upload", limit=10, window_seconds=86400
        )
    assert ok is True


@pytest.mark.asyncio
async def test_rejects_at_limit(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://r")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "t")
    from app.config import get_settings

    get_settings.cache_clear()
    rl = RateLimiter()
    with respx.mock(assert_all_called=False) as m:
        m.post("https://r/pipeline").mock(
            return_value=Response(200, json=[{"result": 11}, {"result": 1}])
        )
        ok = await rl.check_and_increment(
            key="user:upload", limit=10, window_seconds=86400
        )
    assert ok is False
