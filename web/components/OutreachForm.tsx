"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCompanyKeys } from "@/lib/api";

type Recipient = {
  email?: string;
  greeting_name?: string;
};

type SendResponse = {
  ok?: boolean;
  error?: string;
  dry_run?: boolean;
  count?: number;
  recipients?: Recipient[];
  sent?: number;
};

export function OutreachForm() {
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState(
    "Start with a company name, then preview the campaign."
  );
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState<"preview" | "send" | null>(null);

  useEffect(() => {
    fetchCompanyKeys()
      .then(setHints)
      .catch(() => {});
  }, []);

  const companyReady = company.trim().length > 0;
  const canSend = recipients.length > 0 && reviewed && loading === null;

  const fileLabel = useMemo(() => {
    if (!file) return "Upload resume PDF";
    const size = Math.max(1, Math.round(file.size / 1024));
    return `${file.name} (${size} KB)`;
  }, [file]);

  const runCampaign = useCallback(
    async (dryRun: boolean) => {
      if (!companyReady) {
        setErr(true);
        setMessage("Enter a company name before previewing the campaign.");
        return;
      }

      if (!dryRun && !reviewed) {
        setErr(true);
        setMessage("Review the recipients and message before sending.");
        return;
      }

      setLoading(dryRun ? "preview" : "send");
      setErr(false);
      setMessage(dryRun ? "Finding recruiters..." : "Sending campaign...");

      const fd = new FormData();
      fd.append("company", company.trim());
      fd.append("dry_run", dryRun ? "true" : "false");
      fd.append("subject", subject);
      fd.append("body_text", bodyText);
      if (file) fd.append("resume", file, file.name);

      try {
        const res = await fetch("/api/send", { method: "POST", body: fd });
        const data = (await res.json()) as SendResponse;

        if (!data.ok) {
          setErr(true);
          setMessage(data.error ?? "The campaign could not be prepared.");
          return;
        }

        if (data.dry_run) {
          const nextRecipients = data.recipients ?? [];
          setRecipients(nextRecipients);
          setReviewed(false);
          setMessage(
            nextRecipients.length > 0
              ? `Preview ready. Review ${
                  data.count ?? nextRecipients.length
                } recipient(s), then confirm if everything looks right.`
              : "Preview finished, but no recipients were returned."
          );
        } else {
          setRecipients([]);
          setReviewed(false);
          setMessage(`Sent to ${data.sent ?? 0} recipient(s).`);
        }
      } catch {
        setErr(true);
        setMessage(
          "Could not reach the outreach server. Start the backend, then try preview again."
        );
      } finally {
        setLoading(null);
      }
    },
    [bodyText, company, companyReady, file, reviewed, subject]
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void runCampaign(true);
      }}
      className="min-w-0 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:max-w-none sm:p-6"
    >
      <div className="grid gap-3 border-b border-slate-200 pb-6 sm:grid-cols-3">
        {[
          ["1", "Company"],
          ["2", "Message"],
          ["3", "Review"],
        ].map(([number, label]) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-700 shadow-sm">
              {number}
            </span>
            <span className="text-sm font-semibold text-slate-800">{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <label
            htmlFor="company"
            className="text-sm font-semibold text-slate-950"
          >
            Company name
          </label>
          <input
            id="company"
            list="company-options"
            value={company}
            onChange={(event) => {
              setCompany(event.target.value);
              setRecipients([]);
              setReviewed(false);
            }}
            placeholder="Palantir"
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            autoComplete="organization"
          />
          <datalist id="company-options">
            {hints.map((hint) => (
              <option key={hint} value={hint} />
            ))}
          </datalist>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Use the company name you want recruiters matched against.
            {hints.length > 0
              ? ` Available: ${hints.slice(0, 4).join(", ")}.`
              : ""}
          </p>
        </div>

        <div className="lg:col-span-2">
          <label
            htmlFor="subject"
            className="text-sm font-semibold text-slate-950"
          >
            Subject line
          </label>
          <input
            id="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Fall 2026 Software Engineering Opportunities"
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Leave blank to use the backend default subject.
          </p>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="body" className="text-sm font-semibold text-slate-950">
            Email message
          </label>
          <textarea
            id="body"
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
            rows={8}
            placeholder={`Hi __FIRST_NAME__,\n\nI am reaching out to learn more about Fall 2026 opportunities...`}
            className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-base leading-7 text-slate-950 shadow-sm transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Leave blank to use the saved message in the server body file.
          </p>
        </div>

        <div className="lg:col-span-2">
          <span className="text-sm font-semibold text-slate-950">
            Resume attachment
          </span>
          <label className="mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center transition hover:border-blue-300 hover:bg-blue-50/60">
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <span className="text-sm font-semibold text-slate-950">
              {fileLabel}
            </span>
            <span className="mt-1 text-sm text-slate-500">
              PDF only. You can preview before sending.
            </span>
          </label>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Recruiter preview
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Preview finds recipients and keeps send locked until you review.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading !== null}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === "preview" ? "Previewing..." : "Preview campaign"}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {recipients.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm leading-6 text-slate-500">
              Recipient results will appear here after preview.
            </div>
          ) : (
            recipients.map((recipient, index) => (
              <div
                key={`${recipient.email ?? "recipient"}-${index}`}
                className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {recipient.greeting_name || "Recruiter"}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {recipient.email || "Email unavailable"}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Previewed
                </span>
              </div>
            ))
          )}
        </div>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
            disabled={recipients.length === 0}
            className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm leading-6 text-slate-700">
            I reviewed the recipients, message, and resume. I understand this
            unlocks the send button.
          </span>
        </label>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-600">
            Send button status:{" "}
            <span className={canSend ? "text-emerald-700" : "text-slate-950"}>
              {canSend ? "unlocked" : "locked"}
            </span>
          </p>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void runCampaign(false)}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
          >
            {loading === "send" ? "Sending..." : "Send campaign"}
          </button>
        </div>
      </div>

      <div
        role="status"
        className={`mt-5 rounded-xl border px-4 py-3 text-sm leading-6 ${
          err
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-blue-100 bg-blue-50 text-blue-900"
        }`}
      >
        {message}
      </div>
    </form>
  );
}
