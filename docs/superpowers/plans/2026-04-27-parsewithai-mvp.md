# ParseWithAI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployable web RAG app where authenticated users upload PDFs and chat with them, with hard tenant isolation and per-user rate limits, all on free-tier services.

**Architecture:** Two-process split. Next.js frontend on Vercel handles UI and Clerk auth. FastAPI backend on Render runs the LangChain RAG pipeline, verifies Clerk JWTs, and talks to Pinecone (vectors), Supabase Postgres (metadata + chat history), Upstash Redis (rate-limit counters), and Gemini (embeddings + LLM).

**Tech Stack:** Next.js 14 (App Router, TS, Tailwind, shadcn/ui), FastAPI, LangChain, Gemini (`gemini-1.5-flash`, `text-embedding-004`), Pinecone Serverless, Supabase Postgres, Upstash Redis, Clerk, pytest, vitest, GitHub Actions, Render, Vercel.

**Spec:** `docs/superpowers/specs/2026-04-27-parsewithai-design.md`

---

## File map

### Backend (`backend/`)

| File | Responsibility |
|---|---|
| `pyproject.toml` | Deps + tool config (ruff, mypy, pytest) |
| `.python-version` | Pin Python 3.11 |
| `app/__init__.py` | Marker |
| `app/main.py` | FastAPI app, CORS, router include, health |
| `app/config.py` | Pydantic-settings env loader |
| `app/auth.py` | Clerk JWT verify dependency |
| `app/db.py` | asyncpg pool + Supabase client |
| `app/models.py` | Pydantic request/response schemas |
| `app/routes/__init__.py` | Marker |
| `app/routes/documents.py` | POST /docs, GET /docs, DELETE /docs/{id} |
| `app/routes/chat.py` | POST /chat/{docId} (SSE) |
| `app/services/__init__.py` | Marker |
| `app/services/vectorstore.py` | Pinecone wrapper (namespace per user) |
| `app/services/embeddings.py` | Gemini embeddings wrapper |
| `app/services/ingest.py` | PDF → chunks → embed → upsert |
| `app/services/retrieve.py` | Query embed → Pinecone search → chunks |
| `app/services/llm.py` | Prompt build + Gemini stream |
| `app/services/ratelimit.py` | Upstash Redis check/increment |
| `app/services/quota.py` | Global Gemini quota guard |
| `migrations/001_init.sql` | Postgres schema |
| `tests/conftest.py` | Shared fixtures (TestClient, Postgres container, mocks) |
| `tests/fixtures/sample.pdf` | 5-page test PDF |
| `tests/test_config.py` | Env loader |
| `tests/test_auth.py` | JWT verify (mocked Clerk JWKS) |
| `tests/test_db.py` | Pool + simple query |
| `tests/test_vectorstore.py` | Pinecone wrapper (mocked) |
| `tests/test_embeddings.py` | Embeddings wrapper (mocked) |
| `tests/test_ingest.py` | PDF parse, chunk, full ingest |
| `tests/test_retrieve.py` | Retrieval shape |
| `tests/test_llm.py` | Prompt + stream (mocked) |
| `tests/test_ratelimit.py` | Counter increment + reject |
| `tests/test_quota.py` | Global quota guard |
| `tests/test_routes_documents.py` | Upload, list, delete (integration) |
| `tests/test_routes_chat.py` | SSE chat (integration) |

### Frontend (`frontend/`)

| File | Responsibility |
|---|---|
| `package.json` | Deps |
| `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs` | Tooling |
| `middleware.ts` | Clerk route protection |
| `app/layout.tsx` | Root layout, ClerkProvider |
| `app/page.tsx` | Landing |
| `app/sign-in/[[...sign-in]]/page.tsx` | Clerk sign-in |
| `app/sign-up/[[...sign-up]]/page.tsx` | Clerk sign-up |
| `app/dashboard/page.tsx` | Document list + upload |
| `app/chat/[docId]/page.tsx` | Chat UI |
| `components/UploadDropzone.tsx` | File picker + dropzone |
| `components/DocList.tsx` | Document list |
| `components/ChatWindow.tsx` | Message stream + input |
| `components/MessageBubble.tsx` | Single message |
| `components/SourceCitation.tsx` | Page citations |
| `lib/api.ts` | Fetch helper, attaches Clerk JWT |
| `lib/types.ts` | Shared TS types |
| `__tests__/lib/api.test.ts` | API helper |
| `__tests__/components/DocList.test.tsx` | Render + click |
| `__tests__/components/UploadDropzone.test.tsx` | File select + reject |
| `__tests__/components/ChatWindow.test.tsx` | Send + stream render |

### Repo root

| File | Responsibility |
|---|---|
| `.gitignore` | (already present) |
| `.env.example` | Reference for required env vars |
| `README.md` | Setup, run, deploy |
| `.github/workflows/ci.yml` | Backend + frontend lint/test/build |

---

## Conventions

- **Python:** uv-managed venv, ruff lint, mypy strict (where practical), pytest with `pytest-asyncio`, `respx`/`pytest-httpx` for HTTP mocks, `testcontainers` for ephemeral Postgres.
- **TS:** Next.js App Router, server components by default; `"use client"` only for interactivity. TanStack Query for server data.
- **Commits:** conventional commits (`feat:`, `test:`, `fix:`, `chore:`, `docs:`). Commit after each task is green.
- **TDD where logic exists:** write the failing test, run it red, implement, run green, commit. Tooling/config tasks skip tests.

---

## Task 1: Repo tooling and env reference

**Files:**
- Create: `.env.example`
- Create: `README.md`

- [ ] **Step 1: Create `.env.example`**

```bash
# Backend
GEMINI_API_KEY=replace-me
CLERK_JWKS_URL=https://<your-clerk-frontend-api>/.well-known/jwks.json
CLERK_ISSUER=https://<your-clerk-frontend-api>
PINECONE_API_KEY=replace-me
PINECONE_INDEX=parsewithai
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
SUPABASE_DB_URL=postgresql+asyncpg://postgres:<pw>@<host>:5432/postgres
UPSTASH_REDIS_REST_URL=https://<id>.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-me
ALLOWED_ORIGINS=http://localhost:3000
DAILY_UPLOAD_LIMIT=10
DAILY_CHAT_LIMIT=50
GEMINI_DAILY_GLOBAL_LIMIT=1200

# Frontend
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=replace-me
CLERK_SECRET_KEY=replace-me
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

- [ ] **Step 2: Create `README.md`**

```markdown
# ParseWithAI

Chat with your PDFs. RAG app on free-tier services.

## Stack
Next.js + FastAPI + LangChain + Gemini + Pinecone + Supabase + Clerk + Upstash.

## Quickstart

### Prereqs
- Python 3.11
- Node 20
- Accounts on: Clerk, Pinecone, Supabase, Upstash, Google AI Studio (Gemini)

### Setup
1. Copy `.env.example` to `backend/.env` and `frontend/.env.local`. Fill values.
2. Run the migration in Supabase SQL editor: `backend/migrations/001_init.sql`.
3. Backend: `cd backend && uv sync && uv run uvicorn app.main:app --reload`
4. Frontend: `cd frontend && npm install && npm run dev`
5. Open `http://localhost:3000`.

See `docs/superpowers/specs/2026-04-27-parsewithai-design.md` for design.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "chore: add env reference and README"
```

---

## Task 2: Backend project scaffold (uv + FastAPI)

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.python-version`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

def test_health_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Create `backend/.python-version`**

```
3.11
```

- [ ] **Step 3: Create `backend/pyproject.toml`**

```toml
[project]
name = "parsewithai-backend"
version = "0.1.0"
requires-python = ">=3.11,<3.13"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.32",
  "pydantic>=2.9",
  "pydantic-settings>=2.6",
  "httpx>=0.27",
  "python-jose[cryptography]>=3.3",
  "asyncpg>=0.30",
  "sqlalchemy>=2.0",
  "langchain>=0.3",
  "langchain-google-genai>=2.0",
  "langchain-pinecone>=0.2",
  "langchain-community>=0.3",
  "pinecone>=5.0",
  "pypdf>=5.0",
  "python-multipart>=0.0.12",
  "python-magic-bin>=0.4.14; sys_platform == 'win32'",
  "python-magic>=0.4.27; sys_platform != 'win32'",
  "upstash-redis>=1.2",
  "tenacity>=9.0",
  "sse-starlette>=2.1",
]

[dependency-groups]
dev = [
  "pytest>=8.3",
  "pytest-asyncio>=0.24",
  "pytest-cov>=5.0",
  "respx>=0.21",
  "ruff>=0.7",
  "mypy>=1.13",
  "testcontainers[postgres]>=4.8",
]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E","F","I","B","UP","SIM"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = "-ra -q"

[tool.mypy]
python_version = "3.11"
strict = true
ignore_missing_imports = true
```

- [ ] **Step 4: Create `backend/app/__init__.py`** — empty file.

- [ ] **Step 5: Create `backend/app/main.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="ParseWithAI API")

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Create `backend/tests/__init__.py`** — empty file.

- [ ] **Step 7: Install and run**

```bash
cd backend
uv sync
uv run pytest tests/test_health.py -v
```

Expected: 1 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold FastAPI app with health check"
```

---

## Task 3: Config loader (pydantic-settings)

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_config.py`:

```python
import os
from app.config import Settings

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

    s = Settings()

    assert s.gemini_api_key == "g"
    assert s.clerk_jwks_url == "https://j"
    assert s.allowed_origins == ["http://localhost:3000", "https://x.vercel.app"]
    assert s.daily_upload_limit == 10
    assert s.daily_chat_limit == 50
