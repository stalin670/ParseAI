# ParseWithAI — Backend Deep Dive

A complete, code-level reference for the backend service. Covers every file, every function, the request lifecycle, external integrations, data models, error paths, and the reasoning behind each design choice.

---

## 1. High-Level Architecture

ParseWithAI is a Retrieval-Augmented Generation (RAG) service built on FastAPI. A user uploads a PDF, the backend parses it, splits it into chunks, embeds the chunks, stores embeddings in Pinecone, and stores metadata + chat history in Postgres. When the user asks a question, the backend embeds the query, retrieves the top-k most similar chunks, builds a grounded prompt, and streams the LLM answer back via Server-Sent Events (SSE).

```
┌──────────┐   JWT    ┌─────────────────────────────┐
│ Frontend │ ───────► │  FastAPI (app/main.py)      │
└──────────┘   SSE    │  ├─ /health                 │
                ◄──── │  ├─ /docs/* (documents)     │
                      │  └─ /chat/{doc_id}          │
                      └────────────┬────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
   Clerk JWKS               Postgres (Supabase)        Pinecone (vectors,
   (JWT verify)             users / documents / chats   namespaced per user)
                                   │
                                   ▼
                         Upstash Redis (REST)
                         (per-user rate limits +
                          global Gemini quota)
                                   │
                                   ▼
                         Google Gemini API
                         (embeddings + chat stream)
```

Key properties:
- **Stateless app**: every external system holds the durable state (Postgres, Pinecone, Redis); the FastAPI process holds only pooled connections and lazy singletons.
- **Tenant isolation**: each user's vectors live in a Pinecone namespace keyed by their Clerk user id; Postgres rows are filtered by `clerk_user_id` in every query.
- **Two layers of rate control**: per-user daily counters (uploads, chats) and a global daily soft cap on Gemini calls so a single bad actor cannot drain the project quota.
- **Streaming end-to-end**: chat tokens flow Gemini → server → browser via SSE, with chat persistence wrapped in a `try/finally` so even a disconnected client still records what was generated.

---

## 2. Directory Layout

```
backend/
├── Dockerfile
├── pyproject.toml          # uv-managed deps, ruff/mypy/pytest config
├── uv.lock
├── migrations/
│   └── 001_init.sql        # schema for users, documents, chats
├── tests/                  # pytest suite (one file per module)
└── app/
    ├── __init__.py
    ├── main.py             # FastAPI factory, CORS, router wiring
    ├── config.py           # pydantic-settings, env-driven config
    ├── auth.py             # Clerk JWT verification + lazy user persist
    ├── db.py               # asyncpg connection pool singleton
    ├── models.py           # pydantic request/response schemas
    ├── routes/
    │   ├── __init__.py
    │   ├── documents.py    # /docs upload, list, get, delete, chat history
    │   └── chat.py         # /chat/{doc_id} streaming SSE
    └── services/
        ├── __init__.py
        ├── pdf_parse.py    # pypdf extraction + langchain chunking
        ├── ingest.py       # orchestrates parse → embed → store
        ├── embeddings.py   # Gemini embeddings client (with retry)
        ├── vectorstore.py  # Pinecone wrapper (upsert, query, delete)
        ├── retrieve.py     # embed query → query vector store
        ├── llm.py          # prompt builder + streaming Gemini chat
        ├── ratelimit.py    # per-user counters in Upstash Redis
        ├── quota.py        # global Gemini soft-cap in Upstash Redis
        └── users.py        # ensure_user_exists upsert
```

---

## 3. Application Bootstrap

### 3.1 `app/main.py`

```python
def build_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="ParseWithAI API", docs_url=None, redoc_url=None)
    app.add_middleware(CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"])
    @app.get("/health")
    def health(): return {"status": "ok"}
    from app.routes.chat import router as chat_router
    from app.routes.documents import router as docs_router
    app.include_router(docs_router)
    app.include_router(chat_router)
    return app

app = build_app()
```

- `docs_url=None, redoc_url=None`: FastAPI's auto Swagger lives at `/docs` by default, which would collide with the documents router prefix `/docs`. Both auto pages are disabled to keep the URL space clean.
- CORS origins come from the `ALLOWED_ORIGINS` env var (comma-separated list).
- The routers are imported *inside* `build_app` so test code can monkey-patch route-module singletons before the app is constructed.
- `app = build_app()` at module scope is what `uvicorn app.main:app` resolves to. The `Dockerfile` `CMD` runs `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`.

