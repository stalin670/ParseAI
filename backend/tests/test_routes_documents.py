from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

PDF = Path(__file__).parent / "fixtures" / "sample.pdf"


@pytest.fixture
def client_with_overrides(db_pool):
    from app.auth import current_user_persisted
    from app.main import build_app
    from app.routes import documents as docs_mod

    app = build_app()

    async def fake_user():
        return "user_routes"

    app.dependency_overrides[current_user_persisted] = fake_user

    embedder = MagicMock()
    embedder.embed_documents.side_effect = lambda texts: [[0.1] * 4 for _ in texts]
    vector_store = MagicMock()
    rl = MagicMock()
    rl.check_and_increment = AsyncMock(return_value=True)

    docs_mod._embedder = embedder
    docs_mod._vector_store = vector_store
    docs_mod._rate_limiter = rl

    return TestClient(app), embedder, vector_store, rl


def test_upload_returns_doc_metadata(client_with_overrides):
    client, _, vs, _ = client_with_overrides
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
    client.post(
        "/docs", files={"file": ("a.pdf", PDF.read_bytes(), "application/pdf")}
    )
    client.post(
        "/docs", files={"file": ("b.pdf", PDF.read_bytes(), "application/pdf")}
    )
    r = client.get("/docs")
    assert r.status_code == 200
    items = r.json()
    names = {d["filename"] for d in items}
    assert {"a.pdf", "b.pdf"}.issubset(names)


def test_delete_removes_doc(client_with_overrides):
    client, _, vs, _ = client_with_overrides
    up = client.post(
        "/docs", files={"file": ("c.pdf", PDF.read_bytes(), "application/pdf")}
    )
    doc_id = up.json()["doc_id"]
    r = client.delete(f"/docs/{doc_id}")
    assert r.status_code == 204
    assert vs.delete_doc.called


def test_reject_non_pdf(client_with_overrides):
    client, *_ = client_with_overrides
    r = client.post("/docs", files={"file": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 400


def test_upload_429_when_rate_limited(client_with_overrides):
    client, _, _, rl = client_with_overrides
    rl.check_and_increment = AsyncMock(return_value=False)
    r = client.post(
        "/docs",
        files={"file": ("a.pdf", PDF.read_bytes(), "application/pdf")},
    )
    assert r.status_code == 429
    assert "Retry-After" in r.headers
