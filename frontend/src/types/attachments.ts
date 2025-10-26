export type AttachmentUploadStatus = "loading" | "success" | "fail";

export interface PendingAttachment {
  id: string;
  file: File;
  status: AttachmentUploadStatus;
  progress: number;
  previewUrl?: string;
  error?: string;
  serialized?: SerializedAttachment;
}

export interface SerializedAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataBase64?: string;
}
