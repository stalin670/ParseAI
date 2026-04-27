# ParseWithAI

Chat with your PDFs. RAG app on free-tier services.

## Stack
Next.js + FastAPI + LangChain + Gemini + Pinecone + Supabase + Clerk + Upstash.

## Quickstart

### Prereqs
- Python 3.11
- Node 20+
- Accounts on: Clerk, Pinecone, Supabase, Upstash, Google AI Studio (Gemini)

### Setup
1. Copy `.env.example` to `backend/.env` and `frontend/.env.local`. Fill values.
2. Run the migration in Supabase SQL editor: `backend/migrations/001_init.sql`.
3. Backend: `cd backend && uv sync && uv run uvicorn app.main:app --reload`
4. Frontend: `cd frontend && npm install && npm run dev`
5. Open `http://localhost:3000`.

See `docs/superpowers/specs/2026-04-27-parsewithai-design.md` for design and
`docs/superpowers/plans/2026-04-27-parsewithai-mvp.md` for the implementation plan.
