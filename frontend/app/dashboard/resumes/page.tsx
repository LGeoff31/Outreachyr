import { DashboardShell } from "@/components/DashboardShell";
import { ResumesView } from "@/components/ResumesView";

export const metadata = {
  title: "Resumes - Outreachyr",
};

export default function ResumesPage() {
  return (
    <DashboardShell active="Resumes">
      <ResumesView />
    </DashboardShell>
  );
}