### 3.2 `app/config.py` — `Settings`

A `pydantic_settings.BaseSettings` subclass loaded from `.env` (extras ignored). All knobs are typed, with sane defaults for limits and chunking.

| Field | Purpose |
|---|---|
| `gemini_api_key` | Auth for Gemini embeddings + chat |
| `clerk_jwks_url` | Where to fetch RS256 public keys for JWT verification |
| `clerk_issuer` | Required `iss` claim on JWTs |
| `pinecone_api_key` / `pinecone_index` / `pinecone_cloud` / `pinecone_region` | Vector DB config |
| `supabase_db_url` | Postgres DSN; `postgresql+asyncpg://` is rewritten to `postgresql://` for asyncpg |
| `upstash_redis_rest_url` / `upstash_redis_rest_token` | REST auth for rate limit + quota |
| `allowed_origins` | CORS list, comma-string parsed into `list[str]` via a `field_validator` |
| `daily_upload_limit = 10` | Per-user uploads per day |
| `daily_chat_limit = 50` | Per-user chat questions per day |
| `gemini_daily_global_limit = 1200` | Global Gemini call ceiling; soft cap enforced at 90% |
| `max_pdf_mb = 10` | Hard upload size limit |
| `max_pdf_pages = 100` | Post-parse page-count cap |
| `chunk_size = 1000`, `chunk_overlap = 200` | Splitter config (chars) |
| `top_k = 4` | Retrieval count for chat |

`get_settings()` is wrapped in `@lru_cache`, so the whole app shares one immutable `Settings` instance and tests can swap env then call `get_settings.cache_clear()` if needed.

`split_origins` is a `mode="before"` validator: it converts the comma-string env value into a list before pydantic checks the type. Without it, pydantic would try to JSON-decode the value (because `list[str]` is annotated `NoDecode`-bypassed) and fail.

---

## 4. Authentication — `app/auth.py`

Clerk issues short-lived RS256 JWTs to the frontend. The backend validates them on every request.

```python
_jwks_cache: dict[str, Any] = {}

async def _fetch_jwks() -> dict[str, Any]:
    if "keys" in _jwks_cache:
        return _jwks_cache
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(settings.clerk_jwks_url)
    r.raise_for_status()
    _jwks_cache.update(r.json())
    return _jwks_cache
```

- **JWKS caching** is process-local. The keys rotate rarely; the cache is populated on the first request and reused for the lifetime of the worker. There is no TTL — a Clerk key rotation would require a process restart.
- `_bearer_token` rejects anything missing the `Authorization: Bearer <token>` header with `401`.
- `current_user_id`:
  1. Pull token.
  2. Read the unverified header to extract `kid`.
  3. Find the matching JWK in the cache; if none, `401 Unknown signing key`.
  4. `jwt.decode(token, key, algorithms=["RS256"], issuer=settings.clerk_issuer, options={"verify_aud": False})`. Audience check is disabled because Clerk's default audience handling depends on per-app config; the issuer check is the strong guarantee.
  5. Return the `sub` claim (the Clerk user id, e.g. `user_2x...`).
- `current_user_persisted` chains `current_user_id` with `ensure_user_exists(uid)`. **Every route that touches the database depends on this**, not on `current_user_id` directly, so the `users` row is guaranteed before any FK insert.

---

## 5. Database Layer

### 5.1 `app/db.py` — Connection Pool

```python
_pool: asyncpg.Pool | None = None

async def create_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(dsn=_dsn(), min_size=1, max_size=5)
    return _pool

async def get_pool() -> asyncpg.Pool: ...
async def close_pool() -> None: ...
```

- One process-wide `asyncpg` pool with 1–5 connections. Sized small because each request is short-lived and the bottleneck is upstream APIs, not Postgres.
- `_dsn()` strips the `postgresql+asyncpg://` SQLAlchemy-style prefix Supabase often emits, leaving a plain `postgresql://` DSN that asyncpg accepts.
- `close_pool()` is exposed for tests and graceful shutdown but isn't currently wired into a FastAPI lifespan handler — the worker process exits cleanly on its own.

### 5.2 `migrations/001_init.sql` — Schema

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  clerk_user_id TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  page_count    INT  NOT NULL,
  chunk_count   INT  NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_documents_user_created ON documents (clerk_user_id, created_at DESC);

