"use client";

import { useState } from "react";
import Link from "next/link";
import type { CanonicalField, ColumnMapping } from "../../shared/types";
import { WorkflowStepper, type WorkflowStep } from "../../components/imports/workflow-stepper";
import { ImportHistory } from "../../components/imports/import-history";

const CANONICAL_FIELDS: Array<{ value: CanonicalField | ""; label: string }> = [
  { value: "", label: "— Ignore —" },
  { value: "fullName", label: "Full Name" },
  { value: "username", label: "Username" },
  { value: "email", label: "Email" },
  { value: "profileUrl", label: "Profile URL" },
  { value: "platform", label: "Platform" },
];

interface IngestResponse {
  importId: string;
  headers: string[];
  suggestedMapping: ColumnMapping;
  previewRows: Record<string, unknown>[];
  rowCount: number;
}

interface NormalizedPreviewRow {
  fullName?: string;
  username?: string;
  email?: string;
  profileUrl?: string;
  platform?: string;
}

export default function ImportsPage() {
  const [ingest, setIngest] = useState<IngestResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [normalizedPreview, setNormalizedPreview] = useState<
    NormalizedPreviewRow[] | null
  >(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrichedCount, setEnrichedCount] = useState<number | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setBusy(true);
    setNormalizedPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/imports", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
      const data: IngestResponse = await res.json();
      setIngest(data);
      setMapping(data.suggestedMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function handleMappingChange(header: string, field: CanonicalField | "") {
    setMapping((prev) => {
      const next = { ...prev };
      if (field === "") {
        delete next[header];
      } else {
        next[header] = field;
      }
      return next;
    });
  }

  async function handleConfirmMapping() {
    if (!ingest) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/imports/${ingest.importId}/column-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Mapping failed");
      const data: { rowCount: number; previewRows: NormalizedPreviewRow[] } =
        await res.json();
      setNormalizedPreview(data.previewRows);
      setRowCount(data.rowCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mapping failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRunEnrichment() {
    if (!ingest) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/imports/${ingest.importId}/enrich`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Enrichment failed");
      const data: { processed: number } = await res.json();
      setEnrichedCount(data.processed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setBusy(false);
    }
  }

  const steps: WorkflowStep[] = [
    { key: "upload", label: "Upload", state: ingest ? "done" : "current" },
    {
      key: "mapping",
      label: "Confirm Mapping",
      state: normalizedPreview ? "done" : ingest ? "current" : "upcoming",
    },
    {
      key: "enrich",
      label: "Run Enrichment",
      state: enrichedCount !== null ? "done" : normalizedPreview ? "current" : "upcoming",
    },
    {
      key: "review",
      label: "Review Results",
      state: enrichedCount !== null ? "current" : "upcoming",
    },
    { key: "export", label: "Export", state: "upcoming" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 text-sm">
      <h1 className="text-lg font-medium mb-1">Import creators</h1>
      <p className="text-neutral-500 mb-4">
        Upload a CSV or XLSX file, confirm the detected column mapping, run
        enrichment, then review and export the results.
      </p>

      <WorkflowStepper steps={steps} />

      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileChange}
        disabled={busy}
        className="block mb-6 text-sm file:mr-3 file:rounded file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm hover:file:bg-neutral-50"
      />

      {error && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-red-700">
          {error}
        </p>
      )}

      {ingest && (
        <section className="mb-8">
          <h2 className="font-medium mb-1">
            Step 2: Confirm column mapping — {ingest.rowCount} rows detected
          </h2>
          <p className="mb-2 text-xs text-neutral-500">
            Review the detected mapping below, then click &quot;Confirm mapping&quot; to continue.
          </p>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-1.5 pr-4 font-medium">Source column</th>
                <th className="py-1.5 font-medium">Maps to</th>
              </tr>
            </thead>
            <tbody>
              {ingest.headers.map((header) => (
                <tr key={header} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-4">{header}</td>
                  <td className="py-1.5">
                    <select
                      value={mapping[header] ?? ""}
                      onChange={(e) =>
                        handleMappingChange(
                          header,
                          e.target.value as CanonicalField | "",
                        )
                      }
                      className="rounded border border-neutral-300 bg-white px-2 py-1"
                    >
                      {CANONICAL_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={handleConfirmMapping}
            disabled={busy}
            className="mt-4 rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Confirm mapping
          </button>
        </section>
      )}

      {normalizedPreview && (
        <section>
          <h2 className="font-medium mb-1">
            Step 3: Normalized preview — {rowCount} rows saved
          </h2>
          {enrichedCount === null && (
            <p className="mb-2 text-xs text-neutral-500">
              Mapping saved. Click &quot;Run enrichment&quot; below to process these rows —
              nothing happens automatically until you do.
            </p>
          )}
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-1.5 pr-4 font-medium">Full Name</th>
                <th className="py-1.5 pr-4 font-medium">Username</th>
                <th className="py-1.5 pr-4 font-medium">Email</th>
                <th className="py-1.5 pr-4 font-medium">Profile URL</th>
                <th className="py-1.5 font-medium">Platform</th>
              </tr>
            </thead>
            <tbody>
              {normalizedPreview.map((row, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-4">{row.fullName ?? "—"}</td>
                  <td className="py-1.5 pr-4">{row.username ?? "—"}</td>
                  <td className="py-1.5 pr-4">{row.email ?? "—"}</td>
                  <td className="py-1.5 pr-4">{row.profileUrl ?? "—"}</td>
                  <td className="py-1.5">{row.platform ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {ingest && enrichedCount === null && (
            <div className="mt-4">
              <button
                onClick={handleRunEnrichment}
                disabled={busy}
                className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Running enrichment…" : "Run enrichment"}
              </button>
            </div>
          )}

          {ingest && enrichedCount !== null && (
            <div className="mt-4 rounded border border-green-300 bg-green-50 px-4 py-3">
              <p className="mb-2 font-medium text-green-800">
                Step 4: Enrichment complete — {enrichedCount} rows processed.
              </p>
              <p className="mb-3 text-xs text-neutral-600">
                Next: review the results, then export when you&apos;re done.
              </p>
              <div className="flex items-center gap-3">
                <Link
                  href={`/review?importId=${ingest.importId}`}
                  className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                >
                  Review results →
                </Link>
                <Link
                  href={`/dashboard?importId=${ingest.importId}`}
                  className="text-blue-600 hover:underline"
                >
                  Dashboard &amp; export →
                </Link>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-10 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <h2 className="font-medium mb-1">Import history</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Resume or revisit any previous import — this list survives page
          refreshes and lost tabs.
        </p>
        <ImportHistory />
      </section>
    </div>
  );
}
