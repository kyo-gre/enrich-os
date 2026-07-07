import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen min-h-0">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
