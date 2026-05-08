import type { ReactNode } from "react";

import { DashboardAuthBoundary } from "@/components/DashboardAuthBoundary";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardAuthBoundary>{children}</DashboardAuthBoundary>;
}
