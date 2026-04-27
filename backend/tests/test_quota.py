import pytest
import respx
from httpx import Response

from app.services.quota import GeminiQuotaGuard


@pytest.mark.asyncio
async def test_within_quota_returns_true(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://r")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "t")
    monkeypatch.setenv("GEMINI_DAILY_GLOBAL_LIMIT", "100")
    from app.config import get_settings

    get_settings.cache_clear()
    g = GeminiQuotaGuard()
    with respx.mock(assert_all_called=False) as m:
        m.post("https://r/pipeline").mock(
            return_value=Response(200, json=[{"result": 50}, {"result": 1}])
        )
        ok = await g.check_and_increment()
    assert ok is True


@pytest.mark.asyncio
async def test_over_quota_returns_false(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://r")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "t")
    monkeypatch.setenv("GEMINI_DAILY_GLOBAL_LIMIT", "100")
    from app.config import get_settings

    get_settings.cache_clear()
    g = GeminiQuotaGuard()
    with respx.mock(assert_all_called=False) as m:
        m.post("https://r/pipeline").mock(
            return_value=Response(200, json=[{"result": 95}, {"result": 1}])
        )
        ok = await g.check_and_increment()
    # 90% of 100 = 90, so 95 is over the soft cap.
    assert ok is False
