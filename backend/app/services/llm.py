from collections.abc import Iterator

from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import get_settings

SYSTEM_INSTRUCTIONS = (
    "You answer questions using only this context from a PDF. "
    "If the answer is not in the context, say you cannot find it. "
    "Cite page numbers like [p. N] when relevant."
)


def build_prompt(*, question: str, chunks: list[dict]) -> str:
    parts = [SYSTEM_INSTRUCTIONS, "", "Context:"]
    for c in chunks:
        parts.append(f"[page {c['page']}] {c['chunk_text']}")
    parts.extend(["", f"Question: {question}", "Answer:"])
    return "\n".join(parts)


def stream_answer(prompt: str) -> Iterator[str]:
    s = get_settings()
    chat = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=s.gemini_api_key,
        temperature=0.2,
    )
    for chunk in chat.stream(prompt):
        text = getattr(chunk, "content", "") or ""
        if text:
            yield text
