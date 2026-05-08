import { DashboardShell } from "@/components/DashboardShell";
import { TemplatesView } from "@/components/TemplatesView";

export const metadata = {
  title: "Templates - Outreachyr",
};

export default function TemplatesPage() {
  return (
    <DashboardShell active="Templates">
      <TemplatesView />
    </DashboardShell>
  );
}
