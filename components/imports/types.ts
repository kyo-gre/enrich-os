export type ImportStatus = "uploaded" | "mapped" | "processing" | "completed" | "failed";

export interface ImportSummary {
  id: string;
  fileName: string;
  rowCount: number;
  status: ImportStatus;
  createdAt: number;
  completedAt: number | null;
}
