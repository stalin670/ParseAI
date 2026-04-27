from langchain_google_genai import GoogleGenerativeAIEmbeddings
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings


class Embedder:
    def __init__(self) -> None:
        s = get_settings()
        self._client = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=s.gemini_api_key,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._client.embed_documents(texts)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def embed_query(self, text: str) -> list[float]:
        return self._client.embed_query(text)
