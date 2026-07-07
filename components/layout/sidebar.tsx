"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Upload } from "lucide-react";

const NAV_ITEMS = [
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/review", label: "Review", icon: ListChecks },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex h-14 items-center px-4">
        <span className="text-sm font-semibold tracking-tight">Enrich OS</span>
      </div>
      <ul className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-neutral-200/70 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
                    : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-100"
                }`}
              >
                <Icon size={16} strokeWidth={2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
