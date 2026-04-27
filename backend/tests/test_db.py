import pytest


@pytest.mark.asyncio
async def test_pool_executes_simple_query(db_pool):
    async with db_pool.acquire() as conn:
        v = await conn.fetchval("SELECT 1")
    assert v == 1


@pytest.mark.asyncio
async def test_users_table_exists(db_pool):
    async with db_pool.acquire() as conn:
        v = await conn.fetchval("SELECT to_regclass('public.users')")
    assert v == "users"
