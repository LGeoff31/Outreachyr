import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { OutreachForm } from "@/components/OutreachForm";

export const metadata = {
  title: "New Campaign - Outreachyr",
};

export default function NewCampaignPage() {
  return (
    <DashboardShell active="Campaigns">
      <Suspense
        fallback={
          <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background text-muted-foreground">
            <Loader2 className="size-8 animate-spin" aria-label="Loading" />
          </div>
        }
      >
        <OutreachForm />
      </Suspense>
    </DashboardShell>
  );
}
