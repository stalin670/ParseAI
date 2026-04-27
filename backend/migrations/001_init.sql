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
