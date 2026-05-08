import { DashboardShell } from "@/components/DashboardShell";
import { OutreachForm } from "@/components/OutreachForm";

export const metadata = {
  title: "New Campaign - Outreachyr",
};

export default function NewCampaignPage() {
  return (
    <DashboardShell active="Campaigns">
      <OutreachForm />
    </DashboardShell>
  );
}
