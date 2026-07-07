"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { StatusBadge, EVIDENCE_LABELS } from "./status-badge";
import { RowActions } from "./row-actions";
import type { ProcessingLogEntry, ProfileSnapshotEntry, ReviewCreatorDetail } from "./types";

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-100 py-1.5 text-sm dark:border-neutral-900">
      <span className="text-neutral-500">{label}</span>
      <span className="truncate text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

function LogEntryRow({ log }: { log: ProcessingLogEntry }) {
  const dotColor =
    log.status === "success"
      ? "bg-green-500"
      : log.status === "failed"
        ? "bg-red-500"
        : "bg-neutral-300 dark:bg-neutral-700";
  return (
    <li className="flex gap-2 py-1.5 text-xs">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{log.step.replace(/_/g, " ")}</span>
          <span className="flex shrink-0 items-center gap-1 text-neutral-400">
            <Clock size={11} /> {new Date(log.createdAt).toLocaleTimeString()}
          </span>
        </div>
        {log.detail && (
          <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-all text-neutral-500">
            {JSON.stringify(log.detail, null, 0)}
          </pre>
        )}
      </div>
    </li>
  );
}

function SnapshotRow({ snapshot }: { snapshot: ProfileSnapshotEntry }) {
  return (
    <li className="border-b border-neutral-100 py-1.5 text-xs dark:border-neutral-900">
      <div className="flex items-center justify-between">
        <span className="font-medium">{snapshot.platform}</span>
        <span className="text-neutral-400">
          via {snapshot.fetchedVia} · {new Date(snapshot.fetchedAt).toLocaleString()}
        </span>
      </div>
      <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap break-all text-neutral-500">
        {JSON.stringify(snapshot.rawSnapshot, null, 0)}
      </pre>
    </li>
  );
}

export function RowDetailPanel({
  creatorId,
  onClose,
  onChanged,
}: {
  creatorId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ReviewCreatorDetail | null>(null);
  const [logs, setLogs] = useState<ProcessingLogEntry[]>([]);
  const [snapshots, setSnapshots] = useState<ProfileSnapshotEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!creatorId) return;
    fetch(`/api/creators/${creatorId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        return res.json();
      })
      .then((data: { creator: ReviewCreatorDetail; logs: ProcessingLogEntry[]; snapshots: ProfileSnapshotEntry[] }) => {
        setDetail(data.creator);
        setLogs(data.logs);
        setSnapshots(data.snapshots);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId]);

  const open = creatorId !== null;
  // Rather than clearing state synchronously in the effect (which the
  // detail may still belong to a previously-opened creator), treat it as
  // stale whenever it doesn't match the panel's current creatorId.
  const isStale = detail !== null && detail.id !== creatorId;
  const loading = open && !error && (detail === null || isStale);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed right-0 top-0 z-50 h-full w-[420px] max-w-[90vw] transform overflow-y-auto border-l border-neutral-200 bg-white shadow-xl transition-transform dark:border-neutral-800 dark:bg-neutral-950 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {open && (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Creator detail</h2>
              <button onClick={onClose} aria-label="Close" className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
                <X size={18} />
              </button>
            </div>

            {error && <p className="text-sm text-red-700">{error}</p>}

            {loading && <p className="text-sm text-neutral-500">Loading…</p>}

            {detail && !isStale && !error && (
              <div className="space-y-6">
                <section>
                  <div className="mb-2 flex items-center gap-2">
                    <StatusBadge status={detail.processingStatus} />
                    {detail.confidenceSource && (
                      <span className="text-xs text-neutral-500">
                        via {EVIDENCE_LABELS[detail.confidenceSource]}
                      </span>
                    )}
                  </div>
                  <Field label="Name" value={[detail.firstName, detail.lastName].filter(Boolean).join(" ") || null} />
                  <Field label="Display name" value={detail.displayName} />
                  <Field label="Email" value={detail.email} />
                  <Field label="Social handle" value={detail.socialHandle} />
                  <Field label="Platform" value={detail.platform} />
                  <Field label="Profile URL" value={detail.profileUrl} />
                  <Field label="Confidence" value={detail.confidenceScore} />
                  <Field label="Review status" value={detail.reviewStatus} />
                  <Field label="Needs review" value={detail.needsReview ? "Yes" : "No"} />
                  <Field label="Notes" value={detail.notes} />
                </section>

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Actions
                  </h3>
                  <RowActions
                    creatorId={detail.id}
                    reviewStatus={detail.reviewStatus}
                    duplicateOfCreatorId={detail.duplicateOfCreatorId}
                    onChanged={() => {
                      load();
                      onChanged();
                    }}
                  />
                </section>

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Processing log ({logs.length})
                  </h3>
                  {logs.length === 0 ? (
                    <p className="text-xs text-neutral-500">No log entries.</p>
                  ) : (
                    <ul>
                      {logs.map((log) => (
                        <LogEntryRow key={log.id} log={log} />
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Profile snapshots ({snapshots.length})
                  </h3>
                  {snapshots.length === 0 ? (
                    <p className="text-xs text-neutral-500">No scraped snapshots.</p>
                  ) : (
                    <ul>
                      {snapshots.map((snapshot) => (
                        <SnapshotRow key={snapshot.id} snapshot={snapshot} />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
