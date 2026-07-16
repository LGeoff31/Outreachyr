import type { ReactNode } from "react";

import { DashboardAuthBoundary } from "@/components/DashboardAuthBoundary";
import { DashboardShell } from "@/components/DashboardShell";
import { MailConnectionsProvider } from "@/components/mail-connections/MailConnectionsProvider";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardAuthBoundary>
      <MailConnectionsProvider>
        <DashboardShell>{children}</DashboardShell>
      </MailConnectionsProvider>
    </DashboardAuthBoundary>
  );
}
