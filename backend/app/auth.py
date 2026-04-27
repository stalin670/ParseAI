from typing import Any

import httpx
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt

from app.config import get_settings

_jwks_cache: dict[str, Any] = {}


async def _fetch_jwks() -> dict[str, Any]:
    if "keys" in _jwks_cache:
        return _jwks_cache
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(settings.clerk_jwks_url)
    r.raise_for_status()
    _jwks_cache.update(r.json())
    return _jwks_cache


def _bearer_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token"
        )
    return auth.removeprefix("Bearer ").strip()


async def current_user_id(request: Request) -> str:
    token = _bearer_token(request)
    settings = get_settings()
    jwks = await _fetch_jwks()
    try:
        unverified = jwt.get_unverified_header(token)
        kid = unverified.get("kid")
        key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if key is None:
            raise HTTPException(status_code=401, detail="Unknown signing key")
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"verify_aud": False},
        )
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid token") from e
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub")
    return str(sub)


async def current_user_persisted(uid: str = Depends(current_user_id)) -> str:
    """Auth + lazy-create the user row in Postgres. Use in routes that touch DB."""
    from app.services.users import ensure_user_exists

    await ensure_user_exists(uid)
    return uid
