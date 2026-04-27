from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response

from app.auth import current_user_persisted
from app.config import get_settings
from app.db import get_pool
from app.models import DocumentOut, UploadResult
from app.services.embeddings import Embedder
from app.services.ingest import ingest_pdf
from app.services.ratelimit import RateLimiter
from app.services.vectorstore import VectorStore

router = APIRouter(prefix="/docs", tags=["documents"])

# Lazy singletons; tests can override these attributes.
_embedder: Embedder | None = None
_vector_store: VectorStore | None = None
_rate_limiter: RateLimiter | None = None


def _get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder


def _get_vector_store() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


def _get_rate_limiter() -> RateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


@router.post("", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile = File(...),
    user_id: str = Depends(current_user_persisted),
) -> UploadResult:
    settings = get_settings()

    allowed = await _get_rate_limiter().check_and_increment(
        key=f"upload:{user_id}",
        limit=settings.daily_upload_limit,
        window_seconds=86400,
    )
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Daily upload limit reached",
            headers={"Retry-After": "86400"},
        )

    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF allowed")

    data = await file.read()
    if len(data) > settings.max_pdf_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Max {settings.max_pdf_mb}MB")

    try:
        result = await ingest_pdf(
            user_id=user_id,
            filename=file.filename or "untitled.pdf",
            data=data,
            embedder=_get_embedder(),
            vector_store=_get_vector_store(),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if result.page_count > settings.max_pdf_pages:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM documents WHERE id=$1::uuid", result.doc_id)
        _get_vector_store().delete_doc(user_id=user_id, doc_id=result.doc_id)
        raise HTTPException(
            status_code=400, detail=f"Max {settings.max_pdf_pages} pages"
        )

    return UploadResult(
        doc_id=result.doc_id,
        filename=file.filename or "untitled.pdf",
        page_count=result.page_count,
        chunk_count=result.chunk_count,
    )


@router.get("", response_model=list[DocumentOut])
async def list_docs(
    user_id: str = Depends(current_user_persisted),
) -> list[DocumentOut]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id::text, filename, page_count, chunk_count, created_at "
            "FROM documents WHERE clerk_user_id=$1 ORDER BY created_at DESC",
            user_id,
        )
    return [
        DocumentOut(
            id=r["id"],
            filename=r["filename"],
            page_count=r["page_count"],
            chunk_count=r["chunk_count"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.delete("/{doc_id}", status_code=204)
async def delete_doc(
    doc_id: str,
    user_id: str = Depends(current_user_persisted),
) -> Response:
    pool = await get_pool()
    async with pool.acquire() as conn:
        deleted = await conn.fetchval(
            "DELETE FROM documents WHERE id=$1::uuid AND clerk_user_id=$2 "
            "RETURNING id::text",
            doc_id,
            user_id,
        )
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")
    _get_vector_store().delete_doc(user_id=user_id, doc_id=doc_id)
    return Response(status_code=204)
