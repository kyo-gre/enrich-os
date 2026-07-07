"use client";

import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/imports": "Imports",
  "/review": "Review",
  "/dashboard": "Dashboard",
};

function titleFor(pathname: string | null): string {
  if (!pathname) return "Enrich OS";
  const match = Object.keys(TITLES).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? TITLES[match] : "Enrich OS";
}

export function Topbar() {
  const pathname = usePathname();
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-neutral-200 px-6 dark:border-neutral-800">
      <h1 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        {titleFor(pathname)}
      </h1>
    </header>
  );
}
