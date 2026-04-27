from io import BytesIO

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader


class EmptyPDFError(ValueError):
    pass


class EncryptedPDFError(ValueError):
    pass


def parse_pdf(data: bytes) -> list[dict]:
    try:
        reader = PdfReader(BytesIO(data))
    except Exception as e:
        raise EmptyPDFError("Could not read PDF") from e
    if reader.is_encrypted:
        raise EncryptedPDFError("Password-protected PDF not supported")
    pages: list[dict] = []
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append({"page": i, "text": text})
    if not pages:
        raise EmptyPDFError("No extractable text in PDF")
    return pages


def chunk_pages(pages: list[dict], *, chunk_size: int, overlap: int) -> list[dict]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    out: list[dict] = []
    for p in pages:
        for piece in splitter.split_text(p["text"]):
            out.append({"page": p["page"], "text": piece})
    return out
