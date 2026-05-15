"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  SendHorizontal,
  ShieldCheck,
  Upload,
  UsersRound,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fetchCompanyKeys } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  createEmailTemplate,
  fetchEmailTemplateRows,
  type EmailTemplateRow as SavedEmailTemplate,
} from "@/lib/supabase/emailTemplates";
import {
  fetchCampaignDetail,
  type CampaignDetailResponse,
} from "@/lib/supabase/campaigns";
import {
  fetchUserResumeRows,
  resumeApiAuthHeaders,
  type UserResumeRow,
} from "@/lib/supabase/userResumes";

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
  auth_required?: boolean;
};

const defaultCompany = "Palantir";
const defaultSubject =
  "Fall 2026 Software Engineering Opportunities at Palantir";
const defaultMessage = `Hi {{first_name}},

I'm a CS student interested in building impactful software at {{company}}.

I'm reaching out to learn more about opportunities for Fall 2026.`;

const mergeFields = ["{{first_name}}", "{{company}}", "{{role}}"];

export function OutreachForm() {
  const searchParams = useSearchParams();
  const campaignFromUrl = searchParams.get("campaign")?.trim() || null;

  const [company, setCompany] = useState(defaultCompany);
  const [testMode, setTestMode] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [bodyText, setBodyText] = useState(defaultMessage);
  const [file, setFile] = useState<File | null>(null);
  const [savedResumes, setSavedResumes] = useState<UserResumeRow[]>([]);
  const [savedResumesLoading, setSavedResumesLoading] = useState(false);
  const [savedResumesError, setSavedResumesError] = useState<string | null>(
    null
  );
  const [selectedSavedResumeId, setSelectedSavedResumeId] = useState<
    string | null
  >(null);
  const [libraryAttachLoading, setLibraryAttachLoading] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<SavedEmailTemplate[]>([]);
  const [savedTemplatesLoading, setSavedTemplatesLoading] = useState(false);
  const [savedTemplatesError, setSavedTemplatesError] = useState<string | null>(
    null
  );
  const [selectedSavedTemplateId, setSelectedSavedTemplateId] = useState<
    string | null
  >(null);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateSaving, setSaveTemplateSaving] = useState(false);
  const [saveTemplateErr, setSaveTemplateErr] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState(
    "Run a dry run to find recruiters and review every message before sending."
  );
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState<"preview" | "send" | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignLoadError, setCampaignLoadError] = useState<string | null>(
    null
  );
  const [loadedCampaign, setLoadedCampaign] =
    useState<CampaignDetailResponse | null>(null);
  const [pendingCampaignResumePath, setPendingCampaignResumePath] = useState<
    string | null
  >(null);

  useEffect(() => {
    fetchCompanyKeys()
      .then(setHints)
      .catch(() => {});
  }, []);

  const applyLibraryResume = useCallback(async (row: UserResumeRow) => {
    setLibraryAttachLoading(true);
    setSavedResumesError(null);
    try {
      const res = await fetch(
        `/api/user-resumes/${encodeURIComponent(row.id)}/file`,
        { headers: await resumeApiAuthHeaders() }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const blob = await res.blob();
      const safeName = `${row.display_name.replace(/[/\\]/g, "-")}.pdf`;
      const nextFile = new File([blob], safeName, { type: "application/pdf" });
      setFile(nextFile);
      setSelectedSavedResumeId(row.id);
    } catch (e) {
      setFile(null);
      setSelectedSavedResumeId(null);
      setSavedResumesError(
        e instanceof Error ? e.message : "Could not load saved resume."
      );
    } finally {
      setLibraryAttachLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      setSavedResumesLoading(true);
      setSavedResumesError(null);
      try {
        const { rows, error } = await fetchUserResumeRows();
        if (cancelled) return;
        if (error) {
          setSavedResumes([]);
          setSavedResumesError(error.message);
          return;
        }
        setSavedResumes(rows);
        if (!campaignFromUrl) {
          const defaultRow = rows.find((r) => r.is_default);
          if (defaultRow) await applyLibraryResume(defaultRow);
        }
      } finally {
        if (!cancelled) setSavedResumesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyLibraryResume, campaignFromUrl]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      setSavedTemplatesLoading(true);
      setSavedTemplatesError(null);
      try {
        const { rows, error } = await fetchEmailTemplateRows();
        if (cancelled) return;
        if (error) {
          setSavedTemplates([]);
          setSavedTemplatesError(error.message);
          return;
        }
        setSavedTemplates(rows);
      } finally {
        if (!cancelled) setSavedTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!campaignFromUrl) {
      setLoadedCampaign(null);
      setCampaignLoadError(null);
      setCampaignLoading(false);
      setPendingCampaignResumePath(null);
      setCompany(defaultCompany);
      setSubject(defaultSubject);
      setBodyText(defaultMessage);
      setRecipients([]);
      setReviewed(false);
      setTestMode(false);
      setErr(false);
      setMessage(
        "Run a dry run to find recruiters and review every message before sending."
      );
      setFile(null);
      setSelectedSavedResumeId(null);
      setSelectedSavedTemplateId(null);
      return;
    }

    if (!isSupabaseConfigured()) {
      setCampaignLoadError("Sign in to load this campaign.");
      setLoadedCampaign(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setCampaignLoading(true);
      setCampaignLoadError(null);
      const { data, error } = await fetchCampaignDetail(campaignFromUrl);
      if (cancelled) return;
      if (error || !data) {
        setCampaignLoadError(error?.message ?? "Could not load campaign.");
        setCampaignLoading(false);
        setLoadedCampaign(null);
        setPendingCampaignResumePath(null);
        return;
      }
      setCompany(data.company);
      setSubject(data.subject);
      setBodyText(data.body_text);
      setRecipients(
        data.recipients.map((r) => ({
          email: r.email,
          greeting_name: r.greeting_name?.trim()
            ? r.greeting_name
            : undefined,
        }))
      );
      setTestMode(false);
      setSelectedSavedTemplateId(null);
      const sent = data.status.toLowerCase() === "sent";
      setReviewed(sent && data.recipients.length > 0);
      setLoadedCampaign(data);
      setErr(false);
      setMessage(
        sent
          ? "This campaign was already sent. Review the copy and recipients below; dry run and send are disabled."
          : "Campaign loaded. Run a dry run to refresh recipients, then send when ready."
      );
      const path = data.resume_storage_path?.trim();
      if (path) {
        setPendingCampaignResumePath(path);
        setFile(null);
        setSelectedSavedResumeId(null);
      } else {
        setPendingCampaignResumePath(null);
        setFile(null);
        setSelectedSavedResumeId(null);
      }
      setCampaignLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignFromUrl]);

  useEffect(() => {
    if (!pendingCampaignResumePath || savedResumesLoading) return;
    const row = savedResumes.find(
      (r) => r.resume_storage_path === pendingCampaignResumePath
    );
    if (row) {
      void applyLibraryResume(row);
      setPendingCampaignResumePath(null);
    } else if (savedResumes.length > 0) {
      setPendingCampaignResumePath(null);
    }
  }, [
    pendingCampaignResumePath,
    savedResumes,
    savedResumesLoading,
    applyLibraryResume,
  ]);

  const companyReady =
    testMode || company.trim().length > 0;
  const campaignActionsLocked =
    loadedCampaign?.status?.toLowerCase() === "sent";
  const canSend =
    recipients.length > 0 &&
    reviewed &&
    loading === null &&
    !campaignActionsLocked;
  const companyInvalid = err && !companyReady;

  const appendMergeField = useCallback((token: string) => {
    setSelectedSavedTemplateId(null);
    setBodyText((current) => `${current}${current.endsWith("\n") ? "" : " "}${token}`);
  }, []);

  const runCampaign = useCallback(
    async (dryRun: boolean) => {
      if (!companyReady) {
        setErr(true);
        setMessage("Enter a company name before running the dry run.");
        return;
      }

      if (dryRun && campaignActionsLocked) {
        setErr(false);
        setMessage(
          "This campaign was already sent. Open a new campaign to run another dry run."
        );
        return;
      }

      if (!dryRun && !reviewed) {
        setErr(true);
        setMessage("Review all recipients and messages before sending.");
        return;
      }

      setLoading(dryRun ? "preview" : "send");
      setErr(false);
      setMessage(dryRun ? "Finding recruiters..." : "Sending campaign...");

      const fd = new FormData();
      fd.append("company", company.trim());
      fd.append("dry_run", dryRun ? "true" : "false");
      fd.append("test_mode", testMode ? "true" : "false");
      fd.append("subject", subject);
      fd.append("body_text", bodyText);
      if (file) fd.append("resume", file, file.name);
      const libraryRow = selectedSavedResumeId
        ? savedResumes.find((r) => r.id === selectedSavedResumeId)
        : undefined;
      if (libraryRow?.resume_storage_path) {
        fd.append("resume_storage_path", libraryRow.resume_storage_path);
      }

      let sendHeaders: Record<string, string> = {};
      if (isSupabaseConfigured()) {
        try {
          sendHeaders = await resumeApiAuthHeaders();
        } catch {
          /* Gmail send still works with session cookie; DB row needs owner id from cookie or future sign-in */
        }
      }

      try {
        const res = await fetch("/api/send", {
          method: "POST",
          body: fd,
          credentials: "include",
          headers: sendHeaders,
        });
        const data = (await res.json()) as SendResponse;

        if (!data.ok) {
          setErr(true);
          const authHint =
            res.status === 401 || data.auth_required
              ? " Sign in from the header or /login."
              : "";
          setMessage(
            (data.error ?? "The campaign could not be prepared.") + authHint
          );
          return;
        }

        if (data.dry_run) {
          const nextRecipients = data.recipients ?? [];
          setRecipients(nextRecipients);
          setReviewed(false);
          setMessage(
            nextRecipients.length === 0
              ? "Dry run finished, but no recipients were returned."
              : testMode
                ? `Test mode: loaded ${data.count ?? nextRecipients.length} test address (cyz1@test.com). Review, then send to confirm Gmail delivery.`
                : `Dry run found ${
                    data.count ?? nextRecipients.length
                  } recipient(s). Review each message before sending.`
          );
        } else {
          setRecipients([]);
          setReviewed(false);
          setMessage(
            testMode
              ? `Sent to ${data.sent ?? 0} test address. Confirm delivery in Gmail or at cyz1@test.com if you control that inbox.`
              : `Sent to ${data.sent ?? 0} recipient(s).`
          );
        }
      } catch {
        setErr(true);
        setMessage(
          "Could not reach the outreach server. Start the backend, then try the dry run again."
        );
      } finally {
        setLoading(null);
      }
    },
    [
      bodyText,
      campaignActionsLocked,
      company,
      companyReady,
      file,
      reviewed,
      savedResumes,
      selectedSavedResumeId,
      subject,
      testMode,
    ]
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void runCampaign(true);
      }}
      className="min-h-[calc(100vh-4rem)] pb-8 lg:pb-24"
    >
      <div className="mx-auto w-full max-w-[90rem] px-5 py-5 sm:px-8 lg:px-10 lg:py-7">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {campaignFromUrl
              ? loadedCampaign?.status?.toLowerCase() === "sent"
                ? "Campaign (sent)"
                : "Campaign"
              : "New campaign"}
          </h1>
          <p className="mt-2 text-base leading-7 text-muted-foreground">
            {campaignFromUrl
              ? "Review what you sent, or use Dry run / Send on drafts still in progress."
              : "Step 1 of 3. Find recruiters, draft emails, and review before you send."}
          </p>
          {campaignLoading ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              Loading campaign…
            </p>
          ) : null}
          {campaignLoadError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {campaignLoadError}{" "}
              <Link
                href="/dashboard"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Back to campaigns
              </Link>
            </p>
          ) : null}
          {campaignFromUrl && loadedCampaign && !campaignLoading ? (
            <p className="mt-3 text-sm">
              <Link
                href="/dashboard/new"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Start a new campaign
              </Link>
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(26rem,0.9fr)_minmax(34rem,1.35fr)]">
          <section className="flex min-w-0 flex-col gap-4">
            <SetupCard number="1" title="Target company">
              <Field data-invalid={companyInvalid || undefined}>
                <FieldLabel htmlFor="company">Company name</FieldLabel>
                <div className="relative">
                  <Input
                    id="company"
                    list="company-options"
                    value={company}
                    onChange={(event) => {
                      setCompany(event.target.value);
                      setRecipients([]);
                      setReviewed(false);
                    }}
                    placeholder="Palantir"
                    className="h-10 rounded-xl pr-11 text-base"
                    autoComplete="organization"
                    aria-invalid={companyInvalid || undefined}
                  />
                  {companyReady && (
                    <CheckCircle2
                      aria-hidden="true"
                      className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-primary"
                    />
                  )}
                </div>
                <datalist id="company-options">
                  {hints.map((hint) => (
                    <option key={hint} value={hint} />
                  ))}
                </datalist>
                <FieldDescription>
                  We&apos;ll find relevant recruiters using your data.
                  {hints.length > 0
                    ? ` Available: ${hints.slice(0, 4).join(", ")}.`
                    : ""}
                </FieldDescription>
                <Field orientation="horizontal" className="mt-4 rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
                  <Checkbox
                    id="test-mode"
                    checked={testMode}
                    onCheckedChange={(checked) => {
                      setTestMode(checked === true);
                      setRecipients([]);
                      setReviewed(false);
                    }}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="test-mode" className="font-semibold">
                      Test mode
                    </FieldLabel>
                    <FieldDescription className="text-xs leading-5">
                      Skip search and preview{" "}
                      <span className="font-medium text-foreground">
                        cyz1@test.com
                      </span>{" "}
                      so you can send real messages through Gmail and confirm the
                      pipeline. Use addresses you control or expect bounces.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </Field>
            </SetupCard>

            <SetupCard number="2" title="Email content">
              <FieldGroup className="gap-3">
                {isSupabaseConfigured() ? (
                  <Field>
                    <FieldLabel htmlFor="saved-template">
                      Use a saved template
                    </FieldLabel>
                    <select
                      id="saved-template"
                      disabled={
                        savedTemplatesLoading || savedTemplates.length === 0
                      }
                      value={selectedSavedTemplateId ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!value) {
                          setSelectedSavedTemplateId(null);
                          setSavedTemplatesError(null);
                          return;
                        }
                        const row = savedTemplates.find((t) => t.id === value);
                        if (!row) return;
                        setSubject(row.subject);
                        setBodyText(row.body_text);
                        setSelectedSavedTemplateId(row.id);
                        setSavedTemplatesError(null);
                      }}
                      className="h-10 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">
                        {savedTemplatesLoading
                          ? "Loading templates…"
                          : savedTemplates.length === 0
                            ? "No saved templates yet"
                            : "Choose a template…"}
                      </option>
                      {savedTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {savedTemplatesError ? (
                      <p className="mt-2 text-xs text-destructive" role="alert">
                        {savedTemplatesError}
                      </p>
                    ) : null}
                    <FieldDescription className="mt-2">
                      <Link
                        href="/dashboard/templates"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Create and manage templates
                      </Link>{" "}
                      in the dashboard.
                    </FieldDescription>
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="subject">Subject</FieldLabel>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(event) => {
                      setSelectedSavedTemplateId(null);
                      setSubject(event.target.value);
                    }}
                    placeholder="Fall 2026 software opportunities"
                    className="h-10 rounded-xl text-base"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="body">Message</FieldLabel>
                  <Textarea
                    id="body"
                    value={bodyText}
                    onChange={(event) => {
                      setSelectedSavedTemplateId(null);
                      setBodyText(event.target.value);
                    }}
                    rows={4}
                    placeholder={defaultMessage}
                    className="min-h-32 resize-y rounded-xl text-base leading-6"
                  />
                </Field>
              </FieldGroup>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg px-3 text-xs"
                >
                  Insert field
                  <ChevronDown data-icon="inline-end" aria-hidden="true" />
                </Button>
                {mergeFields.map((field) => (
                  <Button
                    key={field}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-lg px-2 text-xs text-primary"
                    onClick={() => appendMergeField(field)}
                  >
                    {field}
                  </Button>
                ))}
              </div>

              {isSupabaseConfigured() ? (
                <div className="mt-4 rounded-xl border border-border/80 bg-muted/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Save the current subject and message for reuse.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-lg"
                      onClick={() => {
                        setSaveTemplateErr(null);
                        setSaveTemplateOpen((open) => {
                          const next = !open;
                          if (next) {
                            const fromSubject = subject.trim().slice(0, 80);
                            setSaveTemplateName(
                              fromSubject || "My template"
                            );
                          }
                          return next;
                        });
                      }}
                    >
                      {saveTemplateOpen ? "Cancel" : "Save as template"}
                    </Button>
                  </div>
                  {saveTemplateOpen ? (
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <Field className="min-w-0 flex-1">
                        <FieldLabel htmlFor="save-template-name">
                          Template name
                        </FieldLabel>
                        <Input
                          id="save-template-name"
                          value={saveTemplateName}
                          onChange={(e) =>
                            setSaveTemplateName(e.target.value)
                          }
                          placeholder="e.g. Fall follow-up"
                          className="h-10 rounded-xl"
                        />
                      </Field>
                      <Button
                        type="button"
                        className="h-10 shrink-0 rounded-xl sm:w-auto"
                        disabled={
                          saveTemplateSaving ||
                          !subject.trim() ||
                          !bodyText.trim()
                        }
                        onClick={() => void (async () => {
                          const name = saveTemplateName.trim();
                          if (!name) {
                            setSaveTemplateErr("Enter a template name.");
                            return;
                          }
                          setSaveTemplateSaving(true);
                          setSaveTemplateErr(null);
                          const { row, error } = await createEmailTemplate({
                            name,
                            subject: subject.trim(),
                            body_text: bodyText,
                          });
                          setSaveTemplateSaving(false);
                          if (error || !row) {
                            setSaveTemplateErr(
                              error?.message ?? "Could not save template."
                            );
                            return;
                          }
                          setSavedTemplates((current) => [row, ...current]);
                          setSelectedSavedTemplateId(row.id);
                          setSaveTemplateOpen(false);
                        })()}
                      >
                        {saveTemplateSaving ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          "Save to library"
                        )}
                      </Button>
                    </div>
                  ) : null}
                  {saveTemplateErr ? (
                    <p
                      className="mt-3 text-xs text-destructive"
                      role="alert"
                    >
                      {saveTemplateErr}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </SetupCard>

            <SetupCard number="3" title="Attach resume" label="optional">
              {isSupabaseConfigured() ? (
                <Field className="mb-4">
                  <FieldLabel htmlFor="saved-resume">
                    Use a saved resume
                  </FieldLabel>
                  <select
                    id="saved-resume"
                    disabled={
                      savedResumesLoading ||
                      libraryAttachLoading ||
                      savedResumes.length === 0
                    }
                    value={selectedSavedResumeId ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) {
                        setFile(null);
                        setSelectedSavedResumeId(null);
                        setSavedResumesError(null);
                        return;
                      }
                      const row = savedResumes.find((r) => r.id === value);
                      if (row) void applyLibraryResume(row);
                    }}
                    className="h-10 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">
                      {savedResumesLoading
                        ? "Loading saved resumes…"
                        : savedResumes.length === 0
                          ? "No saved resumes yet"
                          : "Choose from library…"}
                    </option>
                    {savedResumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.display_name}
                        {r.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  {savedResumesError ? (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {savedResumesError}
                    </p>
                  ) : null}
                  <FieldDescription className="mt-2">
                    <Link
                      href="/dashboard/resumes"
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Upload and manage resumes
                    </Link>{" "}
                    in the library.
                  </FieldDescription>
                </Field>
              ) : null}

              <Field>
                <FieldLabel htmlFor="resume" className="sr-only">
                  Resume attachment
                </FieldLabel>
                {libraryAttachLoading ? (
                  <div className="flex min-h-16 items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-5 py-4 text-sm text-muted-foreground">
                    <Loader2
                      className="size-5 shrink-0 animate-spin"
                      aria-hidden="true"
                    />
                    Attaching resume from library…
                  </div>
                ) : file ? (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                      <FileText aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Math.max(1, Math.round(file.size / 1024))} KB
                        {selectedSavedResumeId ? (
                          <span className="text-primary"> · From library</span>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove resume"
                      onClick={() => {
                        setFile(null);
                        setSelectedSavedResumeId(null);
                      }}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor="resume"
                    className="flex min-h-16 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted px-5 py-3 text-center transition hover:border-primary/40 hover:bg-accent"
                  >
                    <Input
                      id="resume"
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      onChange={(event) => {
                        setSelectedSavedResumeId(null);
                        setFile(event.target.files?.[0] ?? null);
                      }}
                    />
                    <Upload
                      aria-hidden="true"
                      className="mb-1 size-5 text-primary"
                    />
                    <span className="text-sm font-semibold text-foreground">
                      Upload resume PDF
                    </span>
                  </label>
                )}
                <FieldDescription>PDF only. Max 10 MB.</FieldDescription>
              </Field>
            </SetupCard>
          </section>

          <ReviewPanel
            recipients={recipients}
            bodyText={bodyText}
            company={company}
            testMode={testMode}
            loading={loading}
            err={err}
            message={message}
            actionsLocked={campaignActionsLocked}
          />
        </div>
      </div>

      <div
        data-testid="campaign-action-bar"
        className="border-t border-border bg-background/95 backdrop-blur-xl lg:fixed lg:inset-x-0 lg:bottom-0 lg:z-40"
      >
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-3 px-5 py-3 sm:px-8 lg:min-h-16 lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:py-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              type="submit"
              variant="outline"
              size="lg"
              disabled={loading !== null || campaignActionsLocked}
              className="min-h-10 rounded-xl px-6"
            >
              {loading === "preview" && (
                <Loader2
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              Dry run
            </Button>
            <p className="text-sm font-medium text-muted-foreground sm:min-w-36 sm:whitespace-nowrap">
              {recipients.length > 0
                ? `${recipients.length} recipients found`
                : "No recipients found yet"}
            </p>
          </div>

          <Field
            orientation="horizontal"
            data-disabled={
              recipients.length === 0 || campaignActionsLocked || undefined
            }
            className="rounded-xl px-0"
          >
            <Checkbox
              id="reviewed"
              checked={reviewed}
              onCheckedChange={(checked) => setReviewed(checked === true)}
              disabled={recipients.length === 0 || campaignActionsLocked}
            />
            <FieldContent>
              <FieldLabel htmlFor="reviewed">
                I have reviewed all recipients and messages
              </FieldLabel>
            </FieldContent>
          </Field>

          <Button
            type="button"
            disabled={!canSend}
            onClick={() => void runCampaign(false)}
            size="lg"
            className="min-h-10 rounded-xl px-8"
          >
            {loading === "send" ? (
              <Loader2
                data-icon="inline-start"
                aria-hidden="true"
                className="animate-spin"
              />
            ) : (
              <SendHorizontal data-icon="inline-start" aria-hidden="true" />
            )}
            {loading === "send" ? "Sending..." : "Send campaign"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function SetupCard({
  number,
  title,
  label,
  children,
}: {
  number: string;
  title: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <Card size="sm" className="rounded-2xl bg-card shadow-sm">
      <CardHeader className="px-5">
        <div className="flex items-center gap-3">
          <Badge
            variant="secondary"
            className="size-7 shrink-0 rounded-full p-0 text-sm font-bold"
          >
            {number}
          </Badge>
          <CardTitle className="text-lg">{title}</CardTitle>
          {label && (
            <span className="text-sm font-medium text-muted-foreground">
              ({label})
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

function ReviewPanel({
  recipients,
  bodyText,
  company,
  testMode,
  loading,
  err,
  message,
  actionsLocked = false,
}: {
  recipients: Recipient[];
  bodyText: string;
  company: string;
  testMode: boolean;
  loading: "preview" | "send" | null;
  err: boolean;
  message: string;
  actionsLocked?: boolean;
}) {
  return (
    <Card size="sm" className="min-w-0 rounded-2xl bg-card shadow-sm">
      <CardHeader className="px-5">
        <div className="flex items-center gap-3">
          <Badge
            variant="secondary"
            className="size-7 shrink-0 rounded-full p-0 text-sm font-bold"
          >
            4
          </Badge>
          <CardTitle className="text-lg">
            Review recipients ({recipients.length})
            {testMode ? (
              <Badge variant="outline" className="ml-2 align-middle text-xs font-medium">
                Test mode
              </Badge>
            ) : null}
          </CardTitle>
        </div>
        <CardAction>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={loading !== null || actionsLocked}
            className="text-primary"
          >
            {loading === "preview" ? (
              <Loader2
                data-icon="inline-start"
                aria-hidden="true"
                className="animate-spin"
              />
            ) : (
              <RefreshCcw data-icon="inline-start" aria-hidden="true" />
            )}
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-5">
        <div className="max-h-none overflow-y-visible pr-0 xl:max-h-[calc(100vh-25rem)] xl:overflow-y-auto xl:pr-1">
          {recipients.length === 0 ? (
            <Empty className="min-h-64 border border-dashed border-border bg-muted">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRound aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No recipients yet</EmptyTitle>
                <EmptyDescription>
                  {testMode
                    ? "Run Dry run to load fake test addresses (no SerpAPI)."
                    : "Run a dry run to find recruiter contacts and preview messages."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-6">
              {recipients.map((recipient, index) => (
                <RecipientReview
                  key={`${recipient.email ?? "recipient"}-${index}`}
                  recipient={recipient}
                  bodyText={bodyText}
                  company={company}
                />
              ))}
            </div>
          )}
        </div>

        <Alert
          role={err ? "alert" : "status"}
          variant={err ? "destructive" : "default"}
          className={cn(
            "mt-5",
            !err && "border-primary/20 bg-accent text-accent-foreground"
          )}
        >
          {err ? (
            <AlertCircle aria-hidden="true" />
          ) : (
            <ShieldCheck aria-hidden="true" />
          )}
          <AlertTitle>{err ? "Needs attention" : "Review mode"}</AlertTitle>
          <AlertDescription
            className={cn(!err && "text-accent-foreground/80")}
          >
            {message}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function RecipientReview({
  recipient,
  bodyText,
  company,
}: {
  recipient: Recipient;
  bodyText: string;
  company: string;
}) {
  const name = recipient.greeting_name || recipientNameFromEmail(recipient.email);
  const snippet = previewSnippet(bodyText, name, company);

  return (
    <article className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <Avatar size="lg">
        <AvatarFallback>{recipientInitial(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-foreground">
          {name || "Recruiter"}
        </h3>
        <p className="mt-1 truncate text-sm text-muted-foreground">
          Recruiting contact
          {recipient.email ? ` - ${recipient.email}` : ""}
        </p>
        <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-sm leading-6 text-muted-foreground">
          {snippet}
        </div>
      </div>
      <Button type="button" variant="outline" className="min-h-11 rounded-xl">
        <Eye data-icon="inline-start" aria-hidden="true" />
        Preview
      </Button>
    </article>
  );
}

function recipientInitial(name?: string) {
  return (name?.trim().charAt(0) || "R").toUpperCase();
}

function recipientNameFromEmail(email?: string) {
  if (!email) return "Recruiter";
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function previewSnippet(bodyText: string, name: string, company: string) {
  const resolved = (bodyText.trim() || defaultMessage)
    .replaceAll("{{first_name}}", name || "there")
    .replaceAll("__FIRST_NAME__", name || "there")
    .replaceAll("{{company}}", company || "the company")
    .replaceAll("{{role}}", "recruiting");

  return `${resolved.replace(/\s+/g, " ").slice(0, 128)}...`;
}
