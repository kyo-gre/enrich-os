"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ConfidenceSource, ProcessingStatus, ReviewStatus } from "../../shared/types";

interface ReviewCreator {
  id: string;
  firstName: string | null;
  lastName: string | null;
  confidenceScore: number | null;
  confidenceSource: ConfidenceSource | null;
  processingStatus: ProcessingStatus;
  needsReview: boolean;
  reviewStatus: ReviewStatus;
}

const EVIDENCE_LABELS: Record<ConfidenceSource, string> = {
  full_name: "Full Name",
  email: "Email",
  username: "Username",
  display_name: "Display Name",
  instagram: "Instagram",
  tiktok: "TikTok",
  generic_scrape: "Web Profile",
  manual_override: "Manual Override",
};

const STATUS_STYLES: Record<ProcessingStatus, string> = {
  cache_hit: "bg-neutral-100 text-neutral-700",
  enriched: "bg-green-100 text-green-700",
  partially_enriched: "bg-yellow-100 text-yellow-800",
  needs_review: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: ProcessingStatus }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ReviewTable() {
  const searchParams = useSearchParams();
  const importId = searchParams.get("importId");
  const [creators, setCreators] = useState<ReviewCreator[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importId) return;
    fetch(`/api/creators?importId=${importId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data: { creators: ReviewCreator[] }) => {
        setCreators(data.creators);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [importId]);

  if (!importId) {
    return (
      <p className="text-neutral-500">
        No import selected. Start from the{" "}
        <a href="/imports" className="text-blue-600 hover:underline">
          import wizard
        </a>
        .
      </p>
    );
  }

  if (error) {
    return <p className="text-red-700">{error}</p>;
  }

  if (!creators) {
    return <p className="text-neutral-500">Loading…</p>;
  }

  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="sticky top-0 border-b border-neutral-300 bg-white">
          <th className="py-1.5 pr-4 font-medium">Name</th>
          <th className="py-1.5 pr-4 font-medium">Confidence</th>
          <th className="py-1.5 pr-4 font-medium">Winning Evidence</th>
          <th className="py-1.5 pr-4 font-medium">Status</th>
          <th className="py-1.5 font-medium">Needs Review</th>
        </tr>
      </thead>
      <tbody>
        {creators.map((c) => (
          <tr key={c.id} className="border-b border-neutral-100">
            <td className="py-1.5 pr-4">
              {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
            </td>
            <td className="py-1.5 pr-4">{c.confidenceScore ?? "—"}</td>
            <td className="py-1.5 pr-4">
              {c.confidenceSource ? EVIDENCE_LABELS[c.confidenceSource] : "—"}
            </td>
            <td className="py-1.5 pr-4">
              <StatusBadge status={c.processingStatus} />
            </td>
            <td className="py-1.5">{c.needsReview ? "Yes" : "No"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ReviewPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-lg font-medium mb-1">Review</h1>
      <p className="text-neutral-500 mb-6">
        Resolved identities from the most recent enrichment run.
      </p>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <ReviewTable />
      </Suspense>
    </main>
  );
}
