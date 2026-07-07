import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle } from "lucide-react";
import type { ReviewCreator } from "./types";
import { EVIDENCE_LABELS, StatusBadge } from "./status-badge";

export const reviewColumns: ColumnDef<ReviewCreator, unknown>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) =>
      [row.original.firstName, row.original.lastName].filter(Boolean).join(" ") || "—",
  },
  {
    id: "confidence",
    header: "Confidence",
    cell: ({ row }) => row.original.confidenceScore ?? "—",
  },
  {
    id: "evidence",
    header: "Winning Evidence",
    cell: ({ row }) =>
      row.original.confidenceSource ? EVIDENCE_LABELS[row.original.confidenceSource] : "—",
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.processingStatus} />,
  },
  {
    id: "needsReview",
    header: "Needs Review",
    cell: ({ row }) =>
      row.original.needsReview ? (
        <span className="inline-flex items-center gap-1 text-yellow-700 dark:text-yellow-400">
          <AlertTriangle size={13} /> Yes
        </span>
      ) : (
        "No"
      ),
  },
];