CREATE TABLE chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chats_doc_created ON chats (document_id, created_at);
```

Design notes:
- Clerk's `user_id` is the natural key for `users`; no surrogate id. Other tables FK to it.
- `ON DELETE CASCADE` everywhere: deleting a user wipes their documents, which wipes their chats. Deleting a document wipes its chats. The Pinecone side is cleaned up by the application code (`vector_store.delete_doc`) since Postgres can't reach it.
- Two indexes match the only two list-style queries: documents-by-user-newest-first, and chats-by-document-oldest-first.
- The `role` CHECK constraint is enforced at the DB layer so a buggy code path can't insert garbage roles.

### 5.3 `app/services/users.py`

```python
async def ensure_user_exists(clerk_user_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (clerk_user_id) VALUES ($1) "
            "ON CONFLICT (clerk_user_id) DO NOTHING",
            clerk_user_id,
        )
```

- Called by `current_user_persisted` (auth dependency) and by `ingest_pdf` (defensive — keeps the function self-contained for tests). Idempotent by design.

---

## 6. Pydantic Schemas — `app/models.py`

```python
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

class ChatRequest(BaseModel):
    question: str
```

- UUIDs and timestamps are returned as strings (`id::text`, `.isoformat()`) so the JSON shape is stable and easy for frontends to consume.
- `ChatRequest` is intentionally minimal — only `question`. The conversation context is implicit: a chat call is scoped to one document via the URL path, and history is stored server-side.

---

## 7. Routes

### 7.1 Documents — `app/routes/documents.py`

Mounted at `/docs`. Lazy module-level singletons for `Embedder`, `VectorStore`, `RateLimiter` keep external clients out of import-time hot paths and let tests substitute mocks by reassigning the module attributes.

```python
_embedder: Embedder | None = None
_vector_store: VectorStore | None = None
_rate_limiter: RateLimiter | None = None
def _get_embedder()/_get_vector_store()/_get_rate_limiter(): ...
```

#### `POST /docs` — Upload

```python
@router.post("", response_model=UploadResult, status_code=201)
async def upload(file: UploadFile = File(...),
                 user_id: str = Depends(current_user_persisted)): ...
```

Pipeline:
1. **Rate limit**: `RateLimiter.check_and_increment(key=f"upload:{user_id}", limit=10, window_seconds=86400)`. Returns `429 Daily upload limit reached` with `Retry-After: 86400` if exceeded.
2. **Content type check**: only `application/pdf` allowed → `400`.
3. **Size check**: `await file.read()`, then `len(data) > max_pdf_mb*1024*1024` → `413`.
4. **Ingest**: `ingest_pdf(...)`. Wraps `ValueError` (raised by `parse_pdf` for empty or encrypted PDFs) into `400`.
5. **Page-count rollback**: if `result.page_count > max_pdf_pages`, the document was already inserted and embeddings already pushed to Pinecone (cap is checked post-hoc to avoid double parsing). The route deletes the row and calls `vector_store.delete_doc` to clean up before returning `400`.
6. Return `UploadResult`.

> **Note**: the rollback path on a too-large PDF is the most subtle interaction in the codebase. The transaction in `ingest_pdf` has already committed by this point — the cleanup is two separate operations, and a crash between them could leave Pinecone vectors orphaned. The blast radius is small because the doc row is gone, so the orphaned vectors are unreachable through any API path; they only consume Pinecone storage until the namespace is purged.

#### `GET /docs` — List

Single SQL query scoped by `clerk_user_id`, ordered by `created_at DESC`. Hits `idx_documents_user_created`.

#### `GET /docs/{doc_id}` — Detail

Combined ownership + fetch in one `SELECT ... WHERE id=$1::uuid AND clerk_user_id=$2`. Missing row → `404`.

#### `GET /docs/{doc_id}/chats` — History

Two-step in one connection:
1. `SELECT 1 FROM documents WHERE id=$1 AND clerk_user_id=$2` — ownership probe.
2. `SELECT role, content, created_at FROM chats WHERE document_id=$1 ORDER BY created_at ASC`.

The two queries share the same connection (acquired once) so an attacker cannot race ownership with a deletion to read a stranger's chat.

#### `DELETE /docs/{doc_id}` — Delete

```sql
DELETE FROM documents WHERE id=$1::uuid AND clerk_user_id=$2 RETURNING id::text
```

- The `RETURNING` makes the query idempotent + ownership-scoped: if the user doesn't own the doc, the row count is 0 and `fetchval` returns `None` → `404`.
- After SQL succeeds, `vector_store.delete_doc(user_id, doc_id)` purges the Pinecone vectors. Postgres cascades remove `chats`.
- Returns `204 No Content`.

### 7.2 Chat — `app/routes/chat.py`

Mounted at `/chat`. Same lazy-singleton pattern, plus a `GeminiQuotaGuard`.

#### `POST /chat/{doc_id}` — Streaming Q&A

```python
@router.post("/{doc_id}")
async def chat(doc_id: str, body: ChatRequest,
               user_id: str = Depends(current_user_persisted)):
