import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

from app.auth import current_user_persisted
from app.config import get_settings
from app.db import get_pool
from app.models import ChatRequest
from app.services.embeddings import Embedder
from app.services.llm import build_prompt, stream_answer
from app.services.quota import GeminiQuotaGuard
from app.services.ratelimit import RateLimiter
from app.services.retrieve import retrieve_chunks
from app.services.vectorstore import VectorStore

router = APIRouter(prefix="/chat", tags=["chat"])

_embedder: Embedder | None = None
_vector_store: VectorStore | None = None
_rate_limiter: RateLimiter | None = None
_quota: GeminiQuotaGuard | None = None


def _embedder_inst() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder


def _vs_inst() -> VectorStore:
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


def _rl_inst() -> RateLimiter:
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


def _quota_inst() -> GeminiQuotaGuard:
    global _quota
    if _quota is None:
        _quota = GeminiQuotaGuard()
    return _quota


@router.post("/{doc_id}")
async def chat(
    doc_id: str,
    body: ChatRequest,
    user_id: str = Depends(current_user_persisted),
):
    settings = get_settings()

    if not await _rl_inst().check_and_increment(
        key=f"chat:{user_id}",
        limit=settings.daily_chat_limit,
        window_seconds=86400,
    ):
        raise HTTPException(
            status_code=429,
            detail="Daily chat limit reached",
            headers={"Retry-After": "86400"},
        )

    if not await _quota_inst().check_and_increment():
        raise HTTPException(status_code=503, detail="Service paused, try tomorrow")

    pool = await get_pool()
    async with pool.acquire() as conn:
        owned = await conn.fetchval(
            "SELECT 1 FROM documents WHERE id=$1::uuid AND clerk_user_id=$2",
            doc_id,
            user_id,
        )
    if not owned:
        raise HTTPException(status_code=404, detail="Not found")

    chunks = retrieve_chunks(
        user_id=user_id,
        doc_id=doc_id,
        question=body.question,
        top_k=settings.top_k,
        embedder=_embedder_inst(),
        vector_store=_vs_inst(),
    )

    prompt = build_prompt(question=body.question, chunks=chunks)

    async def event_stream() -> AsyncIterator[dict]:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO chats (document_id, role, content) "
                "VALUES ($1::uuid, 'user', $2)",
                doc_id,
                body.question,
            )
        full: list[str] = []
        error_msg: str | None = None
        try:
            for token in stream_answer(prompt):
                full.append(token)
                yield {"event": "token", "data": token}
            if not full:
                # Gemini returned no content (safety block, empty completion).
                error_msg = "Model returned no content"
        except Exception as e:  # noqa: BLE001 — propagate cause to client
            logger.exception("chat stream failed for doc=%s", doc_id)
            error_msg = f"{type(e).__name__}: {e}"
        finally:
            assistant_text = "".join(full) or f"[error: {error_msg}]"
            sources = [{"page": c["page"], "score": c["score"]} for c in chunks]
            async with pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO chats (document_id, role, content) "
                    "VALUES ($1::uuid, 'assistant', $2)",
                    doc_id,
                    assistant_text,
                )
            if error_msg:
                yield {"event": "error", "data": error_msg}
            yield {"event": "sources", "data": json.dumps(sources)}
            yield {"event": "done", "data": ""}

    return EventSourceResponse(event_stream())
