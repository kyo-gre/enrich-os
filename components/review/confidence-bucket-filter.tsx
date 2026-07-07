import { CONFIDENCE_BUCKET_LABELS, type ConfidenceBucket } from "./confidence-bucket";

const BUCKETS: ConfidenceBucket[] = ["high", "medium", "low"];

export function ConfidenceBucketFilter({
  active,
  onChange,
}: {
  active: Set<ConfidenceBucket>;
  onChange: (next: Set<ConfidenceBucket>) => void;
}) {
  function toggle(bucket: ConfidenceBucket) {
    const next = new Set(active);
    if (next.has(bucket)) next.delete(bucket);
    else next.add(bucket);
    onChange(next);
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-neutral-500">Confidence:</span>
      {BUCKETS.map((bucket) => {
        const selected = active.has(bucket);
        return (
          <button
            key={bucket}
            onClick={() => toggle(bucket)}
            aria-pressed={selected}
            className={`rounded-full border px-2.5 py-1 transition-colors ${
              selected
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }`}
          >
            {CONFIDENCE_BUCKET_LABELS[bucket]}
          </button>
        );
      })}
      {active.size > 0 && (
        <button
          onClick={() => onChange(new Set())}
          className="text-neutral-500 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
