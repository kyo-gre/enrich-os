"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ImportContextBar } from "../../components/imports/import-context-bar";
import { ImportHistory } from "../../components/imports/import-history";

interface Stats {
  processed: number;
  needsReview: number;
  cacheHits: number;
  duplicates: number;
}

interface DuplicateGroup {
  keyType: "email" | "username" | "profile_url";
  keyValue: string;
  creators: Array<{ id: string; firstName: string | null; lastName: string | null }>;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-neutral-100 py-1.5">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function DuplicateGroupRow({
  group,
  onChanged,
}: {
  group: DuplicateGroup;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, ...others] = group.creators;

  async function mergeInto(sourceId: string, targetId: string) {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/creators/${sourceId}/merge`, { targetCreatorId: targetId });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="border-b border-neutral-100 py-2">
      <p className="text-xs text-neutral-500">
        Matched on {group.keyType.replace("_", " ")}: {group.keyValue}
      </p>
      <ul className="mt-1 space-y-1">
        {group.creators.map((c) => (
          <li key={c.id} className="flex items-center justify-between text-sm">
            <span>
              {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}{" "}
              <span className="text-neutral-400">({c.id})</span>
            </span>
            {c.id !== target.id && (
              <button
                className="text-blue-600 hover:underline disabled:text-neutral-400"
                disabled={busy}
                onClick={() => mergeInto(c.id, target.id)}
              >
                Merge into {target.firstName ?? target.id}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {others.length === 0 && null}
    </li>
  );
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const importId = searchParams.get("importId");
  const [stats, setStats] = useState<Stats | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!importId) return;
    Promise.all([
      fetch(`/api/imports/${importId}/stats`).then((r) => r.json()),
      fetch(`/api/imports/${importId}/duplicates`).then((r) => r.json()),
    ])
      .then(([statsData, duplicatesData]: [Stats, { groups: DuplicateGroup[] }]) => {
        setStats(statsData);
        setGroups(duplicatesData.groups);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [importId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!importId) {
    return (
      <div>
        <h2 className="mb-1 text-base font-medium">Select an import to view</h2>
        <p className="mb-4 text-neutral-500">
          No import is selected yet. Pick one below, or{" "}
          <a href="/imports" className="text-blue-600 hover:underline">
            start a new one
          </a>
          .
        </p>
        <ImportHistory emptyMessage="No imports yet — start one in the import wizard." />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <ImportContextBar importId={importId} />
        <p className="mt-4 text-red-700">{error}</p>
      </div>
    );
  }
  if (!stats || !groups) {
    return (
      <div>
        <ImportContextBar importId={importId} />
        <p className="mt-4 text-neutral-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ImportContextBar importId={importId} />
      <section>
        <h2 className="font-medium mb-2">Stats</h2>
        <div className="max-w-xs">
          <StatRow label="Processed" value={stats.processed} />
          <StatRow label="Needs Review" value={stats.needsReview} />
          <StatRow label="Cache Hits" value={stats.cacheHits} />
          <StatRow label="Duplicates" value={stats.duplicates} />
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">
          Possible Duplicates {groups.length > 0 && `(${groups.length})`}
        </h2>
        {groups.length === 0 ? (
          <p className="text-neutral-500 text-sm">
            No exact-match duplicates found (matches on email, username, or profile URL).
          </p>
        ) : (
          <ul>
            {groups.map((group, i) => (
              <DuplicateGroupRow key={i} group={group} onChanged={load} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-medium mb-2">Export</h2>
        <div className="flex gap-3 text-sm">
          <a
            className="text-blue-600 hover:underline"
            href={`/api/imports/${importId}/export?type=quick`}
          >
            Download quick export (CSV)
          </a>
          <a
            className="text-blue-600 hover:underline"
            href={`/api/imports/${importId}/export?type=full`}
          >
            Download full export (CSV)
          </a>
        </div>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 text-sm">
      <h1 className="text-lg font-medium mb-1">Dashboard</h1>
      <p className="text-neutral-500 mb-6">
        Operational stats, duplicate candidates, and exports for one import.
      </p>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
