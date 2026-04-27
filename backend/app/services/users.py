from app.db import get_pool


async def ensure_user_exists(clerk_user_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO users (clerk_user_id) VALUES ($1) "
            "ON CONFLICT (clerk_user_id) DO NOTHING",
            clerk_user_id,
        )
