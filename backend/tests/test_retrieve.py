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