```

- [ ] **Step 2: Run, expect fail**

```bash
uv run pytest tests/test_config.py -v
```

Expected: ImportError or failure.

- [ ] **Step 3: Implement `backend/app/config.py`**

```python
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str
    clerk_jwks_url: str
    clerk_issuer: str
    pinecone_api_key: str
    pinecone_index: str
    pinecone_cloud: str = "aws"
    pinecone_region: str = "us-east-1"
    supabase_db_url: str
    upstash_redis_rest_url: str
    upstash_redis_rest_token: str
    allowed_origins: list[str] = Field(default_factory=list)

    daily_upload_limit: int = 10
    daily_chat_limit: int = 50
    gemini_daily_global_limit: int = 1200
    max_pdf_mb: int = 10
    max_pdf_pages: int = 100
    chunk_size: int = 1000
    chunk_overlap: int = 200
    top_k: int = 4

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Run, expect pass**

```bash
uv run pytest tests/test_config.py -v
```

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_config.py
git commit -m "feat(backend): add pydantic-settings config loader"
```

---

## Task 4: Wire CORS + settings into main app

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_health.py`

- [ ] **Step 1: Update test to assert CORS header**

`backend/tests/test_health.py`:

```python
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
```

- [ ] **Step 2: Run, expect fail**

```bash
uv run pytest tests/test_health.py -v
```

- [ ] **Step 3: Update `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings


def build_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="ParseWithAI API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = build_app()
```

- [ ] **Step 4: Run tests, expect pass**

```bash
uv run pytest tests/ -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_health.py
git commit -m "feat(backend): wire CORS and settings into app factory"
```

---

## Task 5: Postgres schema + asyncpg pool

**Files:**
- Create: `backend/migrations/001_init.sql`
- Create: `backend/app/db.py`
- Create: `backend/tests/test_db.py`
- Modify: `backend/tests/conftest.py` (create)

- [ ] **Step 1: Create `backend/migrations/001_init.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  clerk_user_id   TEXT PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   TEXT NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  page_count      INT  NOT NULL,
  chunk_count     INT  NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_user_created
  ON documents (clerk_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chats_doc_created
  ON chats (document_id, created_at);
```

- [ ] **Step 2: Create shared fixtures `backend/tests/conftest.py`**

```python
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from testcontainers.postgres import PostgresContainer

from app.config import get_settings


MIGRATIONS = Path(__file__).resolve().parents[1] / "migrations"


@pytest.fixture(scope="session")
def postgres_url() -> str:
    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url().replace("psycopg2", "asyncpg")
        # apply migrations once with sync driver
        import psycopg
        sync_url = pg.get_connection_url().replace("+psycopg2", "")
        with psycopg.connect(sync_url) as conn:
            for f in sorted(MIGRATIONS.glob("*.sql")):
                conn.execute(f.read_text())
            conn.commit()
        yield url


@pytest_asyncio.fixture
async def db_pool(postgres_url, monkeypatch) -> AsyncIterator:
    monkeypatch.setenv("SUPABASE_DB_URL", postgres_url)
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("CLERK_JWKS_URL", "x")
    monkeypatch.setenv("CLERK_ISSUER", "x")
    monkeypatch.setenv("PINECONE_API_KEY", "x")
    monkeypatch.setenv("PINECONE_INDEX", "x")
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "x")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "x")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    get_settings.cache_clear()
    from app.db import create_pool, close_pool
    pool = await create_pool()
    yield pool
    await close_pool()
```

Note: also add `psycopg[binary]` to dev deps if not present.

- [ ] **Step 3: Add `psycopg[binary]` to dev group in `pyproject.toml`** — re-run `uv sync`.

- [ ] **Step 4: Write failing test `backend/tests/test_db.py`**

```python
import pytest

@pytest.mark.asyncio
async def test_pool_executes_simple_query(db_pool):
    async with db_pool.acquire() as conn:
        v = await conn.fetchval("SELECT 1")
    assert v == 1

@pytest.mark.asyncio
async def test_users_table_exists(db_pool):
    async with db_pool.acquire() as conn:
        v = await conn.fetchval(
            "SELECT to_regclass('public.users')"
        )
    assert v == "users"
```

- [ ] **Step 5: Implement `backend/app/db.py`**

```python
import asyncpg

from app.config import get_settings

_pool: asyncpg.Pool | None = None


async def create_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        url = get_settings().supabase_db_url.replace("postgresql+asyncpg://", "postgresql://")
        _pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=5)
    return _pool


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        return await create_pool()
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
```

- [ ] **Step 6: Run tests, expect pass**

```bash
uv run pytest tests/test_db.py -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/migrations backend/app/db.py backend/tests/conftest.py backend/tests/test_db.py backend/pyproject.toml
git commit -m "feat(backend): add Postgres schema and asyncpg pool"
```

---

## Task 6: Clerk JWT verify dependency

**Files:**
- Create: `backend/app/auth.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_auth.py`:

```python
from datetime import datetime, timedelta, timezone

import pytest
import respx
from httpx import Response
from jose import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.auth import current_user_id


def _make_keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_numbers = key.public_key().public_numbers()
    n = public_numbers.n.to_bytes((public_numbers.n.bit_length() + 7) // 8, "big")
    e = public_numbers.e.to_bytes((public_numbers.e.bit_length() + 7) // 8, "big")
    import base64
    jwk = {
        "kty": "RSA",
        "kid": "test-kid",
        "use": "sig",
        "alg": "RS256",
        "n": base64.urlsafe_b64encode(n).rstrip(b"=").decode(),
        "e": base64.urlsafe_b64encode(e).rstrip(b"=").decode(),
    }
    return private_pem, jwk


def _make_token(private_pem: str, kid: str, issuer: str, sub: str, exp_delta=60) -> str:
    return jwt.encode(
        {
            "sub": sub,
            "iss": issuer,
            "exp": datetime.now(timezone.utc) + timedelta(seconds=exp_delta),
        },
        private_pem,
        algorithm="RS256",
        headers={"kid": kid},
    )


@pytest.fixture
def app_with_protected_route(monkeypatch):
    private_pem, jwk = _make_keypair()
    issuer = "https://example.clerk.accounts.dev"
    jwks_url = f"{issuer}/.well-known/jwks.json"

    monkeypatch.setenv("CLERK_JWKS_URL", jwks_url)
    monkeypatch.setenv("CLERK_ISSUER", issuer)
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("PINECONE_API_KEY", "x")
    monkeypatch.setenv("PINECONE_INDEX", "x")
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql+asyncpg://u:p@h/db")
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "x")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "x")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    from app.config import get_settings
    get_settings.cache_clear()
    from app.auth import _jwks_cache
    _jwks_cache.clear()

    app = FastAPI()

    @app.get("/me")
    def me(uid: str = Depends(current_user_id)) -> dict[str, str]:
        return {"user_id": uid}

    return app, private_pem, jwk, issuer, jwks_url


def test_valid_token_returns_user_id(app_with_protected_route):
    app, private_pem, jwk, issuer, jwks_url = app_with_protected_route
    token = _make_token(private_pem, jwk["kid"], issuer, "user_abc")
    with respx.mock(assert_all_called=False) as m:
        m.get(jwks_url).mock(return_value=Response(200, json={"keys": [jwk]}))
        client = TestClient(app)
        r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {"user_id": "user_abc"}


def test_missing_token_returns_401(app_with_protected_route):
    app, *_ = app_with_protected_route
    client = TestClient(app)
    r = client.get("/me")
    assert r.status_code == 401


def test_expired_token_returns_401(app_with_protected_route):
    app, private_pem, jwk, issuer, jwks_url = app_with_protected_route
    token = _make_token(private_pem, jwk["kid"], issuer, "user_abc", exp_delta=-10)
    with respx.mock(assert_all_called=False) as m:
        m.get(jwks_url).mock(return_value=Response(200, json={"keys": [jwk]}))
        client = TestClient(app)
        r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
```

- [ ] **Step 2: Implement `backend/app/auth.py`**

```python
from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt

from app.config import get_settings

_jwks_cache: dict[str, Any] = {}


async def _fetch_jwks() -> dict[str, Any]:
    if "keys" in _jwks_cache:
        return _jwks_cache
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(settings.clerk_jwks_url)
    r.raise_for_status()
    _jwks_cache.update(r.json())
    return _jwks_cache


def _bearer_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return auth.removeprefix("Bearer ").strip()


async def current_user_id(request: Request) -> str:
    token = _bearer_token(request)
    settings = get_settings()
    jwks = await _fetch_jwks()
    try:
        unverified = jwt.get_unverified_header(token)
        kid = unverified.get("kid")
        key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if key is None:
            raise HTTPException(status_code=401, detail="Unknown signing key")
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"verify_aud": False},
        )
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub")
    return str(sub)
```

- [ ] **Step 3: Run, expect pass**

```bash
uv run pytest tests/test_auth.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/auth.py backend/tests/test_auth.py
git commit -m "feat(backend): add Clerk JWT verify dependency"
```

---

## Task 7: User upsert helper + lazy create on auth

**Files:**
- Modify: `backend/app/auth.py`
- Create: `backend/app/services/users.py`
- Create: `backend/tests/test_users.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_users.py`:

