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
