from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.services.ingest import IngestResult, ingest_pdf

PDF = Path(__file__).parent / "fixtures" / "sample.pdf"


@pytest.mark.asyncio
async def test_ingest_pdf_inserts_document_and_upserts_vectors(db_pool):
    embedder = MagicMock()
    embedder.embed_documents.side_effect = lambda texts: [[0.1] * 4 for _ in texts]
    vector_store = MagicMock()
    result: IngestResult = await ingest_pdf(
        user_id="user_ingest",
        filename="sample.pdf",
        data=PDF.read_bytes(),
        embedder=embedder,
        vector_store=vector_store,
    )
    assert result.page_count == 5
    assert result.chunk_count >= 5
    assert vector_store.upsert.called
    kw = vector_store.upsert.call_args.kwargs
    assert kw["user_id"] == "user_ingest"
    assert kw["doc_id"] == result.doc_id
    assert len(kw["vectors"]) == result.chunk_count
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT clerk_user_id, filename, page_count, chunk_count "
            "FROM documents WHERE id=$1::uuid",
            result.doc_id,
        )
    assert row["clerk_user_id"] == "user_ingest"
    assert row["filename"] == "sample.pdf"
    assert row["page_count"] == 5
    assert row["chunk_count"] == result.chunk_count


@pytest.mark.asyncio
async def test_ingest_rolls_back_doc_row_when_pinecone_fails(db_pool):
    embedder = MagicMock()
    embedder.embed_documents.return_value = [[0.1] * 4]
    vector_store = MagicMock()
    vector_store.upsert.side_effect = RuntimeError("pinecone down")
    with pytest.raises(RuntimeError):
        await ingest_pdf(
            user_id="user_rb",
            filename="sample.pdf",
            data=PDF.read_bytes(),
            embedder=embedder,
            vector_store=vector_store,
        )
    async with db_pool.acquire() as conn:
        n = await conn.fetchval(
            "SELECT count(*) FROM documents WHERE clerk_user_id=$1", "user_rb"
        )
    assert n == 0
