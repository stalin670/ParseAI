"""Shared pytest fixtures.

Sets baseline env vars at session start so importing `app.main`
(which calls `build_app()` at module load) doesn't blow up on missing
required settings. Individual tests still monkeypatch specific values.

Integration tests requiring a real Postgres are gated on the
`RUN_INTEGRATION=1` env var. Set `INTEGRATION_DB_URL` to the connection
string of a disposable Postgres (e.g., a Supabase free-tier dev project).
"""

import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio

_DEFAULTS = {
    "GEMINI_API_KEY": "test-gemini",
    "CLERK_JWKS_URL": "https://test.example/.well-known/jwks.json",
    "CLERK_ISSUER": "https://test.example",
    "PINECONE_API_KEY": "test-pinecone",
    "PINECONE_INDEX": "test-index",
    "PINECONE_CLOUD": "aws",
    "PINECONE_REGION": "us-east-1",
    "SUPABASE_DB_URL": "postgresql+asyncpg://u:p@localhost:5432/test",
    "UPSTASH_REDIS_REST_URL": "https://test.upstash.io",
    "UPSTASH_REDIS_REST_TOKEN": "test-token",
    "ALLOWED_ORIGINS": "http://localhost:3000",
}

for k, v in _DEFAULTS.items():
    os.environ.setdefault(k, v)


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


def _integration_enabled() -> bool:
    return os.environ.get("RUN_INTEGRATION") == "1"


@pytest.fixture(scope="session")
def integration_db_url() -> str:
    if not _integration_enabled():
        pytest.skip("integration tests disabled (set RUN_INTEGRATION=1)")
    url = os.environ.get("INTEGRATION_DB_URL")
    if not url:
        pytest.skip("INTEGRATION_DB_URL not set")

    sync_url = url.replace("postgresql+asyncpg://", "postgresql://")
    import psycopg

    with psycopg.connect(sync_url) as conn:
        for f in sorted(MIGRATIONS.glob("*.sql")):
            conn.execute(f.read_text())
        conn.commit()
    return url


@pytest_asyncio.fixture
async def db_pool(integration_db_url, monkeypatch) -> AsyncIterator:
    monkeypatch.setenv("SUPABASE_DB_URL", integration_db_url)
    from app.config import get_settings

    get_settings.cache_clear()
    from app.db import close_pool, create_pool

    pool = await create_pool()
    # clean slate per test
    async with pool.acquire() as conn:
        await conn.execute(
            "TRUNCATE chats, documents, users RESTART IDENTITY CASCADE"
        )
    yield pool
    await close_pool()
