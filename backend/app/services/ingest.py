from dataclasses import dataclass

from app.config import get_settings
from app.db import get_pool
from app.services.pdf_parse import chunk_pages, parse_pdf
from app.services.users import ensure_user_exists


@dataclass
class IngestResult:
    doc_id: str
    page_count: int
    chunk_count: int


async def ingest_pdf(
    *,
    user_id: str,
    filename: str,
    data: bytes,
    embedder,
    vector_store,
) -> IngestResult:
    settings = get_settings()
    pages = parse_pdf(data)
    chunks = chunk_pages(
        pages, chunk_size=settings.chunk_size, overlap=settings.chunk_overlap
    )

    await ensure_user_exists(user_id)
    pool = await get_pool()
    async with pool.acquire() as conn, conn.transaction():
        row = await conn.fetchrow(
            "INSERT INTO documents (clerk_user_id, filename, page_count, chunk_count) "
            "VALUES ($1, $2, $3, $4) RETURNING id::text",
            user_id,
            filename,
            len(pages),
            len(chunks),
        )
        doc_id = row["id"]
        vectors = embedder.embed_documents([c["text"] for c in chunks])
        vector_store.upsert(
            user_id=user_id,
            doc_id=doc_id,
            vectors=vectors,
            chunks=[c["text"] for c in chunks],
            pages=[c["page"] for c in chunks],
        )

    return IngestResult(
        doc_id=doc_id, page_count=len(pages), chunk_count=len(chunks)
    )
