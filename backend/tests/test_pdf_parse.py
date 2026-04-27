from pathlib import Path

import pytest

from app.services.pdf_parse import EmptyPDFError, chunk_pages, parse_pdf

PDF = Path(__file__).parent / "fixtures" / "sample.pdf"


def test_parse_pdf_returns_one_doc_per_page():
    pages = parse_pdf(PDF.read_bytes())
    assert len(pages) == 5
    assert all("Page" in p["text"] for p in pages)
    assert pages[0]["page"] == 1
    assert pages[-1]["page"] == 5


def test_chunk_pages_preserves_page_numbers():
    pages = parse_pdf(PDF.read_bytes())
    chunks = chunk_pages(pages, chunk_size=200, overlap=40)
    assert len(chunks) >= 5
    assert {c["page"] for c in chunks}.issubset({1, 2, 3, 4, 5})
    assert all(len(c["text"]) <= 220 for c in chunks)


def test_parse_pdf_rejects_empty_text():
    blank = b"%PDF-1.4\n%%EOF"
    with pytest.raises(EmptyPDFError):
        parse_pdf(blank)