```python
import pytest
from app.services.users import ensure_user_exists


@pytest.mark.asyncio
async def test_ensure_user_inserts_first_time(db_pool):
    await ensure_user_exists("user_alpha")
    async with db_pool.acquire() as conn:
        n = await conn.fetchval(
            "SELECT count(*) FROM users WHERE clerk_user_id=$1", "user_alpha"
        )
    assert n == 1


@pytest.mark.asyncio
async def test_ensure_user_idempotent(db_pool):
    await ensure_user_exists("user_beta")
    await ensure_user_exists("user_beta")
    async with db_pool.acquire() as conn:
        n = await conn.fetchval(
            "SELECT count(*) FROM users WHERE clerk_user_id=$1", "user_beta"
        )
    assert n == 1
```

- [ ] **Step 2: Implement `backend/app/services/__init__.py`** (empty file).

- [ ] **Step 3: Implement `backend/app/services/users.py`**

```python
from app.db import get_pool


async def ensure_user_exists(clerk_user_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (clerk_user_id) VALUES ($1) "
            "ON CONFLICT (clerk_user_id) DO NOTHING",
            clerk_user_id,
        )
```

- [ ] **Step 4: Update `current_user_id` to lazy-create user**

Add at the bottom of `current_user_id` in `backend/app/auth.py`, just before `return str(sub)`:

```python
    from app.services.users import ensure_user_exists
    await ensure_user_exists(str(sub))
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/test_users.py tests/test_auth.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/services backend/app/auth.py backend/tests/test_users.py
git commit -m "feat(backend): lazy-create users on first authed request"
```

---

## Task 8: Pinecone vectorstore wrapper (mocked)

**Files:**
- Create: `backend/app/services/vectorstore.py`
- Create: `backend/tests/test_vectorstore.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_vectorstore.py`:

```python
from unittest.mock import MagicMock, patch
import pytest
from app.services.vectorstore import VectorStore


@pytest.fixture
def mock_index():
    idx = MagicMock()
    idx.upsert = MagicMock()
    idx.delete = MagicMock()
    idx.query = MagicMock(return_value={
        "matches": [
            {"id": "doc1#0", "score": 0.9, "metadata": {"chunk_text": "hello", "page": 1, "doc_id": "doc1"}},
            {"id": "doc1#1", "score": 0.8, "metadata": {"chunk_text": "world", "page": 2, "doc_id": "doc1"}},
        ]
    })
    return idx


def test_upsert_uses_user_namespace(mock_index):
    with patch("app.services.vectorstore.Pinecone") as P:
        P.return_value.Index.return_value = mock_index
        vs = VectorStore()
        vs.upsert(
            user_id="u1",
            doc_id="doc1",
            vectors=[[0.1, 0.2], [0.3, 0.4]],
            chunks=["hello", "world"],
            pages=[1, 2],
        )
    assert mock_index.upsert.called
    kwargs = mock_index.upsert.call_args.kwargs
    assert kwargs["namespace"] == "u1"
    vectors = kwargs["vectors"]
    assert vectors[0]["id"] == "doc1#0"
    assert vectors[0]["metadata"] == {"chunk_text": "hello", "page": 1, "doc_id": "doc1"}


def test_query_filters_to_doc_in_namespace(mock_index):
    with patch("app.services.vectorstore.Pinecone") as P:
        P.return_value.Index.return_value = mock_index
        vs = VectorStore()
        results = vs.query(user_id="u1", doc_id="doc1", vector=[0.1, 0.2], top_k=4)
    assert mock_index.query.call_args.kwargs["namespace"] == "u1"
    assert mock_index.query.call_args.kwargs["filter"] == {"doc_id": "doc1"}
    assert mock_index.query.call_args.kwargs["top_k"] == 4
    assert results == [
        {"chunk_text": "hello", "page": 1, "score": 0.9},
        {"chunk_text": "world", "page": 2, "score": 0.8},
    ]


def test_delete_doc_uses_namespace_and_filter(mock_index):
    with patch("app.services.vectorstore.Pinecone") as P:
        P.return_value.Index.return_value = mock_index
        vs = VectorStore()
        vs.delete_doc(user_id="u1", doc_id="doc1")
    kwargs = mock_index.delete.call_args.kwargs
    assert kwargs["namespace"] == "u1"
    assert kwargs["filter"] == {"doc_id": "doc1"}
```

- [ ] **Step 2: Implement `backend/app/services/vectorstore.py`**

```python
from typing import Any

from pinecone import Pinecone

from app.config import get_settings


class VectorStore:
    def __init__(self) -> None:
        s = get_settings()
        self._pc = Pinecone(api_key=s.pinecone_api_key)
        self._index = self._pc.Index(s.pinecone_index)

    def upsert(
        self,
        *,
        user_id: str,
        doc_id: str,
        vectors: list[list[float]],
        chunks: list[str],
        pages: list[int],
    ) -> None:
        items = [
            {
                "id": f"{doc_id}#{i}",
                "values": v,
                "metadata": {
                    "chunk_text": chunks[i],
                    "page": pages[i],
                    "doc_id": doc_id,
                },
            }
            for i, v in enumerate(vectors)
        ]
        self._index.upsert(vectors=items, namespace=user_id)

    def query(
        self,
        *,
        user_id: str,
        doc_id: str,
        vector: list[float],
        top_k: int,
    ) -> list[dict[str, Any]]:
        res = self._index.query(
            vector=vector,
            top_k=top_k,
            namespace=user_id,
            filter={"doc_id": doc_id},
            include_metadata=True,
        )
        out: list[dict[str, Any]] = []
        for m in res.get("matches", []):
            md = m.get("metadata", {}) or {}
            out.append({
                "chunk_text": md.get("chunk_text", ""),
                "page": md.get("page", 0),
                "score": m.get("score", 0.0),
            })
        return out

    def delete_doc(self, *, user_id: str, doc_id: str) -> None:
        self._index.delete(filter={"doc_id": doc_id}, namespace=user_id)
```

- [ ] **Step 3: Run, expect pass**

```bash
uv run pytest tests/test_vectorstore.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/vectorstore.py backend/tests/test_vectorstore.py
git commit -m "feat(backend): add Pinecone vectorstore wrapper with per-user namespace"
```

---

## Task 9: Embeddings wrapper (Gemini, mocked)

**Files:**
- Create: `backend/app/services/embeddings.py`
- Create: `backend/tests/test_embeddings.py`

- [ ] **Step 1: Write the failing test**

```python
from unittest.mock import MagicMock, patch
from app.services.embeddings import Embedder


def test_embed_documents_returns_vectors_per_chunk():
    with patch("app.services.embeddings.GoogleGenerativeAIEmbeddings") as G:
        instance = MagicMock()
        instance.embed_documents.return_value = [[0.1, 0.2], [0.3, 0.4]]
        instance.embed_query.return_value = [0.5, 0.6]
        G.return_value = instance
        e = Embedder()
        vecs = e.embed_documents(["a", "b"])
        q = e.embed_query("a")
    assert vecs == [[0.1, 0.2], [0.3, 0.4]]
    assert q == [0.5, 0.6]
    G.assert_called_once()
```

- [ ] **Step 2: Implement `backend/app/services/embeddings.py`**

```python
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings


class Embedder:
    def __init__(self) -> None:
        s = get_settings()
        self._client = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=s.gemini_api_key,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, min=0.5, max=4))
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._client.embed_documents(texts)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, min=0.5, max=4))
    def embed_query(self, text: str) -> list[float]:
        return self._client.embed_query(text)
```

Note: `stop_after_attempt(3)` = initial call + 2 retries, matching the spec's "retry 2x".

- [ ] **Step 3: Run, expect pass; commit**

```bash
uv run pytest tests/test_embeddings.py -v
git add backend/app/services/embeddings.py backend/tests/test_embeddings.py
git commit -m "feat(backend): add Gemini embeddings wrapper"
```

---

## Task 10: PDF parse + chunk (real PDF fixture)

**Files:**
- Create: `backend/tests/fixtures/sample.pdf` (5-page PDF, see step 1)
- Create: `backend/app/services/pdf_parse.py`
- Create: `backend/tests/test_pdf_parse.py`

- [ ] **Step 1: Generate a 5-page sample PDF**

Run once to create `backend/tests/fixtures/sample.pdf`:

```bash
mkdir -p backend/tests/fixtures
uv run python -c "
from pypdf import PdfWriter
from io import BytesIO
import reportlab.pdfgen.canvas as rl
buf = BytesIO()
c = rl.Canvas(buf)
for i in range(1, 6):
    c.drawString(100, 750, f'Page {i}')
    c.drawString(100, 700, f'Content body for page {i}. ' * 20)
    c.showPage()
c.save()
open('backend/tests/fixtures/sample.pdf','wb').write(buf.getvalue())
"
```

(Add `reportlab` to dev dependencies in pyproject.toml first; re-run `uv sync`.)

- [ ] **Step 2: Write failing test**

`backend/tests/test_pdf_parse.py`:

```python
from pathlib import Path
from app.services.pdf_parse import parse_pdf, chunk_pages

PDF = Path(__file__).parent / "fixtures" / "sample.pdf"


def test_parse_pdf_returns_one_doc_per_page():
    pages = parse_pdf(PDF.read_bytes())
    assert len(pages) == 5
    assert all("Page" in p["text"] for p in pages)
    assert pages[0]["page"] == 1
    assert pages[-1]["page"] == 5


def test_chunk_pages_preserves_page_numbers():
    pages = parse_pdf(PDF.read_bytes())
    chunks = chunk_pages(pages, chunk_size=200, overlap=40)
    assert len(chunks) >= 5
    assert {c["page"] for c in chunks}.issubset({1, 2, 3, 4, 5})
    assert all(len(c["text"]) <= 220 for c in chunks)


def test_parse_pdf_rejects_empty_text():
    import pytest
    from app.services.pdf_parse import EmptyPDFError
    blank = b"%PDF-1.4\n%%EOF"
    with pytest.raises(EmptyPDFError):
        parse_pdf(blank)
```

