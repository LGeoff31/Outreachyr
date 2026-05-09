import { DashboardShell } from "@/components/DashboardShell";
import { SettingsView } from "@/components/SettingsView";

export const metadata = {
  title: "Settings - Outreachyr",
};

export default function SettingsPage() {
  return (
    <DashboardShell active="Settings">
      <SettingsView />
    </DashboardShell>
  );
}
