"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCompanyKeys } from "@/lib/api";

export function OutreachForm() {
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [out, setOut] = useState<string>("");
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCompanyKeys()
      .then(setHints)
      .catch(() => {});
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setErr(false);
      setOut("…");
      const fd = new FormData();
      fd.append("company", company.trim());
      fd.append("dry_run", dryRun ? "true" : "false");
      fd.append("subject", subject);
      fd.append("body_text", bodyText);
      if (file) fd.append("resume", file, file.name);
      try {
        const res = await fetch("/api/send", { method: "POST", body: fd });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          dry_run?: boolean;
          count?: number;
          recipients?: unknown[];
          sent?: number;
        };
        if (!data.ok) {
          setErr(true);
          setOut(data.error ?? res.statusText);
          return;
        }
        if (data.dry_run) {
          setOut(
            `Dry run — ${data.count} recipient(s)\n\n${JSON.stringify(data.recipients, null, 2)}`
          );
        } else {
          setOut(`Sent to ${data.sent} recipient(s).`);
        }
      } catch (x) {
        setErr(true);
        setOut(String(x));
      } finally {
        setLoading(false);
      }
    },
    [company, subject, bodyText, dryRun, file]
  );

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur"
    >
      <div>
        <label
          htmlFor="company"
          className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
        >
          Company (mapping key)
        </label>
        <input
          id="company"
          list="company-options"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="palantir"
          className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
        />
        <datalist id="company-options">
          {hints.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {hints.length > 0 && (
          <p className="mt-1.5 text-xs text-zinc-600">
            Keys: {hints.join(", ")}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="subject"
          className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
        >
          Subject
        </label>
        <input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Optional — auto from company if blank"
          className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
        />
      </div>

      <div>
        <label
          htmlFor="body"
          className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
        >
          Email body
        </label>
        <textarea
          id="body"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          rows={8}
          placeholder={`Hi __FIRST_NAME__,\n\n…`}
          className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-zinc-900/80 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
        />
        <p className="mt-1 text-xs text-zinc-600">
          Empty = use server <code className="text-zinc-500">body</code> file
        </p>
      </div>

      <div>
        <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Resume (PDF)
        </span>
        <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-zinc-900/40 px-6 py-10 text-center text-sm text-zinc-500 transition hover:border-violet-500/30 hover:bg-zinc-900/60">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <span className="text-zinc-400">
            {file ? (
              <>
                <span className="text-white">{file.name}</span>
                <span className="ml-2 text-zinc-600">
                  ({Math.round(file.size / 1024)} KB)
                </span>
              </>
            ) : (
              <>Drop PDF or click to upload</>
            )}
          </span>
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-violet-500 focus:ring-violet-500/40"
        />
        <span className="text-sm text-zinc-300">Dry run only</span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50"
      >
        {loading ? "Working…" : "Run"}
      </button>

      <pre
        className={`min-h-[5rem] overflow-auto rounded-xl border p-4 text-xs ${
          err
            ? "border-red-500/30 bg-red-950/40 text-red-200"
            : "border-white/10 bg-black/30 text-zinc-300"
        }`}
      >
        {out}
      </pre>
    </form>
  );
}
