export interface PendingAttachment {
  id: string;
  file: File;
}

export interface SerializedAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataBase64?: string;
}