- [ ] **Step 3: Implement `backend/app/services/pdf_parse.py`**

```python
from io import BytesIO

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader


class EmptyPDFError(ValueError):
    pass


class EncryptedPDFError(ValueError):
    pass


def parse_pdf(data: bytes) -> list[dict]:
    try:
        reader = PdfReader(BytesIO(data))
    except Exception as e:
        raise EmptyPDFError("Could not read PDF") from e
    if reader.is_encrypted:
        raise EncryptedPDFError("Password-protected PDF not supported")
    pages: list[dict] = []
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append({"page": i, "text": text})
    if not pages:
        raise EmptyPDFError("No extractable text in PDF")
    return pages


def chunk_pages(
    pages: list[dict], *, chunk_size: int, overlap: int
) -> list[dict]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    out: list[dict] = []
    for p in pages:
        for piece in splitter.split_text(p["text"]):
            out.append({"page": p["page"], "text": piece})
    return out
```

- [ ] **Step 4: Run, expect pass; commit**

```bash
uv run pytest tests/test_pdf_parse.py -v
git add backend/app/services/pdf_parse.py backend/tests/test_pdf_parse.py backend/tests/fixtures backend/pyproject.toml
git commit -m "feat(backend): add PDF parser with page-aware chunking"
```

---

## Task 11: Ingest service end-to-end (mocked external deps)

**Files:**
- Create: `backend/app/services/ingest.py`
- Create: `backend/tests/test_ingest.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_ingest.py`:

```python
from pathlib import Path
from unittest.mock import MagicMock
import pytest
from app.services.ingest import ingest_pdf, IngestResult

PDF = Path(__file__).parent / "fixtures" / "sample.pdf"


@pytest.mark.asyncio
async def test_ingest_pdf_inserts_document_and_upserts_vectors(db_pool):
    embedder = MagicMock()
    embedder.embed_documents.side_effect = lambda texts: [[0.1] * 4 for _ in texts]
    vector_store = MagicMock()
    result: IngestResult = await ingest_pdf(
        user_id="user_ingest",
        filename="sample.pdf",
        data=PDF.read_bytes(),
        embedder=embedder,
        vector_store=vector_store,
    )
    assert result.page_count == 5
    assert result.chunk_count >= 5
    assert vector_store.upsert.called
    kw = vector_store.upsert.call_args.kwargs
    assert kw["user_id"] == "user_ingest"
    assert kw["doc_id"] == result.doc_id
    assert len(kw["vectors"]) == result.chunk_count
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT clerk_user_id, filename, page_count, chunk_count "
            "FROM documents WHERE id=$1::uuid",
            result.doc_id,
        )
    assert row["clerk_user_id"] == "user_ingest"
    assert row["filename"] == "sample.pdf"
    assert row["page_count"] == 5
    assert row["chunk_count"] == result.chunk_count


@pytest.mark.asyncio
async def test_ingest_rolls_back_doc_row_when_pinecone_fails(db_pool):
    embedder = MagicMock()
    embedder.embed_documents.return_value = [[0.1] * 4]
    vector_store = MagicMock()
    vector_store.upsert.side_effect = RuntimeError("pinecone down")
    with pytest.raises(RuntimeError):
        await ingest_pdf(
            user_id="user_rb",
            filename="sample.pdf",
            data=PDF.read_bytes(),
            embedder=embedder,
            vector_store=vector_store,
        )
    async with db_pool.acquire() as conn:
        n = await conn.fetchval(
            "SELECT count(*) FROM documents WHERE clerk_user_id=$1",
            "user_rb",
        )
    assert n == 0
```

- [ ] **Step 2: Implement `backend/app/services/ingest.py`**

```python
from dataclasses import dataclass

from app.config import get_settings
from app.db import get_pool
from app.services.pdf_parse import chunk_pages, parse_pdf
from app.services.users import ensure_user_exists


@dataclass
class IngestResult:
    doc_id: str
    page_count: int
    chunk_count: int


async def ingest_pdf(
    *,
    user_id: str,
    filename: str,
    data: bytes,
    embedder,
    vector_store,
) -> IngestResult:
    settings = get_settings()
    pages = parse_pdf(data)
    chunks = chunk_pages(
        pages, chunk_size=settings.chunk_size, overlap=settings.chunk_overlap
    )

    pool = await get_pool()
    await ensure_user_exists(user_id)
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "INSERT INTO documents (clerk_user_id, filename, page_count, chunk_count) "
                "VALUES ($1, $2, $3, $4) RETURNING id::text",
                user_id, filename, len(pages), len(chunks),
            )
            doc_id = row["id"]
            try:
                vectors = embedder.embed_documents([c["text"] for c in chunks])
                vector_store.upsert(
                    user_id=user_id,
                    doc_id=doc_id,
                    vectors=vectors,
                    chunks=[c["text"] for c in chunks],
                    pages=[c["page"] for c in chunks],
                )
            except Exception:
                raise

    return IngestResult(
        doc_id=doc_id, page_count=len(pages), chunk_count=len(chunks)
    )
```

Note: the transaction rolls back automatically when the upsert raises, ensuring the documents row is removed.

- [ ] **Step 3: Run tests; commit**

```bash
uv run pytest tests/test_ingest.py -v
git add backend/app/services/ingest.py backend/tests/test_ingest.py
git commit -m "feat(backend): add ingest pipeline with transactional rollback"
```

---

## Task 12: Documents routes (POST upload, GET list, DELETE)

**Files:**
- Create: `backend/app/models.py`
- Create: `backend/app/routes/__init__.py` (empty)
- Create: `backend/app/routes/documents.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_routes_documents.py`

- [ ] **Step 1: Define request/response models in `backend/app/models.py`**

```python
from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: str
    filename: str
    page_count: int
    chunk_count: int
    created_at: str


class UploadResult(BaseModel):
    doc_id: str
    filename: str
    page_count: int
    chunk_count: int
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_routes_documents.py`:

```python
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

PDF = Path(__file__).parent / "fixtures" / "sample.pdf"


@pytest.fixture
def client_with_overrides(db_pool):
    from app.main import build_app
    from app.auth import current_user_id
    app = build_app()

    async def fake_user():
        return "user_routes"
    app.dependency_overrides[current_user_id] = fake_user

    embedder = MagicMock()
    embedder.embed_documents.side_effect = lambda texts: [[0.1] * 4 for _ in texts]
    vector_store = MagicMock()

    from app.routes import documents as docs_mod
    docs_mod._embedder = embedder  # injected for test
    docs_mod._vector_store = vector_store

    return TestClient(app), embedder, vector_store


def test_upload_returns_doc_metadata(client_with_overrides):
    client, _, vs = client_with_overrides
    r = client.post(
        "/docs",
        files={"file": ("sample.pdf", PDF.read_bytes(), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["filename"] == "sample.pdf"
    assert body["page_count"] == 5
    assert body["chunk_count"] >= 5
    assert vs.upsert.called


def test_list_returns_user_docs(client_with_overrides):
    client, *_ = client_with_overrides
    client.post("/docs", files={"file": ("a.pdf", PDF.read_bytes(), "application/pdf")})
    client.post("/docs", files={"file": ("b.pdf", PDF.read_bytes(), "application/pdf")})
    r = client.get("/docs")
    assert r.status_code == 200
    items = r.json()
    names = {d["filename"] for d in items}
    assert {"a.pdf", "b.pdf"}.issubset(names)


def test_delete_removes_doc(client_with_overrides):
    client, _, vs = client_with_overrides
    up = client.post("/docs", files={"file": ("c.pdf", PDF.read_bytes(), "application/pdf")})
    doc_id = up.json()["doc_id"]
    r = client.delete(f"/docs/{doc_id}")
    assert r.status_code == 204
    assert vs.delete_doc.called


def test_reject_non_pdf(client_with_overrides):
    client, *_ = client_with_overrides
    r = client.post(
        "/docs",
        files={"file": ("x.txt", b"hello", "text/plain")},
    )
    assert r.status_code == 400


def test_reject_too_large(client_with_overrides, monkeypatch):
    from app.config import get_settings
    monkeypatch.setenv("MAX_PDF_MB", "0")
    get_settings.cache_clear()
    client, *_ = client_with_overrides
    r = client.post(
        "/docs",
        files={"file": ("big.pdf", PDF.read_bytes(), "application/pdf")},
    )
    assert r.status_code == 413
```

- [ ] **Step 3: Implement `backend/app/routes/documents.py`**

