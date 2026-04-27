from unittest.mock import MagicMock, patch

from app.services.vectorstore import VectorStore


def _mock_index():
    idx = MagicMock()
    idx.upsert = MagicMock()
    idx.delete = MagicMock()
    idx.query = MagicMock(
        return_value={
            "matches": [
                {
                    "id": "doc1#0",
                    "score": 0.9,
                    "metadata": {"chunk_text": "hello", "page": 1, "doc_id": "doc1"},
                },
                {
                    "id": "doc1#1",
                    "score": 0.8,
                    "metadata": {"chunk_text": "world", "page": 2, "doc_id": "doc1"},
                },
            ]
        }
    )
    return idx


def test_upsert_uses_user_namespace():
    idx = _mock_index()
    with patch("app.services.vectorstore.Pinecone") as P:
        P.return_value.Index.return_value = idx
        vs = VectorStore()
        vs.upsert(
            user_id="u1",
            doc_id="doc1",
            vectors=[[0.1, 0.2], [0.3, 0.4]],
            chunks=["hello", "world"],
            pages=[1, 2],
        )
    assert idx.upsert.called
    kwargs = idx.upsert.call_args.kwargs
    assert kwargs["namespace"] == "u1"
    vectors = kwargs["vectors"]
    assert vectors[0]["id"] == "doc1#0"
    assert vectors[0]["metadata"] == {
        "chunk_text": "hello",
        "page": 1,
        "doc_id": "doc1",
    }


def test_query_filters_to_doc_in_namespace():
    idx = _mock_index()
    with patch("app.services.vectorstore.Pinecone") as P:
        P.return_value.Index.return_value = idx
        vs = VectorStore()
        results = vs.query(user_id="u1", doc_id="doc1", vector=[0.1, 0.2], top_k=4)
    assert idx.query.call_args.kwargs["namespace"] == "u1"
    assert idx.query.call_args.kwargs["filter"] == {"doc_id": "doc1"}
    assert idx.query.call_args.kwargs["top_k"] == 4
    assert results == [
        {"chunk_text": "hello", "page": 1, "score": 0.9},
        {"chunk_text": "world", "page": 2, "score": 0.8},
    ]


def test_delete_doc_uses_namespace_and_filter():
    idx = _mock_index()
    with patch("app.services.vectorstore.Pinecone") as P:
        P.return_value.Index.return_value = idx
        vs = VectorStore()
        vs.delete_doc(user_id="u1", doc_id="doc1")
    kwargs = idx.delete.call_args.kwargs
    assert kwargs["namespace"] == "u1"
    assert kwargs["filter"] == {"doc_id": "doc1"}
