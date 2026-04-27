from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str
    clerk_jwks_url: str
    clerk_issuer: str
    pinecone_api_key: str
    pinecone_index: str
    pinecone_cloud: str = "aws"
    pinecone_region: str = "us-east-1"
    supabase_db_url: str
    upstash_redis_rest_url: str
    upstash_redis_rest_token: str
    allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    daily_upload_limit: int = 10
    daily_chat_limit: int = 50
    gemini_daily_global_limit: int = 1200
    max_pdf_mb: int = 10
    max_pdf_pages: int = 100
    chunk_size: int = 1000
    chunk_overlap: int = 200
    top_k: int = 4

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
