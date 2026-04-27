"""Shared pytest fixtures.

Sets baseline env vars at session start so importing `app.main`
(which calls `build_app()` at module load) doesn't blow up on missing
required settings. Individual tests still monkeypatch specific values.
"""

import os

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
