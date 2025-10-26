export type AttachmentStatus = "idle" | "uploading" | "ready" | "error";

export interface AttachmentMetadataEntry {
  label: string;
  value: string;
}

export interface AttachmentAnalysisPage {
  index: number;
  label: string;
  content: string;
}

export interface AttachmentAnalysis {
  summary: string;
  pages?: AttachmentAnalysisPage[];
}

export interface SerializedAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  dataBase64?: string;
  textPreview?: string;
  metadata?: AttachmentMetadataEntry[];
  analysis?: AttachmentAnalysis;
  sha256?: string;
}

export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: AttachmentStatus;
  error?: string;
  serialized?: SerializedAttachment;
}