```

Pipeline:
1. **Per-user rate limit** `chat:{user_id}` daily 50 → `429`.
2. **Global Gemini quota** `GeminiQuotaGuard.check_and_increment` → `503 Service paused, try tomorrow` if soft cap reached.
3. **Ownership check** of the document → `404`.
4. **Retrieve** top-k chunks via `retrieve_chunks(...)`.
5. **Build prompt** with `build_prompt(...)`.
6. Return `EventSourceResponse(event_stream())`.

The `event_stream` async generator:

```python
async def event_stream():
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO chats (document_id, role, content) "
            "VALUES ($1::uuid, 'user', $2)", doc_id, body.question)
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
                "INSERT INTO chats (document_id, role, content) "
                "VALUES ($1::uuid, 'assistant', $2)", doc_id, assistant_text)
        yield {"event": "sources", "data": json.dumps(sources)}
        yield {"event": "done", "data": ""}
```

Why the `try/finally`:
- Persists the user's message *before* streaming begins, so the question appears in history even if generation fails.
- Persists whatever assistant tokens were produced even if the client disconnects mid-stream (`stream_answer` raises `GeneratorExit`), with `[interrupted]` as a fallback if nothing was produced. The finally block runs in the same task; the `pool.acquire()` is short-lived and won't block the cancellation.
- Sources are emitted as a single JSON event after generation so the frontend can render `[p. N]` pills next to the answer.

SSE event types the client must handle: `token` (string deltas), `sources` (JSON array), `done` (sentinel). Everything else is plain HTTP and standard FastAPI error responses.

---

## 8. Services

### 8.1 PDF Parsing — `app/services/pdf_parse.py`

```python
class EmptyPDFError(ValueError): ...
class EncryptedPDFError(ValueError): ...

def parse_pdf(data: bytes) -> list[dict]:
    try: reader = PdfReader(BytesIO(data))
    except Exception as e: raise EmptyPDFError("Could not read PDF") from e
    if reader.is_encrypted:
        raise EncryptedPDFError("Password-protected PDF not supported")
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append({"page": i, "text": text})
    if not pages:
        raise EmptyPDFError("No extractable text in PDF")
    return pages
```

- 1-indexed page numbers because that's how humans cite pages — used directly in the `[p. N]` citations the LLM is instructed to produce.
- Pages with no extractable text are silently skipped (image-only scans). If *every* page is empty, the whole upload is rejected.
- Both error subclasses inherit from `ValueError` so the route can catch one type and return a `400`.

```python
def chunk_pages(pages, *, chunk_size, overlap) -> list[dict]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size, chunk_overlap=overlap,
        separators=["\n\n","\n",". "," ",""])
    out = []
    for p in pages:
        for piece in splitter.split_text(p["text"]):
            out.append({"page": p["page"], "text": piece})
    return out
```

- Splits **per page**, not across pages. This guarantees every chunk has a single deterministic page number for citation. The trade-off: a sentence that straddles a page boundary may be cut in two, but page-grounded citations are more important than perfect semantic boundaries for this use case.
- Separators in priority order: paragraph, line, sentence, word, character. The splitter will use the highest-priority one that yields chunks under `chunk_size`.

### 8.2 Ingest Orchestrator — `app/services/ingest.py`

```python
async def ingest_pdf(*, user_id, filename, data, embedder, vector_store) -> IngestResult:
    pages = parse_pdf(data)
    chunks = chunk_pages(pages, chunk_size=settings.chunk_size,
                                  overlap=settings.chunk_overlap)
    await ensure_user_exists(user_id)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "INSERT INTO documents (clerk_user_id, filename, page_count, chunk_count) "
            "VALUES ($1, $2, $3, $4) RETURNING id::text",
            user_id, filename, len(pages), len(chunks))
        doc_id = row["id"]
        vectors = embedder.embed_documents([c["text"] for c in chunks])
        vector_store.upsert(user_id=user_id, doc_id=doc_id,
                            vectors=vectors,
                            chunks=[c["text"] for c in chunks],
                            pages=[c["page"] for c in chunks])
    return IngestResult(doc_id, len(pages), len(chunks))