```python
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.auth import current_user_id
from app.config import get_settings
from app.db import get_pool
from app.models import DocumentOut, UploadResult
from app.services.embeddings import Embedder
from app.services.ingest import ingest_pdf
from app.services.vectorstore import VectorStore

router = APIRouter(prefix="/docs", tags=["documents"])

# Lazy singletons; tests can override these attributes.
_embedder: Embedder | None = None
_vector_store: VectorStore | None = None


def _get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder


def _get_vector_store() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


@router.post("", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile = File(...),
    user_id: str = Depends(current_user_id),
) -> UploadResult:
    settings = get_settings()
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF allowed")

    data = await file.read()
    if len(data) > settings.max_pdf_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Max {settings.max_pdf_mb}MB")

    try:
        result = await ingest_pdf(
            user_id=user_id,
            filename=file.filename or "untitled.pdf",
            data=data,
            embedder=_get_embedder(),
            vector_store=_get_vector_store(),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if result.page_count > settings.max_pdf_pages:
        # rollback: delete doc + vectors (best-effort)
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM documents WHERE id=$1::uuid", result.doc_id)
        _get_vector_store().delete_doc(user_id=user_id, doc_id=result.doc_id)
        raise HTTPException(status_code=400, detail=f"Max {settings.max_pdf_pages} pages")

    return UploadResult(
        doc_id=result.doc_id,
        filename=file.filename or "untitled.pdf",
        page_count=result.page_count,
        chunk_count=result.chunk_count,
    )


@router.get("", response_model=list[DocumentOut])
async def list_docs(user_id: str = Depends(current_user_id)) -> list[DocumentOut]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id::text, filename, page_count, chunk_count, created_at "
            "FROM documents WHERE clerk_user_id=$1 ORDER BY created_at DESC",
            user_id,
        )
    return [
        DocumentOut(
            id=r["id"],
            filename=r["filename"],
            page_count=r["page_count"],
            chunk_count=r["chunk_count"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.delete("/{doc_id}", status_code=204)
async def delete_doc(
    doc_id: str,
    user_id: str = Depends(current_user_id),
) -> Response:
    pool = await get_pool()
    async with pool.acquire() as conn:
        deleted = await conn.fetchval(
            "DELETE FROM documents WHERE id=$1::uuid AND clerk_user_id=$2 "
            "RETURNING id::text",
            doc_id, user_id,
        )
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")
    _get_vector_store().delete_doc(user_id=user_id, doc_id=doc_id)
    return Response(status_code=204)
```

- [ ] **Step 4: Wire router into `backend/app/main.py`**

Replace `build_app()` body to also include:

```python
    from app.routes.documents import router as docs_router
    app.include_router(docs_router)
```

(Add this line after CORS middleware setup, before returning `app`.)

- [ ] **Step 5: Run tests; commit**

```bash
uv run pytest tests/test_routes_documents.py -v
git add backend/app/models.py backend/app/routes backend/app/main.py backend/tests/test_routes_documents.py
git commit -m "feat(backend): add documents upload/list/delete routes"
```

---

## Task 13: Retrieve service

**Files:**
- Create: `backend/app/services/retrieve.py`
- Create: `backend/tests/test_retrieve.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_retrieve.py`:

```python
from unittest.mock import MagicMock
from app.services.retrieve import retrieve_chunks


def test_retrieve_calls_embed_then_query():
    embedder = MagicMock()
    embedder.embed_query.return_value = [0.1, 0.2]
    vector_store = MagicMock()
    vector_store.query.return_value = [
        {"chunk_text": "alpha", "page": 1, "score": 0.9},
        {"chunk_text": "beta", "page": 2, "score": 0.8},
    ]
    chunks = retrieve_chunks(
        user_id="u",
        doc_id="d",
        question="hi",
        top_k=2,
        embedder=embedder,
        vector_store=vector_store,
    )
    embedder.embed_query.assert_called_once_with("hi")
    vector_store.query.assert_called_once()
    assert [c["chunk_text"] for c in chunks] == ["alpha", "beta"]
```

- [ ] **Step 2: Implement `backend/app/services/retrieve.py`**

```python
from typing import Any


def retrieve_chunks(
    *,
    user_id: str,
    doc_id: str,
    question: str,
    top_k: int,
    embedder,
    vector_store,
) -> list[dict[str, Any]]:
    vector = embedder.embed_query(question)
    return vector_store.query(
        user_id=user_id, doc_id=doc_id, vector=vector, top_k=top_k
    )
```

- [ ] **Step 3: Run; commit**

```bash
uv run pytest tests/test_retrieve.py -v
git add backend/app/services/retrieve.py backend/tests/test_retrieve.py
git commit -m "feat(backend): add retrieval service"
```

---

## Task 14: LLM service (prompt + streaming)

**Files:**
- Create: `backend/app/services/llm.py`
- Create: `backend/tests/test_llm.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_llm.py`:

```python
from unittest.mock import MagicMock, patch
from app.services.llm import build_prompt, stream_answer


def test_build_prompt_inlines_chunks_and_question():
    prompt = build_prompt(
        question="What is X?",
        chunks=[
            {"chunk_text": "X is a foo.", "page": 1},
            {"chunk_text": "Foo means bar.", "page": 2},
        ],
    )
    assert "What is X?" in prompt
    assert "X is a foo." in prompt
    assert "[page 1]" in prompt
    assert "[page 2]" in prompt
    assert "only this context" in prompt.lower()


def test_stream_answer_yields_tokens():
    with patch("app.services.llm.ChatGoogleGenerativeAI") as C:
        instance = MagicMock()
        instance.stream.return_value = iter([
            MagicMock(content="Hello "),
            MagicMock(content="world"),
        ])
        C.return_value = instance
        tokens = list(stream_answer("prompt"))
    assert tokens == ["Hello ", "world"]
```

- [ ] **Step 2: Implement `backend/app/services/llm.py`**

```python
from collections.abc import Iterator

from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import get_settings


SYSTEM_INSTRUCTIONS = (
    "You answer questions using only this context from a PDF. "
    "If the answer is not in the context, say you cannot find it. "
    "Cite page numbers like [p. N] when relevant."
)


def build_prompt(*, question: str, chunks: list[dict]) -> str:
    parts = [SYSTEM_INSTRUCTIONS, "", "Context:"]
    for c in chunks:
        parts.append(f"[page {c['page']}] {c['chunk_text']}")
    parts.extend(["", f"Question: {question}", "Answer:"])
    return "\n".join(parts)


def stream_answer(prompt: str) -> Iterator[str]:
    s = get_settings()
    chat = ChatGoogleGenerativeAI(
        model="gemini-1.5-flash",
        google_api_key=s.gemini_api_key,
        temperature=0.2,
    )
    for chunk in chat.stream(prompt):
        text = getattr(chunk, "content", "") or ""
        if text:
            yield text
```

- [ ] **Step 3: Run; commit**

```bash
uv run pytest tests/test_llm.py -v
git add backend/app/services/llm.py backend/tests/test_llm.py
git commit -m "feat(backend): add LLM prompt builder and streaming"
```

---

## Task 15: Rate-limit service (Upstash REST)

**Files:**
- Create: `backend/app/services/ratelimit.py`
- Create: `backend/tests/test_ratelimit.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_ratelimit.py`:

```python
import respx
from httpx import Response
import pytest
from app.services.ratelimit import RateLimiter


@pytest.mark.asyncio
async def test_allows_under_limit(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://r")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "t")
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("CLERK_JWKS_URL", "x")
    monkeypatch.setenv("CLERK_ISSUER", "x")
    monkeypatch.setenv("PINECONE_API_KEY", "x")
    monkeypatch.setenv("PINECONE_INDEX", "x")
    monkeypatch.setenv("SUPABASE_DB_URL", "x")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    from app.config import get_settings
    get_settings.cache_clear()

    rl = RateLimiter()
    with respx.mock(assert_all_called=False) as m:
        # incr returns 1, expire returns 1
        m.post("https://r/pipeline").mock(
            return_value=Response(200, json=[{"result": 1}, {"result": 1}])
        )
        ok = await rl.check_and_increment(key="user:upload", limit=10, window_seconds=86400)
    assert ok is True


@pytest.mark.asyncio
async def test_rejects_at_limit(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://r")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "t")
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("CLERK_JWKS_URL", "x")
    monkeypatch.setenv("CLERK_ISSUER", "x")
    monkeypatch.setenv("PINECONE_API_KEY", "x")
    monkeypatch.setenv("PINECONE_INDEX", "x")
    monkeypatch.setenv("SUPABASE_DB_URL", "x")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    from app.config import get_settings
    get_settings.cache_clear()

    rl = RateLimiter()
    with respx.mock(assert_all_called=False) as m:
        m.post("https://r/pipeline").mock(
            return_value=Response(200, json=[{"result": 11}, {"result": 1}])
        )
        ok = await rl.check_and_increment(key="user:upload", limit=10, window_seconds=86400)
    assert ok is False
```

- [ ] **Step 2: Implement `backend/app/services/ratelimit.py`**

```python
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
```

- [ ] **Step 3: Run; commit**

```bash
uv run pytest tests/test_ratelimit.py -v
git add backend/app/services/ratelimit.py backend/tests/test_ratelimit.py
git commit -m "feat(backend): add Upstash-backed rate limiter"
```

---

## Task 16: Wire rate limit into upload + chat (planned)

**Files:**
- Modify: `backend/app/routes/documents.py`
- Modify: `backend/tests/test_routes_documents.py`

(Chat route gets the same treatment in Task 18.)

- [ ] **Step 1: Add a test that 429 is returned past the upload limit**

Append to `backend/tests/test_routes_documents.py`:

```python
def test_upload_429_when_rate_limited(client_with_overrides, monkeypatch):
    from app.routes import documents as docs_mod
    from unittest.mock import AsyncMock
    docs_mod._rate_limiter = type("L", (), {"check_and_increment": AsyncMock(return_value=False)})()
    client, *_ = client_with_overrides
    from pathlib import Path
    PDF = Path(__file__).parent / "fixtures" / "sample.pdf"
    r = client.post(
        "/docs",
        files={"file": ("a.pdf", PDF.read_bytes(), "application/pdf")},
    )
    assert r.status_code == 429
    assert "Retry-After" in r.headers
```

