from pydantic import BaseModel


class DocumentOut(BaseModel):
    id: str
    filename: str
    page_count: int
    chunk_count: int
    created_at: str


class UploadResult(BaseModel):
    doc_id: str
    filename: str
    page_count: int
    chunk_count: int


class ChatRequest(BaseModel):
    question: str
