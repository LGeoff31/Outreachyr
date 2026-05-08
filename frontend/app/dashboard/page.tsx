import { CampaignsView } from "@/components/CampaignsView";
import { DashboardShell } from "@/components/DashboardShell";

export const metadata = {
  title: "Campaigns - Outreachyr",
};

export default function DashboardPage() {
  return (
    <DashboardShell active="Campaigns">
      <CampaignsView />
    </DashboardShell>
  );
}
