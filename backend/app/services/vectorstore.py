from typing import Any

from pinecone import Pinecone

from app.config import get_settings


class VectorStore:
    def __init__(self) -> None:
        s = get_settings()
        self._pc = Pinecone(api_key=s.pinecone_api_key)
        self._index = self._pc.Index(s.pinecone_index)

    def upsert(
        self,
        *,
        user_id: str,
        doc_id: str,
        vectors: list[list[float]],
        chunks: list[str],
        pages: list[int],
    ) -> None:
        items = [
            {
                "id": f"{doc_id}#{i}",
                "values": v,
                "metadata": {
                    "chunk_text": chunks[i],
                    "page": pages[i],
                    "doc_id": doc_id,
                },
            }
            for i, v in enumerate(vectors)
        ]
        self._index.upsert(vectors=items, namespace=user_id)

    def query(
        self,
        *,
        user_id: str,
        doc_id: str,
        vector: list[float],
        top_k: int,
    ) -> list[dict[str, Any]]:
        res = self._index.query(
            vector=vector,
            top_k=top_k,
            namespace=user_id,
            filter={"doc_id": doc_id},
            include_metadata=True,
        )
        out: list[dict[str, Any]] = []
        for m in res.get("matches", []):
            md = m.get("metadata", {}) or {}
            out.append(
                {
                    "chunk_text": md.get("chunk_text", ""),
                    "page": int(md.get("page", 0)),
                    "score": m.get("score", 0.0),
                }
            )
        return out

    def delete_doc(self, *, user_id: str, doc_id: str) -> None:
        self._index.delete(filter={"doc_id": doc_id}, namespace=user_id)
