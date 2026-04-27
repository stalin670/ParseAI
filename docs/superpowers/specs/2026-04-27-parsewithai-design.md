# ParseWithAI — Design Spec

**Date:** 2026-04-27
**Status:** Approved (brainstorm phase)
**Author:** Amit Yadav

## 1. Goal

Web-deployable, shareable RAG application: user uploads a PDF, asks questions, receives answers grounded in the document with source citations. First end-to-end RAG project, intended for portfolio/resume use.

### Success criteria

- Logged-in user can upload a PDF, see it in their dashboard, chat with it, and receive answers with page-level source citations.
- A second user cannot see, query, or list the first user's documents.
- All third-party services run on free tiers; total monthly cost = $0.
- Per-user daily rate limits prevent quota exhaustion of shared Gemini free tier.
- Frontend on Vercel, backend on Render — both reachable from the public internet, demoable to friends/recruiters.

### Non-goals (v1)

- Multi-doc chat (chat scoped to one document at a time).
- OCR for scanned/image PDFs.
- Password-protected PDFs.
- Mobile-native apps.
- Team/workspace sharing.
- Streaming history sync across devices.
- Raw PDF re-download (file is discarded after ingest).

## 2. Architecture

### 2.1 Repo layout

```
ParseWithAI/
├── frontend/          Next.js (App Router, TS, Tailwind, shadcn/ui)
├── backend/           FastAPI (Python 3.11+) + LangChain
├── docs/
│   └── superpowers/
│       └── specs/
├── .env.example
└── README.md
```

Two deployable units. Independent CI, independent deploy targets.

### 2.2 Cloud services (all free tier)

| Concern | Service | Free tier limit |
|---|---|---|
| Auth | Clerk | 10k MAU |
| Vector DB | Pinecone Serverless | 1 starter index, 2GB |
| Postgres (metadata + chat history) | Supabase | 500MB DB |
| LLM + Embeddings | Gemini (`gemini-1.5-flash`, `text-embedding-004`) | Free quota |
| Rate-limit store | Upstash Redis | 10k commands/day |
| Frontend host | Vercel | Hobby |
| Backend host | Render | Free Web Service (cold start ~30s) |

### 2.3 Process / network diagram

```
[Browser]
   │  Clerk session cookie + JWT
   ▼
[Vercel: Next.js]
   │  Authorization: Bearer <Clerk JWT>
   ▼
[Render: FastAPI]  ── Pinecone (vectors, namespace=clerk_user_id)
   │               ── Supabase Postgres (users / documents / chats)
   │               ── Upstash Redis (rate limit counters)
   ▼
[Gemini API]
```

Clerk handles auth on the frontend; the backend verifies the JWT on every request and derives `user_id` from it.

### 2.4 Storage decisions

- **No raw PDF storage in v1.** On upload: parse → chunk → embed → upsert to Pinecone with metadata → drop file. Saves Supabase Storage bytes and complexity. If "re-process" or "download" features are later requested, add Supabase Storage in a phase-2 spec.
- **Pinecone namespace = `clerk_user_id`.** Hard isolation: a query in user A's namespace cannot return user B's vectors. This is the primary tenancy boundary.

## 3. Components

### 3.1 Frontend (Next.js, App Router)

| Route | Purpose |
|---|---|
| `/` | Landing page, CTA to sign in |
| `/sign-in`, `/sign-up` | Clerk-hosted pages |
| `/dashboard` | List user's documents, upload entry point |
| `/chat/[docId]` | Chat UI for a single document |

Components: `<UploadDropzone>`, `<DocList>`, `<ChatWindow>`, `<MessageBubble>`, `<SourceCitation>`.

State: React hooks (local) + TanStack Query (server data). API helper attaches Clerk JWT to every request.

### 3.2 Backend (FastAPI)

```
backend/
├── main.py                 app, CORS, middleware, routers
├── auth.py                 Clerk JWT verify dependency
├── db.py                   Supabase / asyncpg client
├── models.py               Pydantic request/response schemas
├── routes/
│   ├── documents.py        POST /docs, GET /docs, DELETE /docs/{id}
│   └── chat.py             POST /chat/{docId} (SSE stream)
├── services/
│   ├── ingest.py           PDF → chunks → embed → Pinecone
│   ├── retrieve.py         query → embed → Pinecone search
│   ├── llm.py              prompt build + Gemini stream
│   └── ratelimit.py        Upstash check/increment
└── tests/
```

### 3.3 LangChain pieces used

- `PyPDFLoader` — PDF → page-level documents
- `RecursiveCharacterTextSplitter` — chunk size 1000, overlap 200
- `GoogleGenerativeAIEmbeddings` — `text-embedding-004`
- `PineconeVectorStore` — vector ops (custom namespace per user)
- `ChatGoogleGenerativeAI` — `gemini-1.5-flash`, streaming
- `create_retrieval_chain` — wires retriever → LLM (or hand-rolled equivalent if more control is needed)

### 3.4 Database schema (Supabase Postgres)

```sql
CREATE TABLE users (
  clerk_user_id   TEXT PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   TEXT NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  filename        TEXT NOT NULL,
  page_count      INT  NOT NULL,
  chunk_count     INT  NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON documents (clerk_user_id, created_at DESC);

CREATE TABLE chats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON chats (document_id, created_at);
```

Rate-limit counters live in Upstash Redis, not Postgres.

## 4. Data Flow

### 4.1 Upload flow

