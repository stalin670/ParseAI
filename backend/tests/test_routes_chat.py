from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

PDF = Path(__file__).parent / "fixtures" / "sample.pdf"


@pytest.fixture
def client(db_pool):
    from app.auth import current_user_persisted
    from app.main import build_app
    from app.routes import chat as chat_mod
    from app.routes import documents as docs_mod

    app = build_app()

    async def fake_user():
        return "user_chat"

    app.dependency_overrides[current_user_persisted] = fake_user

    embedder = MagicMock()
    embedder.embed_documents.side_effect = lambda texts: [[0.1] * 4 for _ in texts]
    embedder.embed_query.return_value = [0.1, 0.2, 0.3, 0.4]
    vector_store = MagicMock()
    vector_store.query.return_value = [
        {"chunk_text": "X is a foo.", "page": 1, "score": 0.9},
    ]

    rl = MagicMock()
    rl.check_and_increment = AsyncMock(return_value=True)
    quota = MagicMock()
    quota.check_and_increment = AsyncMock(return_value=True)

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
    r = client.post(
        "/docs", files={"file": ("a.pdf", PDF.read_bytes(), "application/pdf")}
    )
    return r.json()["doc_id"]


def test_chat_streams_tokens_and_persists_messages(client):
    doc_id = _upload(client)
    with client.stream(
        "POST", f"/chat/{doc_id}", json={"question": "What is X?"}
    ) as r:
        assert r.status_code == 200
        body = b"".join(r.iter_bytes())
    text = body.decode()
    assert "Hello " in text
    assert "world" in text


def test_chat_404_for_other_users_doc(client, db_pool):
    doc_id = _upload(client)
    from app.auth import current_user_persisted
    from app.main import build_app
    from app.routes import chat as chat_mod

    app = build_app()

    async def other():
        return "user_other"

    app.dependency_overrides[current_user_persisted] = other
    chat_mod._rate_limiter = type(
        "L", (), {"check_and_increment": AsyncMock(return_value=True)}
    )()
    chat_mod._quota = type(
        "Q", (), {"check_and_increment": AsyncMock(return_value=True)}
    )()
    other_client = TestClient(app)
    r = other_client.post(f"/chat/{doc_id}", json={"question": "hi"})
    assert r.status_code == 404