```

The transaction wraps the SQL insert *and* the external embed + upsert calls. Reasoning:
- If embedding fails, the SQL insert is rolled back so there's no orphan `documents` row.
- If the Pinecone upsert fails, same rollback. Pinecone has no Postgres-style transaction, so a partial upsert can leak vectors — but they share the doc_id, which is uncommitted, so they're unreachable from any API path until purged.
- The transaction holds a connection during a slow embedding call. With `max_size=5`, that's a real concurrency limit. It's accepted because uploads are user-rate-limited to 10/day.

`embedder` and `vector_store` are injected so tests can pass fakes without touching network.

### 8.3 Embeddings — `app/services/embeddings.py`

```python
class Embedder:
    def __init__(self):
        self._client = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=settings.gemini_api_key)
    @retry(stop=stop_after_attempt(3),
           wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
           reraise=True)
    def embed_documents(self, texts): return self._client.embed_documents(texts)
    @retry(...)
    def embed_query(self, text): return self._client.embed_query(text)
```

- Single retry policy for both methods. Tenacity reraises the original exception after 3 failed attempts (back-off 0.5s → 1s → 2s, capped at 4s).
- Both methods are sync; LangChain handles the underlying HTTP. They run inside async route handlers, so a slow Gemini call blocks the event loop unless wrapped in `run_in_executor`. In practice the calls are fast enough on small chunk counts (≤ a few hundred per upload) that this isn't a bottleneck, but it's a known trade-off.

### 8.4 Vector Store — `app/services/vectorstore.py`

```python
class VectorStore:
    def __init__(self):
        self._pc = Pinecone(api_key=settings.pinecone_api_key)
        self._index = self._pc.Index(settings.pinecone_index)

    def upsert(self, *, user_id, doc_id, vectors, chunks, pages):
        items = [{
            "id": f"{doc_id}#{i}",
            "values": v,
            "metadata": {"chunk_text": chunks[i], "page": pages[i], "doc_id": doc_id},
        } for i, v in enumerate(vectors)]
        self._index.upsert(vectors=items, namespace=user_id)

    def query(self, *, user_id, doc_id, vector, top_k):
        res = self._index.query(vector=vector, top_k=top_k, namespace=user_id,
                                filter={"doc_id": doc_id}, include_metadata=True)
        return [{"chunk_text": md.get("chunk_text",""),
                 "page": int(md.get("page",0)),
                 "score": m.get("score",0.0)}
                for m in res.get("matches",[])
                for md in [m.get("metadata",{}) or {}]]

    def delete_doc(self, *, user_id, doc_id):
        self._index.delete(filter={"doc_id": doc_id}, namespace=user_id)
```

Three layers of scoping for safety:
1. **Namespace = user_id**. Even with a bug in the filter, queries from one user can never reach another user's vectors.
2. **Metadata filter `doc_id`**. Restricts retrieval to the target document.
3. **Vector id `{doc_id}#{i}`**. Lets you point-update a specific chunk if needed.

`chunk_text` is stored *inside Pinecone metadata* rather than in Postgres. That means a single Pinecone round-trip returns everything needed to build the prompt — no second SQL fetch. The cost: chunk text is duplicated in Pinecone, but it's bounded by `max_pdf_pages * chunk_size` per document.

### 8.5 Retrieval — `app/services/retrieve.py`

```python
def retrieve_chunks(*, user_id, doc_id, question, top_k, embedder, vector_store):
    vector = embedder.embed_query(question)
    return vector_store.query(user_id=user_id, doc_id=doc_id,
                              vector=vector, top_k=top_k)
```

Trivially thin wrapper. The reason it exists as a separate module is testability — the chat route can import a single function and stub `embedder` + `vector_store`.

### 8.6 LLM — `app/services/llm.py`

