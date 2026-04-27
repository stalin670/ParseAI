from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok():
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_cors_allows_configured_origin(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("CLERK_JWKS_URL", "x")
    monkeypatch.setenv("CLERK_ISSUER", "x")
    monkeypatch.setenv("PINECONE_API_KEY", "x")
    monkeypatch.setenv("PINECONE_INDEX", "x")
    monkeypatch.setenv("SUPABASE_DB_URL", "x")
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "x")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "x")
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import build_app

    client = TestClient(build_app())
    r = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
