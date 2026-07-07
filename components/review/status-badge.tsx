import type { ConfidenceSource, ProcessingStatus } from "../../shared/types";

export const EVIDENCE_LABELS: Record<ConfidenceSource, string> = {
  full_name: "Full Name",
  email: "Email",
  username: "Username",
  display_name: "Display Name",
  instagram: "Instagram",
  tiktok: "TikTok",
  generic_scrape: "Web Profile",
  manual_override: "Manual Override",
};

export const STATUS_STYLES: Record<ProcessingStatus, string> = {
  cache_hit: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  enriched: "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  partially_enriched: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-400",
  needs_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400",
};

export function StatusBadge({ status }: { status: ProcessingStatus }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
