import base64
from datetime import datetime, timedelta, timezone

import pytest
import respx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from httpx import Response
from jose import jwt


def _make_keypair():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_numbers = key.public_key().public_numbers()
    n = public_numbers.n.to_bytes((public_numbers.n.bit_length() + 7) // 8, "big")
    e = public_numbers.e.to_bytes((public_numbers.e.bit_length() + 7) // 8, "big")
    jwk = {
        "kty": "RSA",
        "kid": "test-kid",
        "use": "sig",
        "alg": "RS256",
        "n": base64.urlsafe_b64encode(n).rstrip(b"=").decode(),
        "e": base64.urlsafe_b64encode(e).rstrip(b"=").decode(),
    }
    return private_pem, jwk


def _make_token(private_pem: str, kid: str, issuer: str, sub: str, exp_delta=60) -> str:
    return jwt.encode(
        {
            "sub": sub,
            "iss": issuer,
            "exp": datetime.now(timezone.utc) + timedelta(seconds=exp_delta),
        },
        private_pem,
        algorithm="RS256",
        headers={"kid": kid},
    )


@pytest.fixture
def app_with_protected_route(monkeypatch):
    private_pem, jwk = _make_keypair()
    issuer = "https://example.clerk.accounts.dev"
    jwks_url = f"{issuer}/.well-known/jwks.json"

    monkeypatch.setenv("CLERK_JWKS_URL", jwks_url)
    monkeypatch.setenv("CLERK_ISSUER", issuer)
    from app.config import get_settings

    get_settings.cache_clear()
    from app.auth import _jwks_cache, current_user_id

    _jwks_cache.clear()

    app = FastAPI()

    @app.get("/me")
    def me(uid: str = Depends(current_user_id)) -> dict[str, str]:
        return {"user_id": uid}

    return app, private_pem, jwk, issuer, jwks_url


def test_valid_token_returns_user_id(app_with_protected_route):
    app, private_pem, jwk, issuer, jwks_url = app_with_protected_route
    token = _make_token(private_pem, jwk["kid"], issuer, "user_abc")
    with respx.mock(assert_all_called=False) as m:
        m.get(jwks_url).mock(return_value=Response(200, json={"keys": [jwk]}))
        client = TestClient(app)
        r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {"user_id": "user_abc"}


def test_missing_token_returns_401(app_with_protected_route):
    app, *_ = app_with_protected_route
    client = TestClient(app)
    r = client.get("/me")
    assert r.status_code == 401


def test_expired_token_returns_401(app_with_protected_route):
    app, private_pem, jwk, issuer, jwks_url = app_with_protected_route
    token = _make_token(private_pem, jwk["kid"], issuer, "user_abc", exp_delta=-10)
    with respx.mock(assert_all_called=False) as m:
        m.get(jwks_url).mock(return_value=Response(200, json={"keys": [jwk]}))
        client = TestClient(app)
        r = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
