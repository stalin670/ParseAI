from collections.abc import Iterator

from langchain_google_genai import (
    ChatGoogleGenerativeAI,
    HarmBlockThreshold,
    HarmCategory,
)

from app.config import get_settings

# Permissive safety settings: PDFs are user-owned; spurious blocks here
# surface as empty completions and were the cause of "[interrupted]" replies.
_SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

SYSTEM_INSTRUCTIONS = (
    "You answer questions using only this context from a PDF. "
    "If the answer is not in the context, say you cannot find it. "
    "Cite page numbers as whole integers like [p. 3] (never [p. 3.0] or decimals). "
    "Use Markdown for formatting (bold, lists, code blocks)."
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
        safety_settings=_SAFETY_SETTINGS,
    )
    for chunk in chat.stream(prompt):
        text = getattr(chunk, "content", "") or ""
        if text:
            yield text
