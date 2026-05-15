import type { ReactNode } from "react";

import { DashboardAuthBoundary } from "@/components/DashboardAuthBoundary";
import { DashboardShell } from "@/components/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardAuthBoundary>
      <DashboardShell>{children}</DashboardShell>
    </DashboardAuthBoundary>
  );
}
