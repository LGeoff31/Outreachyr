"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCcw,
  SendHorizontal,
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
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AutosizeTextarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiErrorMessage, readApiResponse, type ApiErrorBody } from "@/lib/apiError";
import { fetchCompanyKeys } from "@/lib/api";
import {
  diagnoseGmailSendFailure,
  syncGmailSendSession,
} from "@/lib/gmailSession";
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

type SendResponse = ApiErrorBody & {
  dry_run?: boolean;
  count?: number;
  recipients?: Recipient[];
  sent?: number;
};

const defaultCompany = "Palantir";
const defaultSubject =
  "Fall 2026 Software Engineering Opportunities at Palantir";
const defaultMessage = `Hi {{first_name}},

I'm a CS student interested in building impactful software at {{company}}.

I'm reaching out to learn more about opportunities for Fall 2026.`;

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
  const [message, setMessage] = useState("");
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
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

  useEffect(() => {
    void syncGmailSendSession();
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
      setMessage("");
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
          ? "This campaign was already sent."
          : "Campaign loaded."
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
      setErrorDetails(null);
      setMessage(dryRun ? "Finding recruiters..." : "Sending campaign...");

      if (!dryRun) {
        await syncGmailSendSession();
      }

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
        const { data, text } = await readApiResponse(res);
        const payload = data as SendResponse | null;

        if (!payload?.ok) {
          setErr(true);
          setMessage(
            apiErrorMessage(
              payload,
              text,
              "The campaign could not be prepared."
            )
          );
          if (res.status === 401 || payload?.auth_required) {
            setErrorDetails(
              await diagnoseGmailSendFailure({
                sendStatus: res.status,
                sendData: payload,
                sendText: text,
              })
            );
          } else {
            setErrorDetails(
              [
                `HTTP ${res.status}`,
                payload?.code ? `code=${payload.code}` : null,
                payload?.detail ?? null,
                !payload?.error && text ? text.slice(0, 180) : null,
              ]
                .filter(Boolean)
                .join(" · ")
            );
          }
          return;
        }

        if (payload.dry_run) {
          const nextRecipients = payload.recipients ?? [];
          setRecipients(nextRecipients);
          setReviewed(false);
          setMessage(
            nextRecipients.length === 0
              ? "No recipients found."
              : testMode
                ? `${payload.count ?? nextRecipients.length} test recipient loaded.`
                : `${payload.count ?? nextRecipients.length} recipients found.`
          );
        } else {
          setRecipients([]);
          setReviewed(false);
          setMessage(
            testMode
              ? `Sent to ${payload.sent ?? 0} test address.`
              : `Sent to ${payload.sent ?? 0} recipient(s).`
          );
        }
      } catch (e) {
        setErr(true);
        setMessage("Could not reach the outreach server.");
        setErrorDetails(
          e instanceof Error ? e.message : "Network error while calling /api/send"
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {campaignFromUrl
              ? loadedCampaign?.status?.toLowerCase() === "sent"
                ? "Campaign (sent)"
                : "Campaign"
              : "New campaign"}
          </h1>
          {campaignLoading ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin"
              />
              Loading campaign…
            </p>
          ) : null}
          {campaignLoadError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
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
            <p className="mt-2 text-sm">
              <Link
                href="/dashboard/new"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Start a new campaign
              </Link>
            </p>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(34rem,1.15fr)]">
          <Card className="min-w-0 overflow-hidden rounded-2xl bg-card shadow-sm">
            <CardContent className="p-0">
              <div className="px-5 py-4">
                <Field data-invalid={companyInvalid || undefined}>
                  <FieldLabel
                    htmlFor="company"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Company
                  </FieldLabel>
                  <div className="relative mt-2">
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
                      className="h-10 rounded-xl pr-11 text-sm font-medium"
                      autoComplete="organization"
                      aria-invalid={companyInvalid || undefined}
                    />
                    {companyReady && (
                      <CheckCircle2
                        aria-hidden="true"
                        className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-primary"
                      />
                    )}
                  </div>
                  <datalist id="company-options">
                    {hints.map((hint) => (
                      <option key={hint} value={hint} />
                    ))}
                  </datalist>
                </Field>
                <Field
                  orientation="horizontal"
                  className="mt-3 items-center gap-2"
                >
                  <Checkbox
                    id="test-mode"
                    checked={testMode}
                    onCheckedChange={(checked) => {
                      setTestMode(checked === true);
                      setRecipients([]);
                      setReviewed(false);
                    }}
                  />
                  <FieldLabel
                    htmlFor="test-mode"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Test mode
                  </FieldLabel>
                </Field>
              </div>

              {isSupabaseConfigured() ? (
                <>
                  <Separator />
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <FieldLabel
                        htmlFor="saved-template"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Use Email Template{" "}
                        <span className="font-normal">(optional)</span>
                      </FieldLabel>
                      <Link
                        href="/dashboard/templates"
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Create in Templates
                      </Link>
                    </div>
                    {savedTemplates.length > 0 ? (
                      <select
                        id="saved-template"
                        disabled={savedTemplatesLoading}
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
                        className="mt-2 h-9 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="">
                          {savedTemplatesLoading ? "Loading…" : "None"}
                        </option>
                        {savedTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : savedTemplatesLoading ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Loading…
                      </p>
                    ) : null}
                    {savedTemplatesError ? (
                      <p className="mt-2 text-xs text-destructive" role="alert">
                        {savedTemplatesError}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}

              <Separator />

              <div className="px-5 py-4">
                <Field>
                  <FieldLabel
                    htmlFor="subject"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Subject
                  </FieldLabel>
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(event) => {
                      setSelectedSavedTemplateId(null);
                      setSubject(event.target.value);
                    }}
                    placeholder="Fall 2026 software opportunities"
                    className="mt-2 h-10 rounded-xl text-sm font-medium"
                  />
                </Field>
              </div>

              <Separator />

              <div className="px-5 py-4">
                <Field>
                  <FieldLabel
                    htmlFor="body"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Message
                  </FieldLabel>
                  <AutosizeTextarea
                    id="body"
                    value={bodyText}
                    onChange={(event) => {
                      setSelectedSavedTemplateId(null);
                      setBodyText(event.target.value);
                    }}
                    placeholder={defaultMessage}
                    className="mt-2 rounded-xl text-sm leading-relaxed"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    First name and company will be auto-populated for each
                    recipient when sent.
                  </p>
                </Field>
                {isSupabaseConfigured() ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg px-2 text-xs text-muted-foreground"
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
                ) : null}
                {saveTemplateOpen ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field className="min-w-0 flex-1">
                      <Input
                        id="save-template-name"
                        value={saveTemplateName}
                        onChange={(e) => setSaveTemplateName(e.target.value)}
                        placeholder="Template name"
                        className="h-9 rounded-xl text-sm"
                        aria-label="Template name"
                      />
                    </Field>
                    <Button
                      type="button"
                      className="h-9 shrink-0 rounded-xl sm:w-auto"
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
                        "Save"
                      )}
                    </Button>
                  </div>
                ) : null}
                {saveTemplateErr ? (
                  <p className="mt-2 text-xs text-destructive" role="alert">
                    {saveTemplateErr}
                  </p>
                ) : null}
              </div>

              <Separator />

              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel className="text-xs font-medium text-muted-foreground">
                    Resume <span className="font-normal">(optional)</span>
                  </FieldLabel>
                  {isSupabaseConfigured() ? (
                    <Link
                      href="/dashboard/resumes"
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Manage
                    </Link>
                  ) : null}
                </div>
                {isSupabaseConfigured() && savedResumes.length > 0 ? (
                  <select
                    id="saved-resume"
                    aria-label="Saved resume"
                    disabled={savedResumesLoading || libraryAttachLoading}
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
                    className="mt-2 h-9 w-full appearance-none rounded-xl border border-input bg-card px-3 text-sm font-medium text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">
                      {savedResumesLoading
                        ? "Loading…"
                        : "From library…"}
                    </option>
                    {savedResumes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.display_name}
                        {r.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                {savedResumesError ? (
                  <p className="mt-2 text-xs text-destructive" role="alert">
                    {savedResumesError}
                  </p>
                ) : null}
                <Field className="mt-3">
                  <FieldLabel htmlFor="resume" className="sr-only">
                    Resume attachment
                  </FieldLabel>
                  {libraryAttachLoading ? (
                    <div className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                      <Loader2
                        className="size-4 shrink-0 animate-spin"
                        aria-hidden="true"
                      />
                      Attaching…
                    </div>
                  ) : file ? (
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                        <FileText aria-hidden="true" className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {Math.max(1, Math.round(file.size / 1024))} KB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
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
                      className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm transition hover:border-primary/40 hover:bg-accent"
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
                        className="size-4 text-primary"
                      />
                      <span className="font-medium text-foreground">
                        Upload PDF
                      </span>
                    </label>
                  )}
                </Field>
              </div>
            </CardContent>
          </Card>

          <ReviewPanel
            recipients={recipients}
            bodyText={bodyText}
            company={company}
            subject={subject}
            testMode={testMode}
            loading={loading}
            err={err}
            message={message}
            errorDetails={errorDetails}
            actionsLocked={campaignActionsLocked}
          />
        </div>
      </div>

      <div
        data-testid="campaign-action-bar"
        className="border-t border-border bg-background/95 backdrop-blur-xl lg:fixed lg:bottom-0 lg:left-56 lg:right-0 lg:z-30"
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
              Fetch recruiters
            </Button>
            {recipients.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {recipients.length} found
              </p>
            ) : null}
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
                Reviewed all messages
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

function ReviewPanel({
  recipients,
  bodyText,
  company,
  subject,
  testMode,
  loading,
  err,
  message,
  errorDetails,
  actionsLocked = false,
}: {
  recipients: Recipient[];
  bodyText: string;
  company: string;
  subject: string;
  testMode: boolean;
  loading: "preview" | "send" | null;
  err: boolean;
  message: string;
  errorDetails: string | null;
  actionsLocked?: boolean;
}) {
  return (
    <Card size="sm" className="min-w-0 overflow-hidden rounded-2xl bg-card shadow-sm">
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="text-base font-semibold">
          Preview
          {recipients.length > 0 ? (
            <span className="ml-2 font-normal text-muted-foreground">
              ({recipients.length})
            </span>
          ) : null}
          {testMode ? (
            <Badge variant="outline" className="ml-2 align-middle text-xs font-medium">
              Test
            </Badge>
          ) : null}
        </CardTitle>
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
      <CardContent className="p-0">
        <div className="max-h-none overflow-y-visible px-5 py-4 xl:max-h-[calc(100vh-18rem)] xl:overflow-y-auto">
          {recipients.length === 0 ? (
            <Empty className="min-h-56 border border-dashed border-border bg-muted/30">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRound aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No recipients yet</EmptyTitle>
                <EmptyDescription>
                  Fetch recruiters to preview outgoing mail.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              {recipients.map((recipient, index) => (
                <RecipientReview
                  key={`${recipient.email ?? "recipient"}-${index}`}
                  recipient={recipient}
                  bodyText={bodyText}
                  company={company}
                  subject={subject}
                />
              ))}
            </div>
          )}
        </div>

        {message || errorDetails ? (
          <Alert
            role={err ? "alert" : "status"}
            variant={err ? "destructive" : "default"}
            className={cn(
              "mx-5 mb-5 rounded-xl",
              !err && "border-primary/20 bg-accent text-accent-foreground"
            )}
          >
            {err ? (
              <AlertCircle aria-hidden="true" />
            ) : null}
            {err ? (
              <AlertTitle>Error</AlertTitle>
            ) : null}
            <AlertDescription
              className={cn(!err && "text-accent-foreground/80")}
            >
              {message}
              {err && errorDetails ? (
                <span className="mt-2 block font-mono text-xs leading-relaxed text-destructive/90">
                  {errorDetails}
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RecipientReview({
  recipient,
  bodyText,
  company,
  subject,
}: {
  recipient: Recipient;
  bodyText: string;
  company: string;
  subject: string;
}) {
  const name = recipient.greeting_name || recipientNameFromEmail(recipient.email);
  const snippet = previewSnippet(bodyText, name, company);

  return (
    <article className="rounded-xl border border-border bg-muted/25 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="text-[0.65rem]">
            {recipientInitial(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {name || "Recruiter"}
            {recipient.email ? (
              <span className="text-muted-foreground"> · {recipient.email}</span>
            ) : null}
          </p>
          <p className="mt-1 line-clamp-1 text-xs font-semibold text-foreground">
            {subject}
          </p>
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {snippet}
          </p>
        </div>
      </div>
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
  return (bodyText.trim() || defaultMessage)
    .replaceAll("{{first_name}}", name || "there")
    .replaceAll("__FIRST_NAME__", name || "there")
    .replaceAll("{{company}}", company || "the company")
    .replaceAll("{{role}}", "recruiting");
}
