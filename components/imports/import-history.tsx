"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ImportSummary } from "./types";

const STATUS_LABEL: Record<ImportSummary["status"], string> = {
  uploaded: "Uploaded — mapping not confirmed",
  mapped: "Mapped — ready to enrich",
  processing: "Enriching…",
  completed: "Ready for review",
  failed: "Failed",
};

const STATUS_CLASS: Record<ImportSummary["status"], string> = {
  uploaded: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  mapped: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function RowAction({
  imp,
  onEnriched,
}: {
  imp: ImportSummary;
  onEnriched: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runEnrichment() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/imports/${imp.id}/enrich`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Enrichment failed");
      onEnriched();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setBusy(false);
    }
  }

  switch (imp.status) {
    case "completed":
      return (
        <div className="flex items-center gap-3">
          <Link href={`/review?importId=${imp.id}`} className="text-blue-600 hover:underline">
            Review →
          </Link>
          <Link href={`/dashboard?importId=${imp.id}`} className="text-blue-600 hover:underline">
            Dashboard →
          </Link>
        </div>
      );
    case "processing":
      return <span className="text-neutral-500">Enrichment in progress…</span>;
    case "mapped":
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={runEnrichment}
            disabled={busy}
            className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Starting…" : "Resume: Run enrichment"}
          </button>
          {error && <span className="text-xs text-red-700">{error}</span>}
        </div>
      );
    case "uploaded":
      return (
        <span className="text-xs text-neutral-500">
          Mapping not confirmed — re-upload the file to continue
        </span>
      );
    case "failed":
      return <span className="text-xs text-neutral-500">Re-upload the file to try again</span>;
    default:
      return null;
  }
}

export function ImportHistory({
  emptyMessage = "No imports yet — upload a file above to get started.",
}: {
  emptyMessage?: string;
}) {
  const [imports, setImports] = useState<ImportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/imports")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load imports");
        return res.json();
      })
      .then((data: { imports: ImportSummary[] }) => {
        setImports(data.imports);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load imports"));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!imports) return <p className="text-sm text-neutral-500">Loading imports…</p>;
  if (imports.length === 0) return <p className="text-sm text-neutral-500">{emptyMessage}</p>;

  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-neutral-300">
          <th className="py-1.5 pr-4 font-medium">File</th>
          <th className="py-1.5 pr-4 font-medium">Rows</th>
          <th className="py-1.5 pr-4 font-medium">Status</th>
          <th className="py-1.5 pr-4 font-medium">Uploaded</th>
          <th className="py-1.5 font-medium">Continue</th>
        </tr>
      </thead>
      <tbody>
        {imports.map((imp) => (
          <tr key={imp.id} className="border-b border-neutral-100">
            <td className="py-2 pr-4">{imp.fileName}</td>
            <td className="py-2 pr-4">{imp.rowCount || "—"}</td>
            <td className="py-2 pr-4">
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[imp.status]}`}>
                {STATUS_LABEL[imp.status]}
              </span>
            </td>
            <td className="py-2 pr-4 text-neutral-500">{formatDate(imp.createdAt)}</td>
            <td className="py-2">
              <RowAction imp={imp} onEnriched={load} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