```python
SYSTEM_INSTRUCTIONS = (
  "You answer questions using only this context from a PDF. "
  "If the answer is not in the context, say you cannot find it. "
  "Cite page numbers as whole integers like [p. 3] (never [p. 3.0] or decimals). "
  "Use Markdown for formatting (bold, lists, code blocks).")

def build_prompt(*, question, chunks):
    parts = [SYSTEM_INSTRUCTIONS, "", "Context:"]
    for c in chunks:
        parts.append(f"[page {c['page']}] {c['chunk_text']}")
    parts.extend(["", f"Question: {question}", "Answer:"])
    return "\n".join(parts)

def stream_answer(prompt: str) -> Iterator[str]:
    chat = ChatGoogleGenerativeAI(model="gemini-2.5-flash",
                                  google_api_key=settings.gemini_api_key,
                                  temperature=0.2)
    for chunk in chat.stream(prompt):
        text = getattr(chunk, "content", "") or ""
        if text:
            yield text
```

- Single-turn prompt — no chat history is fed back into the LLM. The user-visible chat history is for the user's benefit, not for context-stacking. This keeps the prompt size bounded and the answers strictly grounded in retrieved chunks.
- Hard instruction about citation format: `[p. 3]` not `[p. 3.0]`. Pages are stored as ints in Pinecone metadata, but the LLM has historically rendered them as floats; the explicit instruction defends against that.
- `temperature=0.2` for deterministic-ish, factual answers.
- `stream` yields incremental chunks. Empty content is filtered so the SSE stream doesn't emit no-op events.

### 8.7 Per-User Rate Limit — `app/services/ratelimit.py`

```python
class RateLimiter:
    async def check_and_increment(self, *, key, limit, window_seconds) -> bool:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(f"{self._url}/pipeline",
                headers={"Authorization": f"Bearer {self._token}"},
                json=[["INCR", key], ["EXPIRE", key, window_seconds]])
        r.raise_for_status()
        count = int(r.json()[0]["result"])
        return count <= limit
```

Implementation details:
- Uses Upstash's REST `/pipeline` endpoint to run `INCR` + `EXPIRE` in one round trip. Unlike `INCR | EXPIRE` over native Redis, the pipeline call returns each command's result in order; `results[0]` is the count.
- `EXPIRE` is set on every increment. Redis's `EXPIRE` resets the TTL each call, which means a key that's been hit recently will keep its window. This matches the intuitive model: "10 uploads per rolling-but-reset day". For exact rolling windows you'd use a sorted set; here the looseness is acceptable.
- Returns `True` while still under or equal to the limit, `False` once exceeded. The route maps `False` → `429`.

### 8.8 Global Gemini Quota — `app/services/quota.py`

```python
class GeminiQuotaGuard:
    def _key(self): return f"gemini-global:{datetime.date.today().isoformat()}"
    async def check_and_increment(self) -> bool:
        soft_cap = int(self._limit * 0.9)
        # same INCR + EXPIRE 86400 pipeline...
        return count <= soft_cap
```

- Key resets daily by including the date in the name. No need for nightly cleanup.
- Soft cap = 90% of `gemini_daily_global_limit`. This leaves a 10% buffer for any in-flight requests after the cap so the underlying Gemini quota itself never errors. The route returns `503` (not `429`) because the issue is service-side, not user-side.

---

## 9. Request Lifecycles

### 9.1 Upload (`POST /docs`)

```
Client ─► FastAPI
  Authorization: Bearer <Clerk JWT>
  multipart/form-data: file=<pdf>

  1. CORS preflight (if cross-origin)
  2. Depends(current_user_persisted)
       ├─ _bearer_token: parse "Bearer ..."
       ├─ _fetch_jwks: HTTP GET Clerk JWKS (cached after first call)
       ├─ jwt.decode RS256, verify iss
       └─ ensure_user_exists: INSERT ... ON CONFLICT DO NOTHING
  3. RateLimiter.check_and_increment("upload:<uid>", 10, 86400)
       ├─ POST Upstash /pipeline [INCR, EXPIRE]
       └─ if count > 10  → 429 Retry-After: 86400
  4. Validate content_type == application/pdf  → 400 if not
  5. file.read(); if size > 10MB                → 413
  6. ingest_pdf:
       a. parse_pdf  → pages [{page,text}]
       b. chunk_pages → chunks [{page,text}]
       c. ensure_user_exists (defensive)
       d. BEGIN TX
            INSERT INTO documents ... RETURNING id::text
            embedder.embed_documents(texts)  → list[list[float]]
            vector_store.upsert (Pinecone)
          COMMIT
  7. if page_count > 100:
       ├─ DELETE FROM documents WHERE id=...
       ├─ vector_store.delete_doc(user_id, doc_id)
       └─ 400 Max 100 pages
  8. 201 { doc_id, filename, page_count, chunk_count }
```

