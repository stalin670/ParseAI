import asyncpg

from app.config import get_settings

_pool: asyncpg.Pool | None = None


def _dsn() -> str:
    return get_settings().supabase_db_url.replace(
        "postgresql+asyncpg://", "postgresql://"
    )


async def create_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(dsn=_dsn(), min_size=1, max_size=5)
    return _pool


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        return await create_pool()
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
