"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ImportSummary } from "./types";

const STAGES = [
  { href: "imports", label: "Imports" },
  { href: "review", label: "Review" },
  { href: "dashboard", label: "Dashboard" },
] as const;

export function ImportContextBar({ importId }: { importId: string }) {
  const pathname = usePathname();
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  useEffect(() => {
    setSummary(null);
    fetch(`/api/imports/${importId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ImportSummary | null) => setSummary(data));
  }, [importId]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-6 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
      <span className="text-neutral-600 dark:text-neutral-300">
        Viewing import:{" "}
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {summary ? summary.fileName : importId}
        </span>
        {summary && <span className="ml-2 text-neutral-400">({summary.rowCount} rows)</span>}
      </span>
      <div className="flex items-center gap-3">
        {STAGES.map((stage) => {
          const active = pathname?.startsWith(`/${stage.href}`);
          return (
            <Link
              key={stage.href}
              href={`/${stage.href}?importId=${importId}`}
              className={active ? "font-medium text-neutral-900 dark:text-neutral-100" : "text-blue-600 hover:underline"}
            >
              {stage.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
