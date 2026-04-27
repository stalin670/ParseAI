from app.config import Settings, get_settings


def test_settings_loads_from_env(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "g")
    monkeypatch.setenv("CLERK_JWKS_URL", "https://j")
    monkeypatch.setenv("CLERK_ISSUER", "https://i")
    monkeypatch.setenv("PINECONE_API_KEY", "p")
    monkeypatch.setenv("PINECONE_INDEX", "idx")
    monkeypatch.setenv("PINECONE_CLOUD", "aws")
    monkeypatch.setenv("PINECONE_REGION", "us-east-1")
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql+asyncpg://u:p@h/db")
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://u")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "t")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000,https://x.vercel.app")
    get_settings.cache_clear()

    s = Settings()

    assert s.gemini_api_key == "g"
    assert s.clerk_jwks_url == "https://j"
    assert s.allowed_origins == ["http://localhost:3000", "https://x.vercel.app"]
    assert s.daily_upload_limit == 10
    assert s.daily_chat_limit == 50