```
1. User drops PDF on /dashboard.
2. Frontend POST /docs (multipart, Authorization: Bearer <Clerk JWT>).
3. Backend:
   a. Verify Clerk JWT → user_id.
   b. Rate-limit check (Upstash: key=user_id:upload, limit=10/day).
   c. MIME-sniff with python-magic → reject if not PDF.
   d. PyPDFLoader → page-level Documents.
   e. RecursiveCharacterTextSplitter → chunks (1000 / 200).
   f. GoogleGenerativeAIEmbeddings.embed_documents(chunks).
   g. Pinecone upsert with metadata={user_id, doc_id, chunk_text, page};
      namespace = user_id.
   h. Supabase INSERT INTO documents.
   i. Return { doc_id, filename, page_count, chunk_count }.
4. Frontend redirect to /chat/{doc_id}.
```

### 4.2 Chat flow

```
1. User types question in /chat/[docId].
2. Frontend POST /chat/{docId} body { question }.
3. Backend:
   a. Verify Clerk JWT → user_id.
   b. Rate-limit check (Upstash: key=user_id:chat, limit=50/day).
   c. SELECT documents WHERE id=docId AND clerk_user_id=user_id;
      404 if not found (don't leak existence).
   d. Embed question with Gemini.
   e. Pinecone query: namespace=user_id, filter={doc_id}, top_k=4.
   f. Build prompt:
        "Answer using only this context. If unknown, say so.
         Context:
         {chunks}

         Question: {question}"
   g. ChatGoogleGenerativeAI.stream(...).
   h. Insert chat rows (user message + assistant message) to Supabase.
   i. SSE stream tokens to client.
4. Frontend renders stream, then shows source chunks (page numbers).
```

## 5. Error handling and edge cases

### 5.1 Upload

| Case | Response |
|---|---|
| Not PDF (MIME mismatch) | 400 "Only PDF allowed" |
| > 10MB | 413 "Max 10MB" |
| > 100 pages | 400 "Max 100 pages" |
| Encrypted/password PDF | 400 "Password-protected PDF not supported" |
| Empty extracted text (scanned) | 400 "No extractable text; OCR not supported in v1" |
| Embed API failure | 502 after 2 retries with exponential backoff |
| Pinecone upsert failure | Rollback Supabase row; 502 |
| Rate-limit hit | 429 with `Retry-After` header |

### 5.2 Chat

| Case | Response |
|---|---|
| `doc_id` not owned by user | 404 (not 403 — avoid leaking existence) |
| Pinecone returns 0 chunks | LLM still runs; answer "I cannot find this in the document." |
| Gemini API failure | 502; frontend shows retry button |
| Stream broken mid-answer | Save partial assistant message; frontend marks "[interrupted]" |
| Context exceeds token cap | Trim retrieved chunks to fit; log warning |

### 5.3 Auth

- Missing/invalid JWT → 401 → frontend redirects to `/sign-in`.
- No Clerk webhook in v1; user row is lazily created on first authed request.

### 5.4 Quota guard

- Backend tracks daily Gemini call count in Upstash. Within 90% of free quota → reject new chat requests with 503 "service paused, try tomorrow".

### 5.5 Validation

- Pydantic schemas on every endpoint.
- `python-magic` MIME sniff (not just file extension).
- Sanitize filename (strip path separators, limit length).

### 5.6 Limits (v1)

- Upload: 10MB, 100 pages, 10/day per user.
- Chat: 50/day per user.
- These are tunable in env config.

## 6. Testing

### 6.1 Backend (pytest)

| Layer | Coverage |
|---|---|
| Unit (pure) | Chunker output shape, prompt-builder format |
| Unit (mocked deps) | Ingest service end-to-end with mocked Gemini and Pinecone |
| Integration | FastAPI TestClient + real Postgres + mocked Pinecone |
| Contract | Pydantic schemas reject malformed input |

Targets: ~70% coverage on backend.

External APIs (Gemini, Pinecone) mocked with `respx` / `pytest-httpx` to avoid burning quota in CI.

Test DB: Postgres via `testcontainers-python` (spins up a disposable Postgres container per test session). SQLite is not used because the schema relies on `UUID`, `gen_random_uuid()`, and `TIMESTAMPTZ`. Pure unit tests that need no DB skip this.

### 6.2 Frontend (Vitest + React Testing Library)

- Components render correctly given props.
- Hooks (`useUpload`, `useChat`) handle loading, success, error states.
- Playwright E2E deferred until v1 is stable.

### 6.3 Manual pre-deploy checklist

- Upload a 5-page PDF → see it in dashboard.
- Ask a question → answer arrives with page-number citations.
- Upload a 2nd doc → chat in `/chat/[docId]` is scoped to that doc only.
- Sign out → cannot see documents list.
- Sign in as a second user → first user's docs are not visible (tenancy proof).
- Spam upload past limit → 429 returned.

### 6.4 CI

GitHub Actions on push:

- Backend: ruff + mypy + pytest.
- Frontend: eslint + tsc + vitest + next build.

## 7. Out of scope (parking lot for phase 2+)

- Multi-doc chat / cross-document search.
- OCR for scanned PDFs.
- Raw PDF storage and re-download (Supabase Storage).
- Shareable read-only chat links.
- Conversation memory across messages (currently each question is independent).
- Streaming sync across browser tabs.
- Admin dashboard for quota usage.
- Switch to LangGraph for multi-step agent flows.

## 8. Open questions

None at end of brainstorm. Add here if anything surfaces during planning.