### 9.2 Chat (`POST /chat/{doc_id}`)

```
Client ─► FastAPI  (EventSource / fetch-then-stream)
  Authorization: Bearer <Clerk JWT>
  body: {"question": "..."}

  1. Depends(current_user_persisted)
  2. RateLimiter chat:<uid> daily 50  → 429 if exceeded
  3. GeminiQuotaGuard global 1200 (soft 90%) → 503 if exceeded
  4. Ownership probe: SELECT 1 FROM documents WHERE id=$1 AND user=$2 → 404 if none
  5. retrieve_chunks:
       ├─ embedder.embed_query(question)
       └─ vector_store.query(namespace=uid, filter doc_id, top_k=4)
  6. build_prompt(question, chunks)
  7. EventSourceResponse:
       a. INSERT chats (role='user', content=question)
       b. for token in stream_answer(prompt):
            yield event:token data:<delta>
       c. finally:
            INSERT chats (role='assistant', content=joined or "[interrupted]")
            yield event:sources data:<JSON [{page, score}, ...]>
            yield event:done   data:""
```

### 9.3 List / Get / Delete

```
GET  /docs           → SELECT scoped by user, ordered DESC
GET  /docs/{id}      → SELECT scoped by user + id, 404 if none
GET  /docs/{id}/chats→ ownership probe + chat SELECT in same conn
DELETE /docs/{id}    → DELETE ... RETURNING id; if none → 404
                     → vector_store.delete_doc(user, id)
                     → 204
```

---

## 10. Error Surface

| HTTP | Where | Trigger |
|---|---|---|
| 400 | upload | non-PDF content type, parse failed (`ValueError`), too many pages |
| 401 | auth | missing / malformed / unverifiable JWT, missing `sub` |
| 404 | docs/chat | doc not found or not owned |
| 413 | upload | PDF over `max_pdf_mb` |
| 429 | upload, chat | per-user daily limit exceeded |
| 503 | chat | global Gemini soft cap reached |

All non-2xx responses use FastAPI's default JSON shape `{"detail": "..."}`.

---

## 11. External Service Contracts

### Clerk (JWT)
- Public RS256 keys at `clerk_jwks_url`. Cached forever in-process.
- Required claims: `sub` (user id), `iss` matching `clerk_issuer`. Audience deliberately not verified.

### Postgres (Supabase)
- Schema in `migrations/001_init.sql`. asyncpg pool, 1–5 connections.
- All user-data queries filter on `clerk_user_id` — there is no SELECT-without-filter anywhere in the codebase.

### Pinecone
- One index, dimensions implied by `gemini-embedding-001` (3072 by default; the index must match).
- Per-user namespace, per-doc metadata filter.
- No transaction support — partial failures during ingest leave orphan vectors that are unreachable but not auto-cleaned.

### Upstash Redis (REST)
- Two key patterns: `upload:{uid}`, `chat:{uid}`, and `gemini-global:{YYYY-MM-DD}`.
- All counters use `INCR + EXPIRE 86400` pipelined. TTL is reset on every hit.

### Gemini
- Embeddings: `models/gemini-embedding-001` via `langchain-google-genai`.
- Chat: `gemini-2.5-flash` with `temperature=0.2`, streaming.
- Both go through tenacity-retried calls (embeddings) or LangChain's stream (chat, no retry — disconnects are caught by SSE finally).

---

## 12. Testing — `backend/tests/`

`pyproject.toml` enables `asyncio_mode = "auto"` so any `async def test_*` runs automatically.

| File | Covers |
|---|---|
| `conftest.py` | Shared fixtures (FastAPI test client, monkeypatched settings, fakes for Embedder / VectorStore / RateLimiter / pool) |
| `test_health.py` | `GET /health` returns `{"status": "ok"}` |
| `test_config.py` | env parsing, `split_origins` validator, default values |
| `test_auth.py` | bearer parsing, JWKS fetch, RS256 decode happy path + failures |
| `test_db.py` | pool creation, DSN rewrite |
| `test_users.py` | `ensure_user_exists` upsert idempotency |
| `test_pdf_parse.py` | pypdf parsing, encrypted detection, empty-PDF rejection, chunking boundaries |
| `test_embeddings.py` | retry behavior, client construction |
| `test_vectorstore.py` | upsert payload shape, query metadata mapping, delete by filter |
| `test_retrieve.py` | embed_query → query plumbing |
| `test_llm.py` | prompt assembly, stream chunk filtering |
| `test_ingest.py` | full ingest flow with fakes; transaction rollback on failure |
| `test_ratelimit.py` | counter increments, window reset behavior, return value |
| `test_quota.py` | soft-cap math, daily key naming |
| `test_routes_documents.py` | upload happy path, 400/413/429 paths, list/get/delete |
| `test_routes_chat.py` | SSE event sequence, persistence in finally, 404 on non-owned doc |

