import pytest

from app.services.users import ensure_user_exists


@pytest.mark.asyncio
async def test_ensure_user_inserts_first_time(db_pool):
    await ensure_user_exists("user_alpha")
    async with db_pool.acquire() as conn:
        n = await conn.fetchval(
            "SELECT count(*) FROM users WHERE clerk_user_id=$1", "user_alpha"
        )
    assert n == 1


@pytest.mark.asyncio
async def test_ensure_user_idempotent(db_pool):
    await ensure_user_exists("user_beta")
    await ensure_user_exists("user_beta")
    async with db_pool.acquire() as conn:
        n = await conn.fetchval(
            "SELECT count(*) FROM users WHERE clerk_user_id=$1", "user_beta"
        )
    assert n == 1
