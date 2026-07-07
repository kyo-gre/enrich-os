"use client";

import { useState } from "react";
import type { ReviewStatus } from "../../shared/types";
import { postJson } from "./api";

const OVERRIDABLE_FIELDS = [
  "firstName",
  "lastName",
  "displayName",
  "platform",
  "profileUrl",
  "email",
  "socialHandle",
] as const;

export function RowActions({
  creatorId,
  reviewStatus,
  duplicateOfCreatorId,
  onChanged,
}: {
  creatorId: string;
  reviewStatus: ReviewStatus;
  duplicateOfCreatorId: string | null;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"none" | "override" | "merge">("none");
  const [field, setField] = useState<(typeof OVERRIDABLE_FIELDS)[number]>("firstName");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode("none");
      setValue("");
      setReason("");
      setTargetId("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-3 text-sm">
        <button
          className="text-blue-600 hover:underline disabled:text-neutral-400"
          disabled={busy || reviewStatus === "approved"}
          onClick={() => run(() => postJson(`/api/creators/${creatorId}/review`, { action: "approve" }))}
        >
          Approve
        </button>
        <button
          className="text-blue-600 hover:underline disabled:text-neutral-400"
          disabled={busy || reviewStatus === "ignored"}
          onClick={() => run(() => postJson(`/api/creators/${creatorId}/review`, { action: "ignore" }))}
        >
          Ignore
        </button>
        <button
          className="text-blue-600 hover:underline"
          disabled={busy}
          onClick={() => setMode(mode === "override" ? "none" : "override")}
        >
          Override
        </button>
        <button
          className="text-blue-600 hover:underline"
          disabled={busy}
          onClick={() => setMode(mode === "merge" ? "none" : "merge")}
        >
          Merge Into…
        </button>
        {duplicateOfCreatorId && (
          <button
            className="text-blue-600 hover:underline disabled:text-neutral-400"
            disabled={busy}
            onClick={() => run(() => postJson(`/api/creators/${creatorId}/unmerge`, {}))}
          >
            Unmerge
          </button>
        )}
      </div>

      {mode === "override" && (
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900">
          <select
            className="rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            value={field}
            onChange={(e) => setField(e.target.value as typeof field)}
          >
            {OVERRIDABLE_FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <input
            className="w-32 rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            placeholder="New value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <input
            className="w-32 rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
            disabled={busy || !value.trim()}
            onClick={() =>
              run(() =>
                postJson(`/api/creators/${creatorId}/override`, {
                  field,
                  value,
                  reason: reason || undefined,
                }),
              )
            }
          >
            Save
          </button>
        </div>
      )}

      {mode === "merge" && (
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900">
          <input
            className="w-56 rounded border border-neutral-300 bg-white px-1 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            placeholder="Target creator id"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
          <button
            className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
            disabled={busy || !targetId.trim()}
            onClick={() =>
              run(() => postJson(`/api/creators/${creatorId}/merge`, { targetCreatorId: targetId }))
            }
          >
            Merge
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