Fixture asset: `tests/fixtures/sample.pdf` (built with reportlab in dev).

---

## 13. Local Dev & Deploy

### Dev
```
cd backend
uv sync
uv run uvicorn app.main:app --reload
```
Requires a `.env` with all `Settings` fields populated.

### Tests
```
uv run pytest
uv run ruff check .
uv run mypy app
```

### Docker
```
# from backend/
docker build -t parsewithai-backend .
docker run --rm -p 8000:8000 --env-file .env parsewithai-backend
```

The Dockerfile uses the `uv` two-stage trick: first `uv sync --frozen --no-dev --no-install-project` against just `pyproject.toml + uv.lock` to populate the venv (cached layer), then a second `uv sync` after copying the source. This keeps deps cache-hot on iterative source changes. Image is `python:3.12-slim` plus `libmagic1` and `ca-certificates` only.

`CMD` runs `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`. PORT-from-env makes it work on Cloud Run / Render / Fly without changes.

---

## 14. Design Rationale Summary

| Decision | Why |
|---|---|
| Stateless app, externalized state | Easy horizontal scaling, no in-process caches that drift |
| Lazy module-level singletons (Embedder/VectorStore/RateLimiter) | Avoid import-time network; trivially mockable in tests |
| Pinecone namespace per user + metadata filter per doc | Two layers of tenant isolation; one bug doesn't cross users |
| Chunk text stored in Pinecone metadata | Single round-trip retrieval; no second SQL hit during chat |
| Page-scoped chunking | Deterministic citation pages; tradeoff is sentence-cut at boundaries |
| `try/finally` around chat stream | Guarantees chat history persists even on disconnect |
| Two-tier rate limits (per-user + global soft cap) | Protects fairness *and* the project-wide Gemini quota |
| Postgres CASCADE + explicit Pinecone delete | DB cleans relational data; app code cleans vectors (no FK to Pinecone) |
| `current_user_persisted` chained dependency | Lazy-creates `users` row before any FK insert; makes write paths safe by construction |
| `lru_cache`'d `get_settings()` | One immutable Settings instance; deterministic across the process |
| Ingest transaction wraps embed + upsert | Rolls back the doc row if external calls fail; orphan vectors are unreachable |

---

## 15. Quick Reference: Call Graph

```
main.app
 ├─ /health
 ├─ routes/documents
 │   ├─ POST /docs (upload)
 │   │    ├─ auth.current_user_persisted ─► users.ensure_user_exists ─► db.get_pool
 │   │    ├─ ratelimit.RateLimiter ─► Upstash
 │   │    └─ ingest.ingest_pdf
 │   │        ├─ pdf_parse.parse_pdf
 │   │        ├─ pdf_parse.chunk_pages
 │   │        ├─ db.get_pool (INSERT documents)  ─┐
 │   │        ├─ embeddings.Embedder ─► Gemini    │ (single TX)
 │   │        └─ vectorstore.VectorStore ─► Pinecone ─┘
 │   ├─ GET /docs              ─► db SELECT
 │   ├─ GET /docs/{id}         ─► db SELECT
 │   ├─ GET /docs/{id}/chats   ─► db SELECT (own + chats)
 │   └─ DELETE /docs/{id}      ─► db DELETE + vectorstore.delete_doc
 └─ routes/chat
     └─ POST /chat/{doc_id}
         ├─ auth.current_user_persisted
         ├─ ratelimit + quota.GeminiQuotaGuard ─► Upstash
         ├─ db (own check + INSERT chats user/assistant)
         ├─ retrieve.retrieve_chunks
         │    ├─ Embedder.embed_query   ─► Gemini
         │    └─ VectorStore.query      ─► Pinecone
         ├─ llm.build_prompt
         └─ llm.stream_answer (Gemini stream) ─► sse_starlette EventSourceResponse
              events: token... → sources → done
```