- [ ] **Step 2: Update `documents.py`**

Add at top of `app/routes/documents.py`:

```python
from app.services.ratelimit import RateLimiter

_rate_limiter: RateLimiter | None = None


def _get_rate_limiter() -> RateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter
```

In `upload()`, immediately after deriving `user_id`:

```python
    settings = get_settings()
    allowed = await _get_rate_limiter().check_and_increment(
        key=f"upload:{user_id}",
        limit=settings.daily_upload_limit,
        window_seconds=86400,
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Daily upload limit reached",
            headers={"Retry-After": "86400"},
        )
```

- [ ] **Step 3: Run; commit**

```bash
uv run pytest tests/test_routes_documents.py -v
git add backend/app/routes/documents.py backend/tests/test_routes_documents.py
git commit -m "feat(backend): rate-limit uploads per user/day"
```

---

## Task 17: Quota guard for global Gemini usage

**Files:**
- Create: `backend/app/services/quota.py`
- Create: `backend/tests/test_quota.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_quota.py`:

```python
import respx
from httpx import Response
import pytest
from app.services.quota import GeminiQuotaGuard


@pytest.mark.asyncio
async def test_within_quota_returns_true(monkeypatch):
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "https://r")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "t")
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("CLERK_JWKS_URL", "x")
    monkeypatch.setenv("CLERK_ISSUER", "x")
    monkeypatch.setenv("PINECONE_API_KEY", "x")
    monkeypatch.setenv("PINECONE_INDEX", "x")
    monkeypatch.setenv("SUPABASE_DB_URL", "x")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
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
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("CLERK_JWKS_URL", "x")
    monkeypatch.setenv("CLERK_ISSUER", "x")
    monkeypatch.setenv("PINECONE_API_KEY", "x")
    monkeypatch.setenv("PINECONE_INDEX", "x")
    monkeypatch.setenv("SUPABASE_DB_URL", "x")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
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
```

- [ ] **Step 2: Implement `backend/app/services/quota.py`**

```python
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
```

- [ ] **Step 3: Run; commit**

```bash
uv run pytest tests/test_quota.py -v
git add backend/app/services/quota.py backend/tests/test_quota.py
git commit -m "feat(backend): add global Gemini quota guard"
```

---

## Task 18: Chat route with SSE streaming

**Files:**
- Create: `backend/app/routes/chat.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_routes_chat.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_routes_chat.py`:

```python
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi.testclient import TestClient

PDF = Path(__file__).parent / "fixtures" / "sample.pdf"


@pytest.fixture
def client(db_pool):
    from app.main import build_app
    from app.auth import current_user_id
    app = build_app()

    async def fake_user():
        return "user_chat"
    app.dependency_overrides[current_user_id] = fake_user

    embedder = MagicMock()
    embedder.embed_documents.side_effect = lambda texts: [[0.1] * 4 for _ in texts]
    embedder.embed_query.return_value = [0.1, 0.2, 0.3, 0.4]
    vector_store = MagicMock()
    vector_store.query.return_value = [
        {"chunk_text": "X is a foo.", "page": 1, "score": 0.9},
    ]

    rl = type("L", (), {"check_and_increment": AsyncMock(return_value=True)})()
    quota = type("Q", (), {"check_and_increment": AsyncMock(return_value=True)})()

    from app.routes import documents as docs_mod
    from app.routes import chat as chat_mod
    docs_mod._embedder = embedder
    docs_mod._vector_store = vector_store
    docs_mod._rate_limiter = rl
    chat_mod._embedder = embedder
    chat_mod._vector_store = vector_store
    chat_mod._rate_limiter = rl
    chat_mod._quota = quota

    def fake_stream(prompt: str):
        yield "Hello "
        yield "world"
    chat_mod.stream_answer = fake_stream

    return TestClient(app)


def _upload(client) -> str:
    r = client.post("/docs", files={"file": ("a.pdf", PDF.read_bytes(), "application/pdf")})
    return r.json()["doc_id"]


def test_chat_streams_tokens_and_persists_messages(client, db_pool):
    doc_id = _upload(client)
    with client.stream("POST", f"/chat/{doc_id}", json={"question": "What is X?"}) as r:
        assert r.status_code == 200
        body = b"".join(r.iter_bytes())
    text = body.decode()
    assert "Hello " in text
    assert "world" in text
    # final event carries sources
    assert "[p. 1]" in text or '"page": 1' in text


def test_chat_404_for_other_users_doc(client):
    # upload as user_chat
    doc_id = _upload(client)
    # swap user
    from app.auth import current_user_id
    from app.main import build_app
    app = build_app()
    async def other():
        return "user_other"
    app.dependency_overrides[current_user_id] = other
    other_client = TestClient(app)
    r = other_client.post(f"/chat/{doc_id}", json={"question": "hi"})
    assert r.status_code == 404
```

- [ ] **Step 2: Add chat request model in `backend/app/models.py`**

```python
class ChatRequest(BaseModel):
    question: str
```

- [ ] **Step 3: Implement `backend/app/routes/chat.py`**

```python
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from sse_starlette.sse import EventSourceResponse

from app.auth import current_user_id
from app.config import get_settings
from app.db import get_pool
from app.models import ChatRequest
from app.services.embeddings import Embedder
from app.services.llm import build_prompt, stream_answer
from app.services.quota import GeminiQuotaGuard
from app.services.ratelimit import RateLimiter
from app.services.retrieve import retrieve_chunks
from app.services.vectorstore import VectorStore

router = APIRouter(prefix="/chat", tags=["chat"])

_embedder: Embedder | None = None
_vector_store: VectorStore | None = None
_rate_limiter: RateLimiter | None = None
_quota: GeminiQuotaGuard | None = None


def _embedder_inst() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder


def _vs_inst() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


def _rl_inst() -> RateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


def _quota_inst() -> GeminiQuotaGuard:
    global _quota
    if _quota is None:
        _quota = GeminiQuotaGuard()
    return _quota


@router.post("/{doc_id}")
async def chat(
    doc_id: str,
    body: ChatRequest,
    user_id: str = Depends(current_user_id),
):
    settings = get_settings()

    if not await _rl_inst().check_and_increment(
        key=f"chat:{user_id}",
        limit=settings.daily_chat_limit,
        window_seconds=86400,
    ):
        raise HTTPException(
            status_code=429,
            detail="Daily chat limit reached",
            headers={"Retry-After": "86400"},
        )

    if not await _quota_inst().check_and_increment():
        raise HTTPException(status_code=503, detail="Service paused, try tomorrow")

    pool = await get_pool()
    async with pool.acquire() as conn:
        owned = await conn.fetchval(
            "SELECT 1 FROM documents WHERE id=$1::uuid AND clerk_user_id=$2",
            doc_id, user_id,
        )
    if not owned:
        raise HTTPException(status_code=404, detail="Not found")

    chunks = retrieve_chunks(
        user_id=user_id,
        doc_id=doc_id,
        question=body.question,
        top_k=settings.top_k,
        embedder=_embedder_inst(),
        vector_store=_vs_inst(),
    )

    prompt = build_prompt(question=body.question, chunks=chunks)

    async def event_stream() -> AsyncIterator[dict]:
        # persist user message immediately
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO chats (document_id, role, content) VALUES ($1::uuid, 'user', $2)",
                doc_id, body.question,
            )
        full: list[str] = []
        try:
            for token in stream_answer(prompt):
                full.append(token)
                yield {"event": "token", "data": token}
        finally:
            assistant_text = "".join(full) or "[interrupted]"
            sources = [{"page": c["page"], "score": c["score"]} for c in chunks]
            async with pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO chats (document_id, role, content) VALUES ($1::uuid, 'assistant', $2)",
                    doc_id, assistant_text,
                )
            yield {"event": "sources", "data": json.dumps(sources)}
            yield {"event": "done", "data": ""}

    return EventSourceResponse(event_stream())
```

- [ ] **Step 4: Wire chat router in `backend/app/main.py`**

Add inside `build_app()` after the documents router include:

```python
    from app.routes.chat import router as chat_router
    app.include_router(chat_router)
```

- [ ] **Step 5: Run tests; commit**

```bash
uv run pytest tests/test_routes_chat.py -v
git add backend/app/routes/chat.py backend/app/models.py backend/app/main.py backend/tests/test_routes_chat.py
git commit -m "feat(backend): add chat SSE route with retrieval and persistence"
```

---

## Task 19: Backend CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 3s --health-retries 5
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install uv
        run: pip install uv
      - name: Install deps
        working-directory: backend
        run: uv sync
      - name: Lint
        working-directory: backend
        run: uv run ruff check .
      - name: Type check
        working-directory: backend
        run: uv run mypy app
      - name: Test
        working-directory: backend
        run: uv run pytest -q
  frontend:
    runs-on: ubuntu-latest
    needs: []
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install
        working-directory: frontend
        run: npm ci
      - name: Lint
        working-directory: frontend
        run: npm run lint
      - name: Test
        working-directory: frontend
        run: npm test -- --run
      - name: Build
        working-directory: frontend
        run: npm run build
        env:
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk_test_dummy
          CLERK_SECRET_KEY: sk_test_dummy
          NEXT_PUBLIC_API_BASE_URL: http://localhost:8000
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: add CI workflow for backend and frontend"
```

---

## Task 20: Frontend init (Next.js + Tailwind + shadcn)

**Files:** entire `frontend/` tree.

- [ ] **Step 1: Bootstrap**

```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack
```

- [ ] **Step 2: Install runtime deps**

```bash
npm install @clerk/nextjs @tanstack/react-query react-dropzone zod
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input dialog toast scroll-area
```

- [ ] **Step 4: Install dev deps**

```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/node
```

- [ ] **Step 5: Configure vitest**

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

Install plugin: `npm install -D @vitejs/plugin-react`.

Create `frontend/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Update `frontend/package.json` scripts:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest"
}
```

- [ ] **Step 6: Smoke run**

```bash
npm run dev   # ctrl-c after page renders
npm run build
npm test -- --run
```

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "chore(frontend): scaffold Next.js with Tailwind, shadcn, vitest"
```

