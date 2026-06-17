"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Search,
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
  EmptyContent,
} from "@/components/ui/empty";
import {
  Field,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AutosizeTextarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiErrorMessage, readApiResponse, type ApiErrorBody } from "@/lib/apiError";
import {
  fetchBillingStatus,
  startCampaignUnlockCheckout,
  type BillingStatus,
} from "@/lib/billing";
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
  uploadUserResumePdf,
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
  queued?: boolean;
  billing?: BillingStatus;
  code?: string;
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
  const [saveTemplateSaving, setSaveTemplateSaving] = useState(false);
  const [saveTemplateSaved, setSaveTemplateSaved] = useState(false);
  const [saveTemplateErr, setSaveTemplateErr] = useState<string | null>(null);
  const [saveResumeSaving, setSaveResumeSaving] = useState(false);
  const [saveResumeSaved, setSaveResumeSaved] = useState(false);
  const [saveResumeErr, setSaveResumeErr] = useState<string | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [message, setMessage] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendQueued, setSendQueued] = useState(false);
  const [celebrateSend, setCelebrateSend] = useState(0);
  const sendButtonWrapRef = useRef<HTMLSpanElement>(null);
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
  const [resumePreviewUrl, setResumePreviewUrl] = useState<string | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(
    null
  );
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    void fetchBillingStatus().then(setBillingStatus);
  }, []);

  useEffect(() => {
    fetchCompanyKeys()
      .then(setHints)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void syncGmailSendSession();
  }, []);

  useEffect(() => {
    if (celebrateSend === 0) return;
    let cancelled = false;
    const run = async () => {
      const { default: confetti } = await import("canvas-confetti");
      if (cancelled) return;
      const rect = sendButtonWrapRef.current?.getBoundingClientRect();
      const origin = {
        x: rect
          ? (rect.left + rect.width / 2) / window.innerWidth
          : 0.85,
        y: rect
          ? (rect.top + rect.height / 2) / window.innerHeight
          : 0.92,
      };
      const base = {
        origin,
        zIndex: 80,
        disableForReducedMotion: true,
      } as const;
      confetti({
        ...base,
        particleCount: 100,
        spread: 70,
        startVelocity: 40,
        colors: ["#3b82f6", "#6366f1", "#22c55e", "#f59e0b", "#f1f5f9"],
      });
      await new Promise((r) => setTimeout(r, 160));
      if (cancelled) return;
      confetti({
        ...base,
        particleCount: 60,
        spread: 95,
        startVelocity: 30,
        scalar: 0.85,
        ticks: 240,
        colors: ["#60a5fa", "#a78bfa", "#4ade80", "#fde047"],
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [celebrateSend]);

  useEffect(() => {
    if (!file) {
      setResumePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setResumePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
  const billingBlocked =
    !testMode &&
    billingStatus?.billing_enabled === true &&
    billingStatus.can_send === false;
  const canSend =
    recipients.length > 0 &&
    loading === null &&
    !campaignActionsLocked &&
    !billingBlocked;
  const sendBlockedReason =
    canSend || loading === "send"
      ? undefined
      : billingBlocked
        ? "Pay $5 once to unlock more campaigns."
        : campaignActionsLocked
          ? "This campaign was already sent."
          : loading === "preview"
            ? "Wait for recruiter search to finish."
            : recipients.length === 0
              ? "Fetch recruiters first."
              : undefined;
  const companyInvalid = err && !companyReady;

  const saveAsTemplate = useCallback(async () => {
    if (!subject.trim() || !bodyText.trim()) {
      setSaveTemplateErr("Add a subject and message first.");
      setSaveTemplateSaved(false);
      return;
    }

    setSaveTemplateSaving(true);
    setSaveTemplateErr(null);
    setSaveTemplateSaved(false);

    const name = subject.trim().slice(0, 80) || "My template";
    const { row, error } = await createEmailTemplate({
      name,
      subject: subject.trim(),
      body_text: bodyText,
    });

    setSaveTemplateSaving(false);

    if (error || !row) {
      setSaveTemplateErr(error?.message ?? "Could not save template.");
      return;
    }

    setSavedTemplates((current) => [row, ...current]);
    setSelectedSavedTemplateId(row.id);
    setSaveTemplateSaved(true);
    window.setTimeout(() => setSaveTemplateSaved(false), 2000);
  }, [bodyText, subject]);

  const saveAsResume = useCallback(async () => {
    if (!file) {
      setSaveResumeErr("Upload a resume first.");
      setSaveResumeSaved(false);
      return;
    }
    if (selectedSavedResumeId) {
      setSaveResumeSaved(true);
      window.setTimeout(() => setSaveResumeSaved(false), 2000);
      return;
    }

    setSaveResumeSaving(true);
    setSaveResumeErr(null);
    setSaveResumeSaved(false);

    const { row, error } = await uploadUserResumePdf(file);

    setSaveResumeSaving(false);

    if (error || !row) {
      setSaveResumeErr(error?.message ?? "Could not save resume.");
      return;
    }

    setSavedResumes((current) => [row, ...current]);
    setSelectedSavedResumeId(row.id);
    setSaveResumeSaved(true);
    window.setTimeout(() => setSaveResumeSaved(false), 2000);
  }, [file, selectedSavedResumeId]);

  const resetFormFields = useCallback(() => {
    setCompany(defaultCompany);
    setSubject(defaultSubject);
    setBodyText(defaultMessage);
    setFile(null);
    setSelectedSavedResumeId(null);
    setSelectedSavedTemplateId(null);
    setTestMode(false);
    setErr(false);
    setErrorDetails(null);

    const defaultRow = savedResumes.find((r) => r.is_default);
    if (defaultRow) {
      void applyLibraryResume(defaultRow);
    }
  }, [applyLibraryResume, savedResumes]);

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

      if (
        !dryRun &&
        !testMode &&
        billingStatus?.billing_enabled &&
        !billingStatus.can_send
      ) {
        setShowPaywall(true);
        return;
      }

      setLoading(dryRun ? "preview" : "send");
      setErr(false);
      setSendSuccess(false);
      setSendQueued(false);
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
          if (res.status === 402 || payload?.code === "campaign_limit") {
            if (payload?.billing) setBillingStatus(payload.billing);
            setShowPaywall(true);
            setErrorDetails(null);
            return;
          }
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
          setSendSuccess(false);
          setMessage(
            nextRecipients.length === 0
              ? "No recipients found."
              : testMode
                ? `${payload.count ?? nextRecipients.length} test recipient loaded.`
                : `${payload.count ?? nextRecipients.length} recipients found.`
          );
        } else {
          const recipientCount = payload.sent ?? payload.count ?? 0;
          const queued = payload.queued === true;
          setRecipients([]);
          setSendSuccess(true);
          setSendQueued(queued);
          setCelebrateSend((n) => n + 1);
          void fetchBillingStatus().then(setBillingStatus);
          if (testMode) {
            setMessage(
              queued
                ? `Sending to your test address in the background. Emails are spaced out in small batches so they don't look like spam — check your Sent folder shortly.`
                : `Sent to ${recipientCount} test address. Check your sent folder to confirm delivery.`
            );
          } else if (queued) {
            setMessage(
              `Campaign started for ${recipientCount} recipient(s). Emails are sent in spaced batches from your Gmail account (not all at once) to protect deliverability. Check your Sent folder over the next several minutes.`
            );
          } else {
            setMessage(
              `Sent to ${recipientCount} recipient(s). Check your inbox for replies.`
            );
          }
          resetFormFields();
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
      billingStatus,
      campaignActionsLocked,
      company,
      companyReady,
      file,
      savedResumes,
      selectedSavedResumeId,
      subject,
      testMode,
      resetFormFields,
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
                            {t.subject}
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
                    <code className="font-mono text-[0.7rem] text-foreground/80">
                      {"{{first_name}}"}
                    </code>{" "}
                    and{" "}
                    <code className="font-mono text-[0.7rem] text-foreground/80">
                      {"{{company}}"}
                    </code>{" "}
                    are auto-populated for each recipient when sent.
                  </p>
                </Field>
                {isSupabaseConfigured() ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saveTemplateSaving}
                      className={cn(
                        "h-8 rounded-lg px-2 text-xs",
                        saveTemplateSaved
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                      onClick={() => void saveAsTemplate()}
                    >
                      {saveTemplateSaving ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Saving…
                        </>
                      ) : saveTemplateSaved ? (
                        <>
                          <CheckCircle2 className="size-3.5" />
                          Saved
                        </>
                      ) : (
                        "Save as template"
                      )}
                    </Button>
                    {saveTemplateErr ? (
                      <p className="mt-1 text-xs text-destructive" role="alert">
                        {saveTemplateErr}
                      </p>
                    ) : null}
                  </div>
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
                      Create in Resumes
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
                      {savedResumesLoading ? "Loading…" : "None"}
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
                {isSupabaseConfigured() && file ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saveResumeSaving}
                      className={cn(
                        "h-8 rounded-lg px-2 text-xs",
                        saveResumeSaved
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                      onClick={() => void saveAsResume()}
                    >
                      {saveResumeSaving ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Saving…
                        </>
                      ) : saveResumeSaved ? (
                        <>
                          <CheckCircle2 className="size-3.5" />
                          Saved
                        </>
                      ) : (
                        "Save as resume"
                      )}
                    </Button>
                    {saveResumeErr ? (
                      <p className="mt-1 text-xs text-destructive" role="alert">
                        {saveResumeErr}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <ReviewPanel
            recipients={recipients}
            bodyText={bodyText}
            company={company}
            subject={subject}
            resumeFileName={file?.name ?? null}
            resumePreviewUrl={resumePreviewUrl}
            testMode={testMode}
            loading={loading}
            err={err}
            message={message}
            errorDetails={errorDetails}
            sendSuccess={sendSuccess}
            sendQueued={sendQueued}
            actionsLocked={campaignActionsLocked}
          />
        </div>
      </div>

      <div
        data-testid="campaign-action-bar"
        className="border-t border-border bg-background/95 backdrop-blur-xl lg:fixed lg:bottom-0 lg:left-56 lg:right-0 lg:z-30"
      >
        <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-3 px-5 py-3 sm:px-8 lg:min-h-16 lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:py-2">
          <div className="flex shrink-0 items-center">
            {loading === "preview" ? (
              <p className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                Finding recruiters…
              </p>
            ) : recipients.length > 0 ? (
              <p className="whitespace-nowrap text-sm text-muted-foreground">
                {recipients.length} found
              </p>
            ) : null}
          </div>

          <span
            ref={sendButtonWrapRef}
            className={cn(
              "group relative inline-flex",
              !canSend && loading !== "send" && "cursor-not-allowed"
            )}
          >
            {sendBlockedReason ? (
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-foreground px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
              >
                {sendBlockedReason}
              </span>
            ) : null}
            <Button
              type="button"
              disabled={!canSend}
              onClick={() => void runCampaign(false)}
              size="lg"
              className={cn(
                "min-h-10 rounded-xl px-8",
                !canSend && loading !== "send" && "pointer-events-none"
              )}
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
          </span>
        </div>
      </div>

      {showPaywall ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-black/50"
            aria-label="Close unlock dialog"
            onClick={() => setShowPaywall(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="campaign-paywall-title"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="border-b border-border px-5 py-4">
              <h2
                id="campaign-paywall-title"
                className="text-lg font-semibold text-foreground"
              >
                Unlock unlimited campaigns
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                You&apos;ve used your 3 free campaigns. Pay $5 once to send as
                many campaigns as you need — no subscription.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              {checkoutError ? (
                <p className="text-sm text-destructive" role="alert">
                  {checkoutError}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={checkoutLoading}
                onClick={() => setShowPaywall(false)}
              >
                Not now
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={checkoutLoading}
                onClick={() => {
                  setCheckoutLoading(true);
                  setCheckoutError(null);
                  void startCampaignUnlockCheckout().catch((e: unknown) => {
                    setCheckoutError(
                      e instanceof Error
                        ? e.message
                        : "Could not start checkout."
                    );
                    setCheckoutLoading(false);
                  });
                }}
              >
                {checkoutLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Redirecting…
                  </>
                ) : (
                  "Unlock for $5"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function ReviewPanel({
  recipients,
  bodyText,
  company,
  subject,
  resumeFileName,
  resumePreviewUrl,
  testMode,
  loading,
  err,
  message,
  errorDetails,
  sendSuccess = false,
  sendQueued = false,
  actionsLocked = false,
}: {
  recipients: Recipient[];
  bodyText: string;
  company: string;
  subject: string;
  resumeFileName: string | null;
  resumePreviewUrl: string | null;
  testMode: boolean;
  loading: "preview" | "send" | null;
  err: boolean;
  message: string;
  errorDetails: string | null;
  sendSuccess?: boolean;
  sendQueued?: boolean;
  actionsLocked?: boolean;
}) {
  const [fullPreview, setFullPreview] = useState<Recipient | null>(null);

  useEffect(() => {
    if (!fullPreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullPreview]);

  return (
    <>
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
            variant="secondary"
            size="sm"
            disabled={loading !== null || actionsLocked}
            className="min-h-9 gap-2 rounded-xl"
          >
            {loading === "preview" ? (
              <Loader2
                data-icon="inline-start"
                aria-hidden="true"
                className="animate-spin"
              />
            ) : (
              <Search data-icon="inline-start" aria-hidden="true" />
            )}
            Fetch recruiters
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
                  Find recruiters for your target company, then preview each
                  email here.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={loading !== null || actionsLocked}
                  className="min-h-10 gap-2 rounded-xl"
                >
                  {loading === "preview" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="size-4" aria-hidden />
                  )}
                  Fetch recruiters
                </Button>
              </EmptyContent>
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
                  onViewFull={() => setFullPreview(recipient)}
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
              err && "destructive",
              !err && sendSuccess && "border-primary/30 bg-primary/10 text-foreground",
              !err && !sendSuccess && "border-primary/20 bg-accent text-accent-foreground"
            )}
          >
            {err ? (
              <AlertCircle aria-hidden="true" />
            ) : sendSuccess ? (
              <CheckCircle2 aria-hidden="true" />
            ) : null}
            {err ? (
              <AlertTitle>Error</AlertTitle>
            ) : sendSuccess ? (
              <AlertTitle>
                {sendQueued ? "Campaign sending" : "Campaign sent"}
              </AlertTitle>
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

    {fullPreview ? (
      <EmailFullPreview
        recipient={fullPreview}
        subject={subject}
        bodyText={bodyText}
        company={company}
        resumeFileName={resumeFileName}
        resumePreviewUrl={resumePreviewUrl}
        onClose={() => setFullPreview(null)}
      />
    ) : null}
    </>
  );
}

function RecipientReview({
  recipient,
  bodyText,
  company,
  subject,
  onViewFull,
}: {
  recipient: Recipient;
  bodyText: string;
  company: string;
  subject: string;
  onViewFull: () => void;
}) {
  const name = recipient.greeting_name || recipientNameFromEmail(recipient.email);
  const mergedSubject = resolveMergeFields(subject, name, company);
  const snippet = resolveMergeFields(bodyText, name, company, defaultMessage);

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
            {mergedSubject}
          </p>
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {snippet}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-lg px-2.5 text-xs"
          onClick={onViewFull}
        >
          <Eye className="size-3.5" aria-hidden />
          View full
        </Button>
      </div>
    </article>
  );
}

function EmailFullPreview({
  recipient,
  subject,
  bodyText,
  company,
  resumeFileName,
  resumePreviewUrl,
  onClose,
}: {
  recipient: Recipient;
  subject: string;
  bodyText: string;
  company: string;
  resumeFileName: string | null;
  resumePreviewUrl: string | null;
  onClose: () => void;
}) {
  const name = recipient.greeting_name || recipientNameFromEmail(recipient.email);
  const mergedSubject = resolveMergeFields(subject, name, company);
  const mergedBody = resolveMergeFields(bodyText, name, company, defaultMessage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/50"
        aria-label="Close email preview"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-preview-title"
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
          resumePreviewUrl
            ? "max-h-[min(44rem,calc(100vh-2rem))] max-w-2xl"
            : "max-h-[min(32rem,calc(100vh-2rem))] max-w-lg"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p
            id="email-preview-title"
            className="text-sm font-semibold text-foreground"
          >
            Email preview
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  To
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {name || "Recruiter"}
                  {recipient.email ? (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {recipient.email}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Subject
                </dt>
                <dd className="mt-0.5 font-semibold text-foreground">
                  {mergedSubject}
                </dd>
              </div>
            </dl>

            <Separator className="my-4" />

            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {mergedBody}
            </div>

            {resumeFileName ? (
              <div className="mt-4">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Attachment
                </p>
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                  <FileText
                    className="size-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="truncate font-medium text-foreground">
                    {resumeFileName}
                  </span>
                </div>
                {resumePreviewUrl ? (
                  <iframe
                    title={`Resume preview: ${resumeFileName}`}
                    src={resumePreviewUrl}
                    className="mt-3 h-56 w-full rounded-lg border border-border bg-muted/20 sm:h-64"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
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

function resolveMergeFields(
  text: string,
  name: string,
  company: string,
  fallback = ""
) {
  const source = text.trim() || fallback;
  return source
    .replaceAll("{{first_name}}", name || "there")
    .replaceAll("__FIRST_NAME__", name || "there")
    .replaceAll("{{company}}", company.trim() || "the company")
    .replaceAll("{{role}}", "recruiting");
}
