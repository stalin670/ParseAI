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


def test_embed_documents_retries_on_failure_then_succeeds():
    with patch("app.services.embeddings.GoogleGenerativeAIEmbeddings") as G:
        instance = MagicMock()
        instance.embed_documents.side_effect = [
            RuntimeError("transient"),
            [[0.7, 0.8]],
        ]
        G.return_value = instance
        e = Embedder()
        vecs = e.embed_documents(["a"])
    assert vecs == [[0.7, 0.8]]
    assert instance.embed_documents.call_count == 2


def test_embed_documents_gives_up_after_3_attempts():
    with patch("app.services.embeddings.GoogleGenerativeAIEmbeddings") as G:
        instance = MagicMock()
        instance.embed_documents.side_effect = RuntimeError("down")
        G.return_value = instance
        e = Embedder()
        try:
            e.embed_documents(["a"])
        except RuntimeError:
            pass
    assert instance.embed_documents.call_count == 3