---

## Task 21: Clerk integration

**Files:**
- Create: `frontend/middleware.ts`
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `frontend/app/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1: `frontend/middleware.ts`**

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher(["/dashboard(.*)", "/chat(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
```

- [ ] **Step 2: Wrap `frontend/app/layout.tsx`**

```tsx
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-background text-foreground antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 3: Sign-in page** `frontend/app/sign-in/[[...sign-in]]/page.tsx`

```tsx
import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 4: Sign-up page** `frontend/app/sign-up/[[...sign-up]]/page.tsx`

```tsx
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 5: Run `npm run dev`, sign up, confirm redirect to `/dashboard` (404 OK for now). Commit.**

```bash
git add frontend/middleware.ts frontend/app
git commit -m "feat(frontend): integrate Clerk with protected routes"
```

---

## Task 22: API helper + types

**Files:**
- Create: `frontend/lib/types.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/__tests__/lib/api.test.ts`

- [ ] **Step 1: `frontend/lib/types.ts`**

```ts
export type Document = {
  id: string;
  filename: string;
  page_count: number;
  chunk_count: number;
  created_at: string;
};

export type UploadResult = {
  doc_id: string;
  filename: string;
  page_count: number;
  chunk_count: number;
};

export type Source = { page: number; score: number };
```

- [ ] **Step 2: Failing test `frontend/__tests__/lib/api.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "@/lib/api";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://api.test";
});

describe("apiFetch", () => {
  it("attaches Authorization header from token getter", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await apiFetch("/docs", { tokenGetter: async () => "abc" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get("Authorization")).toBe("Bearer abc");
  });

  it("throws on non-2xx with detail message", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "nope" }), { status: 400 })
    );
    await expect(
      apiFetch("/docs", { tokenGetter: async () => "abc" })
    ).rejects.toThrow("nope");
  });
});
```

- [ ] **Step 3: Implement `frontend/lib/api.ts`**

```ts
type FetchOpts = RequestInit & { tokenGetter: () => Promise<string | null> };

export async function apiFetch<T = unknown>(
  path: string,
  opts: FetchOpts
): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const token = await opts.tokenGetter();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, { ...opts, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: string };
      if (j.detail) detail = j.detail;
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Run; commit**

```bash
npm test -- --run
git add frontend/lib frontend/__tests__/lib
git commit -m "feat(frontend): add API fetch helper with JWT injection"
```

---

## Task 23: Landing page

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Replace contents**

```tsx
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold">ParseWithAI</h1>
      <p className="text-muted-foreground max-w-xl text-center">
        Upload a PDF, ask questions, get answers grounded in the document with page citations.
      </p>
      <div className="flex gap-3">
        <SignedOut>
          <Button asChild><Link href="/sign-in">Sign in</Link></Button>
          <Button asChild variant="outline"><Link href="/sign-up">Sign up</Link></Button>
        </SignedOut>
        <SignedIn>
          <Button asChild><Link href="/dashboard">Open dashboard</Link></Button>
        </SignedIn>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run `npm run dev`, verify landing renders. Commit.**

```bash
git add frontend/app/page.tsx
git commit -m "feat(frontend): add landing page"
```

---

## Task 24: DocList component

**Files:**
- Create: `frontend/components/DocList.tsx`
- Create: `frontend/__tests__/components/DocList.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocList from "@/components/DocList";

const docs = [
  { id: "1", filename: "alpha.pdf", page_count: 5, chunk_count: 12, created_at: "2026-04-27T10:00:00Z" },
  { id: "2", filename: "beta.pdf", page_count: 3, chunk_count: 7, created_at: "2026-04-26T10:00:00Z" },
];

