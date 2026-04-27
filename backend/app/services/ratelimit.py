"""Stub. Real implementation in Task 15 (Upstash REST)."""


class RateLimiter:
    async def check_and_increment(
        self, *, key: str, limit: int, window_seconds: int
    ) -> bool:
        # Default deny in stub mode would block everything; default allow,
        # real check lives in Task 15.
        return True
