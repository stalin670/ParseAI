from unittest.mock import MagicMock, patch

from app.services.llm import build_prompt, stream_answer


def test_build_prompt_inlines_chunks_and_question():
    prompt = build_prompt(
        question="What is X?",
        chunks=[
            {"chunk_text": "X is a foo.", "page": 1},
            {"chunk_text": "Foo means bar.", "page": 2},
        ],
    )
    assert "What is X?" in prompt
    assert "X is a foo." in prompt
    assert "[page 1]" in prompt
    assert "[page 2]" in prompt
    assert "only this context" in prompt.lower()


def test_stream_answer_yields_tokens():
    with patch("app.services.llm.ChatGoogleGenerativeAI") as C:
        instance = MagicMock()
        instance.stream.return_value = iter(
            [MagicMock(content="Hello "), MagicMock(content="world")]
        )
        C.return_value = instance
        tokens = list(stream_answer("prompt"))
    assert tokens == ["Hello ", "world"]
