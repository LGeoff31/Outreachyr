import { OutreachForm } from "@/components/OutreachForm";

export const metadata = {
  title: "Campaign builder - Outreachyr",
};

export default function DashboardPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] overflow-x-hidden bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-[calc(100vw-2.5rem)] sm:max-w-3xl">
            <p className="text-sm font-semibold text-blue-700">
              Campaign builder
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Preview the outreach campaign before anything sends.
            </h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              Add a company, confirm the message, attach a resume, and preview
              matched recruiters. Sending stays locked until you check the final
              review box.
            </p>
          </div>
          <div className="max-w-[calc(100vw-2.5rem)] rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-900">
            <strong className="font-semibold">Review mode is on.</strong>{" "}
            Previewing recruiters is separate from sending email.
          </div>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <OutreachForm />
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Review checklist
            </h2>
            <ol className="mt-5 space-y-4 text-sm leading-6 text-slate-600">
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                  1
                </span>
                Make sure the company name matches your intended employer.
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                  2
                </span>
                Read the subject and opening message before previewing.
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                  3
                </span>
                Confirm recipients and resume attachment before sending.
              </li>
            </ol>
            <div className="mt-6 rounded-xl bg-slate-950 p-4 text-sm leading-6 text-white">
              Outreachyr shows the final recipient list first. If anything
              looks wrong, change the fields and preview again.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