describe("DocList", () => {
  it("renders rows for each doc", () => {
    render(<DocList docs={docs} onDelete={() => {}} />);
    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();
  });

  it("calls onDelete when delete clicked", async () => {
    const onDelete = vi.fn();
    render(<DocList docs={docs} onDelete={onDelete} />);
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    expect(onDelete).toHaveBeenCalledWith("1");
  });

  it("renders empty state when no docs", () => {
    render(<DocList docs={[]} onDelete={() => {}} />);
    expect(screen.getByText(/no documents/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `frontend/components/DocList.tsx`**

```tsx
"use client";
import Link from "next/link";
import type { Document } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function DocList({
  docs,
  onDelete,
}: {
  docs: Document[];
  onDelete: (id: string) => void;
}) {
  if (docs.length === 0) {
    return <p className="text-muted-foreground">No documents yet. Upload one to start.</p>;
  }
  return (
    <ul className="divide-y rounded-md border">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 p-3">
          <div className="flex flex-col">
            <Link href={`/chat/${d.id}`} className="font-medium hover:underline">
              {d.filename}
            </Link>
            <span className="text-muted-foreground text-xs">
              {d.page_count} pages · {d.chunk_count} chunks
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onDelete(d.id)}>
            Delete
          </Button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Run; commit**

```bash
npm test -- --run
git add frontend/components/DocList.tsx frontend/__tests__/components/DocList.test.tsx
git commit -m "feat(frontend): add DocList component"
```

---

## Task 25: UploadDropzone component

**Files:**
- Create: `frontend/components/UploadDropzone.tsx`
- Create: `frontend/__tests__/components/UploadDropzone.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UploadDropzone from "@/components/UploadDropzone";

describe("UploadDropzone", () => {
  it("calls onUpload when a PDF is selected", async () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} />);
    const file = new File(["%PDF-1.4"], "x.pdf", { type: "application/pdf" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("shows error for non-pdf", async () => {
    const onUpload = vi.fn();
    render(<UploadDropzone onUpload={onUpload} />);
    const file = new File(["txt"], "x.txt", { type: "text/plain" });
    const input = screen.getByTestId("file-input") as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(onUpload).not.toHaveBeenCalled();
    expect(screen.getByText(/only pdf/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `frontend/components/UploadDropzone.tsx`**

```tsx
"use client";
import { useState } from "react";

export default function UploadDropzone({
  onUpload,
}: {
  onUpload: (file: File) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-md border-2 border-dashed p-8 text-center">
      <p className="mb-3 text-sm">Drop a PDF here, or pick one:</p>
      <input
        data-testid="file-input"
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          setError(null);
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.type !== "application/pdf") {
            setError("Only PDF allowed");
            return;
          }
          onUpload(f);
        }}
      />
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Run; commit**

```bash
npm test -- --run
git add frontend/components/UploadDropzone.tsx frontend/__tests__/components/UploadDropzone.test.tsx
git commit -m "feat(frontend): add UploadDropzone component"
```

---

## Task 26: Dashboard page (TanStack Query + upload)

**Files:**
- Create: `frontend/components/QueryProvider.tsx`
- Modify: `frontend/app/layout.tsx`
- Create: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: `frontend/components/QueryProvider.tsx`**

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Wrap layout with `QueryProvider`**

In `frontend/app/layout.tsx`, wrap `{children}` with `<QueryProvider>`:

```tsx
import QueryProvider from "@/components/QueryProvider";
// ...
<body className="...">
  <QueryProvider>{children}</QueryProvider>
</body>
```

- [ ] **Step 3: Create `frontend/app/dashboard/page.tsx`**

```tsx
"use client";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { Document, UploadResult } from "@/lib/types";
import DocList from "@/components/DocList";
import UploadDropzone from "@/components/UploadDropzone";

export default function DashboardPage() {
  const { getToken } = useAuth();
  const tokenGetter = async () => getToken();
  const qc = useQueryClient();
  const router = useRouter();

  const docsQ = useQuery({
    queryKey: ["docs"],
    queryFn: () => apiFetch<Document[]>("/docs", { tokenGetter }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiFetch<UploadResult>("/docs", {
        method: "POST",
        body: fd,
        tokenGetter,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["docs"] });
      router.push(`/chat/${r.doc_id}`);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/docs/${id}`, { method: "DELETE", tokenGetter }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs"] }),
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Your documents</h1>
      <UploadDropzone onUpload={(f) => upload.mutate(f)} />
      {upload.isPending && <p>Uploading and indexing...</p>}
      {upload.isError && <p className="text-red-500">{(upload.error as Error).message}</p>}
      {docsQ.isLoading ? (
        <p>Loading...</p>
      ) : (
        <DocList docs={docsQ.data ?? []} onDelete={(id) => del.mutate(id)} />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Manual smoke**

Backend running. Frontend running. Sign in. Upload `tests/fixtures/sample.pdf` → expect redirect to `/chat/<id>`.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/dashboard frontend/components/QueryProvider.tsx
git commit -m "feat(frontend): add dashboard with upload and document list"
```

---

## Task 27: Chat components

**Files:**
- Create: `frontend/components/MessageBubble.tsx`
- Create: `frontend/components/SourceCitation.tsx`
- Create: `frontend/components/ChatWindow.tsx`
- Create: `frontend/__tests__/components/ChatWindow.test.tsx`

- [ ] **Step 1: `frontend/components/MessageBubble.tsx`**

```tsx
export default function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {content}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `frontend/components/SourceCitation.tsx`**

```tsx
import type { Source } from "@/lib/types";

export default function SourceCitation({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="text-muted-foreground mt-1 text-xs">
      Sources:{" "}
      {sources.map((s, i) => (
        <span key={i} className="mr-2">
          [p. {s.page}]
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Failing test for `ChatWindow`**

`frontend/__tests__/components/ChatWindow.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatWindow from "@/components/ChatWindow";

describe("ChatWindow", () => {
  it("renders existing messages and submits a new one", async () => {
    const onSend = vi.fn();
    render(
      <ChatWindow
        messages={[{ role: "user", content: "hi" }]}
        sources={[]}
        streaming={false}
        onSend={onSend}
      />
    );
    expect(screen.getByText("hi")).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/ask/i), "what is X?{Enter}");
    expect(onSend).toHaveBeenCalledWith("what is X?");
  });
});
```

- [ ] **Step 4: Implement `frontend/components/ChatWindow.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import MessageBubble from "@/components/MessageBubble";
import SourceCitation from "@/components/SourceCitation";
import type { Source } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatWindow({
  messages,
  sources,
  streaming,
  onSend,
}: {
  messages: Msg[];
  sources: Source[];
  streaming: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <div className="flex h-[70vh] flex-col gap-3 rounded-md border p-4">
      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} />
        ))}
        <SourceCitation sources={sources} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text);
          setText("");
        }}
      >
        <Input
          placeholder="Ask a question..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={streaming}
        />
        <Button type="submit" disabled={streaming}>
          {streaming ? "..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Run; commit**

```bash
npm test -- --run
git add frontend/components/MessageBubble.tsx frontend/components/SourceCitation.tsx frontend/components/ChatWindow.tsx frontend/__tests__/components/ChatWindow.test.tsx
git commit -m "feat(frontend): add chat window components"
```

---

## Task 28: Chat page with SSE wiring

**Files:**
- Create: `frontend/lib/streamChat.ts`
- Create: `frontend/app/chat/[docId]/page.tsx`

- [ ] **Step 1: `frontend/lib/streamChat.ts`**

```ts
import type { Source } from "@/lib/types";

export async function streamChat(opts: {
  docId: string;
  question: string;
  token: string | null;
  onToken: (t: string) => void;
  onSources: (s: Source[]) => void;
  onDone: () => void;
  onError: (e: Error) => void;
}) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const res = await fetch(`${base}/chat/${opts.docId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: JSON.stringify({ question: opts.question }),
  });
  if (!res.ok || !res.body) {
    opts.onError(new Error(`HTTP ${res.status}`));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const ev of events) {
      const lines = ev.split("\n");
      let event = "message";
      let data = "";
      for (const ln of lines) {
        if (ln.startsWith("event: ")) event = ln.slice(7).trim();
        else if (ln.startsWith("data: ")) data += ln.slice(6);
      }
      if (event === "token") opts.onToken(data);
      else if (event === "sources") opts.onSources(JSON.parse(data));
      else if (event === "done") opts.onDone();
    }
  }
}
```

- [ ] **Step 2: `frontend/app/chat/[docId]/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import ChatWindow from "@/components/ChatWindow";
import { streamChat } from "@/lib/streamChat";
import type { Source } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const { docId } = useParams<{ docId: string }>();
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [streaming, setStreaming] = useState(false);

  const handleSend = async (text: string) => {
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setSources([]);
    setStreaming(true);
    const token = await getToken();
    await streamChat({
      docId,
      question: text,
      token,
      onToken: (t) =>
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            content: copy[copy.length - 1].content + t,
          };
          return copy;
        }),
      onSources: setSources,
      onDone: () => setStreaming(false),
      onError: (e) => {
        setStreaming(false);
        setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
      },
    });
  };

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Chat</h1>
      <ChatWindow
        messages={messages}
        sources={sources}
        streaming={streaming}
        onSend={handleSend}
      />
    </main>
  );
}
```

- [ ] **Step 3: Manual smoke**

Backend + frontend running. Upload PDF → land on chat page → ask question → tokens stream → sources show.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/streamChat.ts frontend/app/chat
git commit -m "feat(frontend): add chat page with SSE streaming and sources"
```

---

## Task 29: Tenancy isolation manual proof + automated check

**Files:**
- Modify: `backend/tests/test_routes_documents.py`
- Modify: `backend/tests/test_routes_chat.py`

- [ ] **Step 1: Add isolation test in `test_routes_documents.py`**

```python
def test_user_cannot_see_other_users_docs(db_pool):
    from app.main import build_app
    from app.auth import current_user_id
    from unittest.mock import MagicMock, AsyncMock
    from app.routes import documents as docs_mod
    from pathlib import Path
    PDF = Path(__file__).parent / "fixtures" / "sample.pdf"
    app = build_app()
    docs_mod._embedder = MagicMock(embed_documents=lambda t: [[0.1]*4 for _ in t])
    docs_mod._vector_store = MagicMock()
    docs_mod._rate_limiter = type("L", (), {"check_and_increment": AsyncMock(return_value=True)})()

    async def alice():
        return "user_alice"
    async def bob():
        return "user_bob"

    app.dependency_overrides[current_user_id] = alice
    from fastapi.testclient import TestClient
    c = TestClient(app)
    c.post("/docs", files={"file": ("a.pdf", PDF.read_bytes(), "application/pdf")})

    app.dependency_overrides[current_user_id] = bob
    c2 = TestClient(app)
    r = c2.get("/docs")
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 2: Run tests; commit**

```bash
uv run pytest tests/ -v
git add backend/tests/test_routes_documents.py
git commit -m "test(backend): assert tenant isolation across users"
```

---

## Task 30: Deploy backend to Render

**Files:**
- Create: `backend/render.yaml`
- Create: `backend/Dockerfile`

- [ ] **Step 1: `backend/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 build-essential curl && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock* /app/
RUN uv sync --frozen --no-dev
COPY app /app/app
COPY migrations /app/migrations
ENV PORT=8000
CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: `backend/render.yaml`**

```yaml
services:
  - type: web
    name: parsewithai-backend
    env: docker
    plan: free
    rootDir: backend
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: GEMINI_API_KEY
        sync: false
      - key: CLERK_JWKS_URL
        sync: false
      - key: CLERK_ISSUER
        sync: false
      - key: PINECONE_API_KEY
        sync: false
      - key: PINECONE_INDEX
        sync: false
      - key: PINECONE_CLOUD
        value: aws
      - key: PINECONE_REGION
        value: us-east-1
      - key: SUPABASE_DB_URL
        sync: false
      - key: UPSTASH_REDIS_REST_URL
        sync: false
      - key: UPSTASH_REDIS_REST_TOKEN
        sync: false
      - key: ALLOWED_ORIGINS
        sync: false
```

- [ ] **Step 3: Deploy**

1. Push branch to GitHub.
2. Render dashboard → New → Blueprint → point at the repo. Pick `backend/render.yaml`.
3. Fill secrets. Trigger deploy.
4. Once green, hit `https://<service>.onrender.com/health` → expect `{"status":"ok"}`.

- [ ] **Step 4: Commit deploy files**

```bash
git add backend/Dockerfile backend/render.yaml
git commit -m "chore(backend): add Render Dockerfile and blueprint"
```

---

## Task 31: Deploy frontend to Vercel

- [ ] **Step 1: Push to GitHub.**

- [ ] **Step 2: Vercel dashboard → New Project → import repo → set root directory to `frontend/`.**

- [ ] **Step 3: Set env vars in Vercel:**

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_API_BASE_URL=https://<your-render-service>.onrender.com
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

- [ ] **Step 4: Update backend `ALLOWED_ORIGINS` on Render to include the Vercel URL. Re-deploy.**

- [ ] **Step 5: Smoke test the live URL.**

---

## Task 32: End-to-end manual checklist

Run through this against the deployed app. All boxes must be checked before declaring v1 shipped.

- [ ] Sign up with Google. Land on `/dashboard`.
- [ ] Upload `tests/fixtures/sample.pdf`. See "Uploading and indexing...". Redirect to `/chat/<id>`.
- [ ] Ask "What is on page 3?" → tokens stream in. Sources show `[p. 3]`.
- [ ] Refresh `/dashboard`. Doc still listed.
- [ ] Upload a 2nd doc. Open its chat. Confirm answers reference only the 2nd doc.
- [ ] Open browser private window. Sign up as second user. Confirm dashboard is empty.
- [ ] As second user, try `GET /docs/<first-user-doc-id>` (via DevTools fetch). 404.
- [ ] Spam upload past `DAILY_UPLOAD_LIMIT` → 429 returned.
- [ ] Spam chat past `DAILY_CHAT_LIMIT` → 429 returned.
- [ ] Upload non-PDF → 400.
- [ ] Upload >10MB → 413.
- [ ] Upload password-protected PDF → 400.

If all pass, tag a release: `git tag -a v0.1.0 -m "MVP shipped" && git push --tags`.

---

## What's parked for phase 2

- Multi-doc chat / cross-document search.
- OCR for scanned PDFs.
- Raw PDF storage (Supabase Storage) and re-download.
- Shareable read-only chat links.
- Conversation memory across questions.
- Admin dashboard for quota usage.
- Switch to LangGraph for agentic flows.
