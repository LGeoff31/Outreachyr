import Link from "next/link";

const recipients = [
  {
    name: "Aisha Khan",
    role: "Technical Recruiter",
    location: "San Francisco, CA",
    initials: "AK",
  },
  {
    name: "Michael Park",
    role: "Senior Recruiter",
    location: "Palo Alto, CA",
    initials: "MP",
  },
  {
    name: "David Lin",
    role: "University Recruiter",
    location: "New York, NY",
    initials: "DL",
  },
];

const steps = [
  {
    title: "Find recruiters",
    body: "Type a company name and Outreachyr checks the mapped company domain before looking for matching recruiter contacts.",
    icon: SearchIcon,
  },
  {
    title: "Review before send",
    body: "See the recipients, subject, and message in one place. The send action stays locked until review is confirmed.",
    icon: EyeIcon,
  },
  {
    title: "Attach your resume",
    body: "Add a PDF once, preview the campaign, then send only after the final confirmation step.",
    icon: PaperclipIcon,
  },
];

const pricing = [
  {
    name: "Start",
    price: "Free",
    body: "Build and preview outreach campaigns with your local backend.",
  },
  {
    name: "Campus",
    price: "Team-ready",
    body: "Shared templates, review workflows, and clearer handoffs for student groups.",
  },
];

export default function HomePage() {
  return (
    <div className="overflow-x-hidden bg-white text-slate-950">
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pb-12 pt-12 sm:px-8 lg:min-h-[690px] lg:grid-cols-[0.9fr_1.05fr] lg:pb-12 lg:pt-10">
          <div className="min-w-0 max-w-[calc(100vw-2.5rem)] sm:max-w-2xl">
            <h1 className="text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
              Reach the right{" "}
              <span className="text-blue-600">recruiters.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">
              Enter a company name. Outreachyr finds relevant recruiters,
              drafts personalized emails, and keeps every message in review
              until you approve it.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/dashboard"
                className="inline-flex min-h-14 items-center justify-center rounded-xl bg-blue-600 px-8 text-base font-semibold text-white shadow-xl shadow-blue-600/20 transition hover:bg-blue-700"
              >
                Start free
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex min-h-14 items-center justify-center rounded-xl px-6 text-base font-semibold text-blue-800 transition hover:bg-blue-50"
              >
                See how it works
                <span className="ml-2" aria-hidden="true">
                  -&gt;
                </span>
              </Link>
            </div>
            <p className="mt-7 flex items-center gap-3 text-sm font-medium text-slate-600">
              <LockIcon className="h-5 w-5 text-slate-900" />
              Nothing is sent without your review.
            </p>
          </div>

          <CampaignPreview />
        </div>

        <div className="mx-auto grid max-w-7xl gap-4 px-5 pb-14 sm:px-8 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.title}
              className="flex items-start gap-4 border-t border-slate-200 pt-6"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-950 shadow-sm">
                <step.icon className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  {step.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {step.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              A guided flow that keeps users in control.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              The interface uses plain labels, visible steps, and a locked send
              path so first-time users know exactly what happens next.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["1", "Choose company", "Start with a familiar company name."],
              ["2", "Preview campaign", "Review contacts and message content."],
              ["3", "Confirm send", "Unlock sending only after review."],
            ].map(([number, title, body]) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                  {number}
                </span>
                <h3 className="mt-8 text-lg font-semibold tracking-tight text-slate-950">
                  {title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Pricing that matches early outreach.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Start with a simple local workflow. Move into shared review when
              multiple people are managing recruiter outreach together.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {pricing.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-950">
                      {plan.name}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {plan.body}
                    </p>
                  </div>
                  <p className="text-right text-xl font-semibold text-blue-700">
                    {plan.price}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function CampaignPreview() {
  return (
    <div className="relative min-w-0 max-w-[calc(100vw-2.5rem)] sm:max-w-none">
      <div className="absolute inset-0 translate-y-10 rounded-[2rem] bg-blue-600/10 blur-3xl" />
      <div className="relative w-full overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-200/80 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700">
              <DocumentIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">
                Campaign preview
              </p>
              <p className="text-xs text-slate-500">Review mode active</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Not sent
          </span>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white">
          <PreviewField label="Company" value="Palantir" />
          <PreviewField
            label="Subject line"
            value="Fall 2026 Software Engineering Opportunities"
          />
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-xs font-medium text-slate-500">
              Message preview
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-800">
              Hi Aisha,
              <br />
              I am a CS student interested in building impactful software. I am
              reaching out to learn more about Fall 2026 opportunities.
            </p>
          </div>

          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                Recipients (3)
              </p>
              <p className="text-xs font-semibold text-blue-700">
                Confirm each
              </p>
            </div>
            <div className="mt-3 space-y-3">
              {recipients.map((person) => (
                <div
                  key={person.name}
                  className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-3"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                    {person.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {person.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {person.role} - {person.location}
                    </p>
                  </div>
                  <button className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 sm:px-4">
                    Preview
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-slate-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            Send unlocks after every recipient and message is reviewed.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-blue-50"
          >
            Build campaign
          </Link>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-200 px-5 py-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-slate-950">{value}</p>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="m20 20-4.5-4.5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="m20 11.5-8.4 8.4a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.4-8.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M7 10V8a5 5 0 0 1 10 0v2M6.5 10h11A1.5 1.5 0 0 1 19 11.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 14v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M7 3h7l4 4v14H7V3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h4M9.5 12h5M9.5 16h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
