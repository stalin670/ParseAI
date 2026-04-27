export type Document = {
  id: string;
  filename: string;
  page_count: number;
  chunk_count: number;
  created_at: string;
};

export type UploadResult = {
  doc_id: string;
  filename: string;
  page_count: number;
  chunk_count: number;
};

export type Source = { page: number; score: number };
