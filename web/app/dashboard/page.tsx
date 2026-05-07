import { OutreachForm } from "@/components/OutreachForm";

export const metadata = {
  title: "Dashboard — Outreachyr",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-white">
        Campaign
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Calls your FastAPI routes via Next rewrites{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-zinc-300">
          /api/*
        </code>
        . Run{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
          uvicorn app:app --port 5050
        </code>{" "}
        in the repo root.
      </p>
      <div className="mt-10">
        <OutreachForm />
      </div>
    </div>
  );
}
