export type AttachmentStatus = "processing" | "ready" | "error";

export interface AttachmentUploadResponse {
  attachment_id: string;
  filename: string;
  content_type: string;
  text: string | null;
  truncated: boolean;
  download_url: string;
  ocr_performed: boolean;
  note: string | null;
}

export interface AttachmentState {
  id: string;
  filename: string;
  status: AttachmentStatus;
  contentType?: string;
  extractedText?: string | null;
  truncated?: boolean;
  downloadUrl?: string;
  ocrPerformed?: boolean;
  note?: string | null;
  error?: string;
}
