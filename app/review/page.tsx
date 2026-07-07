"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DataTable } from "../../components/ui/data-table/data-table";
import { reviewColumns } from "../../components/review/columns";
import { ConfidenceBucketFilter } from "../../components/review/confidence-bucket-filter";
import { confidenceBucket, type ConfidenceBucket } from "../../components/review/confidence-bucket";
import { RowDetailPanel } from "../../components/review/row-detail-panel";
import type { ReviewCreator } from "../../components/review/types";

function ReviewWorkspace() {
  const searchParams = useSearchParams();
  const importId = searchParams.get("importId");

  const [creators, setCreators] = useState<ReviewCreator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState<Set<ConfidenceBucket>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(() => {
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

  useEffect(() => {
    load();
  }, [load]);

  const filteredCreators = useMemo(() => {
    if (!creators) return [];
    if (bucketFilter.size === 0) return creators;
    return creators.filter((c) => {
      const bucket = confidenceBucket(c.confidenceScore);
      return bucket !== null && bucketFilter.has(bucket);
    });
  }, [creators, bucketFilter]);

  if (!importId) {
    return (
      <p className="p-6 text-neutral-500">
        No import selected. Start from the{" "}
        <a href="/imports" className="text-blue-600 hover:underline">
          import wizard
        </a>
        .
      </p>
    );
  }

  if (error) {
    return <p className="p-6 text-red-700">{error}</p>;
  }

  if (!creators) {
    return <p className="p-6 text-neutral-500">Loading…</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
        <ConfidenceBucketFilter active={bucketFilter} onChange={setBucketFilter} />
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          {selectedIds.size > 0 && <span>{selectedIds.size} selected</span>}
          <span>
            {filteredCreators.length} of {creators.length} rows
          </span>
          <Link href={`/dashboard?importId=${importId}`} className="text-blue-600 hover:underline">
            View Dashboard →
          </Link>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <DataTable
          columns={reviewColumns}
          data={filteredCreators}
          getRowId={(c) => c.id}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          activeId={activeId}
          onActiveIdChange={setActiveId}
          onRowActivate={(row) => setDetailId(row.id)}
          emptyMessage="No creators match the current filter."
        />
      </div>

      <RowDetailPanel
        creatorId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={load}
      />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
      <ReviewWorkspace />
    </Suspense>
  );
}
