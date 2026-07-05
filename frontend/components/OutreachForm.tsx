"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Plus,
  Search,
  SendHorizontal,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import {
  apiErrorMessage,
  backendUnreachableMessage,
  isBackendProxyFailure,
  readApiResponse,
  type ApiErrorBody,
} from "@/lib/apiError";
import {
  fetchBillingStatus,
  startCampaignUnlockCheckout,
  type BillingStatus,
} from "@/lib/billing";
import { CompanySelect } from "@/components/CompanySelect";
import { CampaignUnlockRequired } from "@/components/CampaignUnlockRequired";
import {
  diagnoseGmailSendFailure,
  syncGmailSendSession,
} from "@/lib/gmailSession";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchCampaignDetail,
  type CampaignDetailResponse,
} from "@/lib/supabase/campaigns";
import { fetchEmailTemplateRows } from "@/lib/supabase/emailTemplates";
import {
  fetchUserResumeRows,
  resumeApiAuthHeaders,
  type UserResumeRow,
} from "@/lib/supabase/userResumes";

type Recipient = {
  email?: string;
  greeting_name?: string;
  linkedin_url?: string;
};

type RecipientRemovalTarget = {
  index: number;
  label: string;
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

const defaultCompanyLabel = "Palantir";

function defaultSubjectForCompany(company: string) {
  const name = company.trim() || defaultCompanyLabel;
  return `${name} Summer 2027 Software Engineering Co-op`;
}

const defaultBodyText = `Hi {{first_name}},

I saw the recent launch at {{company}} and was genuinely impressed by the incredible growth. 

I'm reaching out to see if there are any open roles for  Summer 2027 roles, especially in the forward deployed and platform teams.
I've previous interned at companies XYZ working on customer-facing products.

I'd love to chat, would you be free Tuesday at 3:00pm?

Best,
Your name`;

export function OutreachForm() {
  const searchParams = useSearchParams();
  const campaignFromUrl = searchParams.get("campaign")?.trim() || null;
  const templateFromUrl = searchParams.get("template")?.trim() || null;
  const resumeFromUrl = searchParams.get("resume")?.trim() || null;

  const [company, setCompany] = useState(defaultCompanyLabel);
  const [testMode, setTestMode] = useState(false);
  const [testEmails, setTestEmails] = useState<string[]>([]);
  const [subject, setSubject] = useState(() =>
    defaultSubjectForCompany(defaultCompanyLabel)
  );
  const [bodyText, setBodyText] = useState(defaultBodyText);
  const [file, setFile] = useState<File | null>(null);
  const [savedResumes, setSavedResumes] = useState<UserResumeRow[]>([]);
  const [savedResumesLoading, setSavedResumesLoading] = useState(false);
  const [selectedSavedResumeId, setSelectedSavedResumeId] = useState<
    string | null
  >(null);
  const [libraryAttachLoading, setLibraryAttachLoading] = useState(false);
  const [resumeChooserOpen, setResumeChooserOpen] = useState(false);
  const [resumeChooserQuery, setResumeChooserQuery] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientToRemove, setRecipientToRemove] =
    useState<RecipientRemovalTarget | null>(null);
  const [message, setMessage] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendQueued, setSendQueued] = useState(false);
  const [celebrateSend, setCelebrateSend] = useState(0);
  const sendButtonWrapRef = useRef<HTMLSpanElement>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState<"preview" | "send" | null>(null);
  const [sendInFlight, setSendInFlight] = useState(false);
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
  const [billingLoading, setBillingLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setBillingLoading(false);
      return;
    }
    void fetchBillingStatus()
      .then(setBillingStatus)
      .finally(() => setBillingLoading(false));
  }, []);

  useEffect(() => {
    void syncGmailSendSession();
  }, []);

  useEffect(() => {
    if (!resumeChooserOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setResumeChooserOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [resumeChooserOpen]);

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

  const selectLibraryResume = useCallback((row: UserResumeRow) => {
    setFile(null);
    setSelectedSavedResumeId(row.id);
    return true;
  }, []);
  const applyCampaignResume = useCallback(
    async (campaignId: string, suggestedFilename: string) => {
      setLibraryAttachLoading(true);
      try {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/resume`,
          { headers: await resumeApiAuthHeaders() }
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        const blob = await res.blob();
        const safeName = suggestedFilename.endsWith(".pdf")
          ? suggestedFilename
          : `${suggestedFilename}.pdf`;
        setFile(new File([blob], safeName, { type: "application/pdf" }));
        setSelectedSavedResumeId(null);
        return true;
      } catch {
        setFile(null);
        setSelectedSavedResumeId(null);
        return false;
      } finally {
        setLibraryAttachLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      setSavedResumesLoading(true);
      try {
        const { rows, error } = await fetchUserResumeRows();
        if (cancelled) return;
        if (error) {
          setSavedResumes([]);
          return;
        }
        setSavedResumes(rows);
        if (!campaignFromUrl && !resumeFromUrl) {
          const defaultRow = rows.find((r) => r.is_default);
          if (defaultRow) selectLibraryResume(defaultRow);
        }
      } finally {
        if (!cancelled) setSavedResumesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectLibraryResume, campaignFromUrl, resumeFromUrl]);

  const prevCampaignFromUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!campaignFromUrl) {
      if (prevCampaignFromUrl.current) {
        setCompany(defaultCompanyLabel);
        setSubject(defaultSubjectForCompany(defaultCompanyLabel));
        setBodyText(defaultBodyText);
        setRecipients([]);
        setTestMode(false);
        setErr(false);
        setMessage("");
        setFile(null);
        setSelectedSavedResumeId(null);
      }
      prevCampaignFromUrl.current = null;
      setLoadedCampaign(null);
      setCampaignLoadError(null);
      setCampaignLoading(false);
      setPendingCampaignResumePath(null);
      return;
    }

    prevCampaignFromUrl.current = campaignFromUrl;

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
      setLoadedCampaign(data);
      setErr(false);
      setMessage("Campaign loaded.");
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
    if (
      !pendingCampaignResumePath ||
      savedResumesLoading ||
      !campaignFromUrl
    ) {
      return;
    }

    let cancelled = false;

    (async () => {
      const safeCompany =
        (loadedCampaign?.company || "resume").trim().replace(/[/\\]/g, "-") ||
        "resume";
      const row = savedResumes.find(
        (r) => r.resume_storage_path === pendingCampaignResumePath
      );
      if (row) {
        selectLibraryResume(row);
      } else {
        await applyCampaignResume(campaignFromUrl, `${safeCompany}-resume.pdf`);
      }
      if (!cancelled) setPendingCampaignResumePath(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    pendingCampaignResumePath,
    savedResumes,
    savedResumesLoading,
    campaignFromUrl,
    loadedCampaign?.company,
    selectLibraryResume,
    applyCampaignResume,
  ]);

  useEffect(() => {
    if (!templateFromUrl || campaignFromUrl) return;
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      const { rows, error } = await fetchEmailTemplateRows();
      if (cancelled || error) return;
      const template = rows.find((r) => r.id === templateFromUrl);
      if (!template) return;
      setSubject(template.subject);
      setBodyText(template.body_text);
      setErr(false);
      setMessage("Template applied. Add a company and fetch recruiters.");
    })();
    return () => {
      cancelled = true;
    };
  }, [templateFromUrl, campaignFromUrl]);

  useEffect(() => {
    if (!resumeFromUrl || campaignFromUrl || savedResumesLoading) return;
    const row = savedResumes.find((r) => r.id === resumeFromUrl);
    if (row) selectLibraryResume(row);
  }, [
    resumeFromUrl,
    campaignFromUrl,
    savedResumes,
    savedResumesLoading,
    selectLibraryResume,
  ]);

  useEffect(() => {
    if (!testMode) return;
    const seen = new Set<string>();
    const next: Recipient[] = [];
    for (const raw of testEmails) {
      const email = raw.trim().toLowerCase();
      if (!isValidEmail(email) || seen.has(email)) continue;
      seen.add(email);
      next.push({ email });
    }
    setRecipients(next);
  }, [testMode, testEmails]);

  const companyReady =
    testMode || company.trim().length > 0;
  const billingBlocked =
    !testMode &&
    billingStatus?.billing_enabled === true &&
    billingStatus.can_send === false;
  const campaignAccessBlocked =
    billingStatus?.billing_enabled === true &&
    billingStatus.can_send === false;
  const canSend =
    recipients.length > 0 &&
    loading === null &&
    !sendInFlight &&
    !billingBlocked;
  const sendBlockedReason =
    canSend || sendInFlight
      ? undefined
      : billingBlocked
        ? "Pay $5 once to unlock more campaigns."
        : loading === "preview"
          ? "Wait for recruiter search to finish."
          : recipients.length === 0
            ? testMode
              ? "Add at least one valid test email address."
              : "Fetch recruiters first."
            : undefined;
  const companyInvalid = err && !companyReady;
  const selectedSavedResume = useMemo(
    () =>
      selectedSavedResumeId
        ? savedResumes.find((resume) => resume.id === selectedSavedResumeId) ??
          null
        : null,
    [savedResumes, selectedSavedResumeId]
  );

  const selectedResumeFileName = selectedSavedResume
    ? selectedSavedResume.display_name.toLowerCase().endsWith(".pdf")
      ? selectedSavedResume.display_name
      : `${selectedSavedResume.display_name}.pdf`
    : file?.name ?? null;
  const resetFormFields = useCallback(() => {
    setCompany(defaultCompanyLabel);
    setSubject(defaultSubjectForCompany(defaultCompanyLabel));
    setBodyText(defaultBodyText);
    setFile(null);
    setSelectedSavedResumeId(null);
    setTestMode(false);
    setTestEmails([]);
    setErr(false);
    setErrorDetails(null);

    const defaultRow = savedResumes.find((r) => r.is_default);
    if (defaultRow) {
      selectLibraryResume(defaultRow);
    }
  }, [selectLibraryResume, savedResumes]);

  const handleResumeUpload = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextFile = event.target.files?.[0] ?? null;
      if (!nextFile) return;
      setSelectedSavedResumeId(null);
      setFile(nextFile);
      setResumeChooserOpen(false);
      event.currentTarget.value = "";
    },
    []
  );

  const handleUseSavedResume = useCallback(
    (row: UserResumeRow) => {
      selectLibraryResume(row);
      setResumeChooserOpen(false);
      setResumeChooserQuery("");
    },
    [selectLibraryResume]
  );

  const addTestEmail = useCallback((raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!isValidEmail(email)) return false;
    let added = false;
    setTestEmails((prev) => {
      if (prev.some((entry) => entry.trim().toLowerCase() === email)) {
        return prev;
      }
      added = true;
      return [...prev, email];
    });
    return added;
  }, []);

  const removeRecipientAt = useCallback(
    (index: number) => {
      const recipient = recipients[index];
      if (!recipient) return;

      const name =
        recipient.greeting_name || recipientNameFromEmail(recipient.email);
      const label = recipient.email || name || "this recipient";
      setRecipientToRemove({ index, label });
    },
    [recipients]
  );

  const confirmRemoveRecipient = useCallback(() => {
    const target = recipientToRemove;
    if (!target) return;

    const recipient = recipients[target.index];
    if (!recipient) {
      setRecipientToRemove(null);
      return;
    }

    if (testMode) {
      const email = recipient.email?.trim().toLowerCase();
      if (email) {
        setTestEmails((prev) =>
          prev.filter((entry) => entry.trim().toLowerCase() !== email)
        );
      }
    } else {
      const nextRecipients = recipients.filter((_, i) => i !== target.index);
      setRecipients(nextRecipients);
    }
    setSendSuccess(false);
    setSendQueued(false);
    setErr(false);
    setErrorDetails(null);
    setMessage("");
    setRecipientToRemove(null);
  }, [recipientToRemove, recipients, testMode]);

  const runCampaign = useCallback(
    async (dryRun: boolean) => {
      if (dryRun && testMode) {
        return;
      }

      if (!companyReady) {
        setErr(true);
        setMessage("Enter a company name before running the dry run.");
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

      setLoading(dryRun ? "preview" : null);
      setSendInFlight(!dryRun);
      setErr(false);
      setSendSuccess(false);
      setSendQueued(false);
      setErrorDetails(null);
      setMessage(dryRun ? "Finding recruiters..." : "");

      if (!dryRun) {
        await syncGmailSendSession();
      }

      const recipientCountForSend = recipients.length;
      const recipientsForSend = recipients;
      const isOptimisticSend = !dryRun && recipientCountForSend > 0;

      const fd = new FormData();
      fd.append("company", company.trim());
      fd.append("dry_run", dryRun ? "true" : "false");
      fd.append("test_mode", testMode ? "true" : "false");
      fd.append("subject", subject);
      fd.append("body_text", bodyText);
      if (!dryRun && recipientsForSend.length > 0) {
        fd.append("selected_recipients", JSON.stringify(recipientsForSend));
      }
      if (file) fd.append("resume", file, file.name);
      const libraryRow = selectedSavedResumeId
        ? savedResumes.find((r) => r.id === selectedSavedResumeId)
        : file
          ? savedResumes.find((r) => {
              const safeName = `${r.display_name.replace(/[/\\]/g, "-")}.pdf`;
              return file.name === safeName;
            })
          : undefined;
      if (libraryRow?.resume_storage_path) {
        fd.append("resume_storage_path", libraryRow.resume_storage_path);
      }
      const confirmedProfile = libraryRow?.profile?.user_confirmed_at
        ? libraryRow.profile
        : undefined;
      if (confirmedProfile?.primary_school_name) {
        fd.append(
          "resume_profile_school",
          confirmedProfile.primary_school_name
        );
      }
      if (confirmedProfile?.primary_school_normalized) {
        fd.append(
          "resume_profile_school_normalized",
          confirmedProfile.primary_school_normalized
        );
      }

      let sendHeaders: Record<string, string> = {};
      if (isSupabaseConfigured()) {
        try {
          sendHeaders = await resumeApiAuthHeaders();
        } catch {
          /* Gmail send still works with session cookie; DB row needs owner id from cookie or future sign-in */
        }
      }

      if (isOptimisticSend) {
        setSendInFlight(false);
        setRecipients([]);
        setSendSuccess(true);
        setSendQueued(recipientCountForSend > 1);
        setCelebrateSend((n) => n + 1);
        setMessage(
          recipientCountForSend > 1
            ? queuedSendMessage(recipientCountForSend, testMode)
            : testMode
              ? "Sending to your test address. Check your Sent folder."
              : "Sent to 1 recipient. Check your Sent folder."
        );
        resetFormFields();
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
          if (isOptimisticSend) {
            setSendSuccess(false);
            setSendQueued(false);
          }
          if (isBackendProxyFailure(res.status, payload, text)) {
            setErr(true);
            setMessage("Could not reach the outreach API.");
            setErrorDetails(backendUnreachableMessage());
            return;
          }
          if (
            dryRun &&
            isNoRecruitersDiscoveryError(payload, text)
          ) {
            setRecipients([]);
            setErr(false);
            setErrorDetails(null);
            setMessage(noRecruitersMessage(company));
            return;
          }
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
            setErr(false);
            setErrorDetails(null);
            setMessage("");
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
              ? noRecruitersMessage(company)
              : testMode
                ? `${payload.count ?? nextRecipients.length} test recipient loaded.`
                : `${payload.count ?? nextRecipients.length} recipients found.`
          );
        } else {
          const recipientCount = payload.sent ?? payload.count ?? 0;
          const queued = payload.queued === true;
          if (isOptimisticSend) {
            if (payload.billing) {
              setBillingStatus(payload.billing);
            } else if (!testMode) {
              void fetchBillingStatus().then(setBillingStatus);
            }
          } else {
            setRecipients([]);
            setSendSuccess(true);
            setSendQueued(queued);
            setCelebrateSend((n) => n + 1);
            if (payload.billing) {
              setBillingStatus(payload.billing);
            } else if (!testMode) {
              void fetchBillingStatus().then(setBillingStatus);
            }
            if (testMode) {
              setMessage(
                queued
                  ? queuedSendMessage(recipientCount, true)
                  : `Sent to ${recipientCount} test ${recipientCount === 1 ? "address" : "addresses"}. Check your Sent folder to confirm delivery.`
              );
            } else if (queued) {
              setMessage(queuedSendMessage(recipientCount, false));
            } else {
              setMessage(
                `Sent to ${recipientCount} ${recipientCount === 1 ? "recipient" : "recipients"}. Check your Sent folder.`
              );
            }
            resetFormFields();
          }
        }
      } catch (e) {
        if (isOptimisticSend) {
          setSendSuccess(false);
          setSendQueued(false);
        }
        setErr(true);
        setMessage("Could not reach the outreach server.");
        setErrorDetails(
          e instanceof Error ? e.message : "Network error while calling /api/send"
        );
      } finally {
        setLoading(null);
        setSendInFlight(false);
      }
    },
    [
      bodyText,
      billingStatus,
      company,
      companyReady,
      file,
      recipients,
      savedResumes,
      selectedSavedResumeId,
      subject,
      testMode,
      resetFormFields,
    ]
  );

  if (billingLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (campaignAccessBlocked) {
    return <CampaignUnlockRequired />;
  }

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
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              New campaign
            </h1>
            <FreeCampaignsBadge status={billingStatus} />
          </div>
          {campaignFromUrl && loadedCampaign && !campaignLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Prefilled from a previous campaign.
            </p>
          ) : null}
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
                Clear and start blank
              </Link>
            </p>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(34rem,1.15fr)]">
          <Card className="min-w-0 overflow-hidden rounded-2xl bg-card shadow-sm">
            <CardContent className="space-y-5 px-5 py-5">
            <CompanySelect
              value={company}
              onChange={(next) => {
                setSubject((current) =>
                  current === defaultSubjectForCompany(company) || !current.trim()
                    ? defaultSubjectForCompany(next)
                    : current
                );
                setCompany(next);
                setRecipients([]);
              }}
              invalid={companyInvalid}
              placeholder={defaultCompanyLabel}
            />

              <div className="relative">
  <Input
    id="subject"
    value={subject}
    onChange={(event) => setSubject(event.target.value)}
    className="h-10 rounded-xl text-sm font-medium"
  />
  <label
    htmlFor="subject"
    className="absolute left-3 top-0 -translate-y-1/2 text-xs font-medium text-muted-foreground bg-card px-1"
  >
    Subject
  </label>
</div>

<div className="relative">
  <AutosizeTextarea
    id="body"
    value={bodyText}
    onChange={(event) => setBodyText(event.target.value)}
    className="rounded-xl text-sm leading-relaxed"
    rows={6}
  />
  <label
    htmlFor="body"
    className="absolute left-3 top-0 -translate-y-1/2 text-xs font-medium text-muted-foreground bg-card px-1"
  >
    Message
  </label>
</div>
<p className="text-xs leading-relaxed text-muted-foreground">
  Use{" "} dynamic values{" "}
  <span className="font-mono text-[0.7rem]">{"{{first_name}}"}</span> and{" "}
  <span className="font-mono text-[0.7rem]">{"{{company}}"}</span> in the
  message.
</p>

              <Field>
                <FieldLabel
                  htmlFor="resume"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Resume <span className="font-normal">(optional)</span>
                </FieldLabel>
                <Input
                  id="resume"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={handleResumeUpload}
                />
                {libraryAttachLoading ? (
                  <div className="mt-2 flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    <Loader2
                      className="size-4 shrink-0 animate-spin"
                      aria-hidden="true"
                    />
                    Loading resume...
                  </div>
                ) : file || selectedSavedResume ? (
                  <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                      <FileText aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <p className="min-w-0 truncate text-sm font-medium text-foreground">
                          {selectedSavedResume?.display_name ??
                            file?.name ??
                            "Selected resume"}
                        </p>
                        {selectedSavedResume?.is_default ? (
                          <Badge
                            variant="secondary"
                            className="h-5 text-[0.68rem]"
                          >
                            Default
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setResumeChooserOpen(true)}
                    >
                      Change
                    </Button>
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
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label
                      htmlFor="resume"
                      className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-sm transition hover:border-primary/40 hover:bg-accent"
                    >
                      <Upload
                        aria-hidden="true"
                        className="size-4 text-primary"
                      />
                      <span className="font-medium text-foreground">
                        Upload PDF
                      </span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-14 rounded-xl px-4"
                      onClick={() => setResumeChooserOpen(true)}
                    >
                      {savedResumesLoading ? (
                        <Loader2
                          data-icon="inline-start"
                          aria-hidden="true"
                          className="animate-spin"
                        />
                      ) : (
                        <Search data-icon="inline-start" aria-hidden="true" />
                      )}
                      Use existing
                    </Button>
                  </div>
                )}
              </Field>
            </CardContent>
          </Card>

          <ReviewPanel
            recipients={recipients}
            bodyText={bodyText}
            company={company}
            subject={subject}
            resumeFileName={selectedResumeFileName}
            resumePreviewUrl={resumePreviewUrl}
            testMode={testMode}
            onAddTestEmail={addTestEmail}
            onTestModeChange={(enabled) => {
              setTestMode(enabled);
              setTestEmails([]);
              setRecipients([]);
            }}
            onRemoveRecipient={removeRecipientAt}
            loading={loading}
            err={err}
            message={message}
            errorDetails={errorDetails}
            sendSuccess={sendSuccess}
            sendQueued={sendQueued}
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
              !canSend && "cursor-not-allowed"
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
                !canSend && "pointer-events-none"
              )}
            >
              <SendHorizontal data-icon="inline-start" aria-hidden="true" />
              Send campaign
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

      {resumeChooserOpen ? (
        <ResumeChooserModal
          resumes={savedResumes}
          selectedResumeId={selectedSavedResumeId}
          loading={savedResumesLoading}
          attaching={libraryAttachLoading}
          query={resumeChooserQuery}
          onQueryChange={setResumeChooserQuery}
          onClose={() => setResumeChooserOpen(false)}
          onUseResume={handleUseSavedResume}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(recipientToRemove)}
        title="Remove recipient?"
        description={
          recipientToRemove
            ? `Remove ${recipientToRemove.label} from this campaign? This recipient will not receive the email.`
            : ""
        }
        confirmLabel="Remove recipient"
        onOpenChange={(open) => {
          if (!open) setRecipientToRemove(null);
        }}
        onConfirm={confirmRemoveRecipient}
      />
    </form>
  );
}
function formatResumeUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  return `Updated ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function ResumeChooserModal({
  resumes,
  selectedResumeId,
  loading,
  attaching,
  query,
  onQueryChange,
  onClose,
  onUseResume,
}: {
  resumes: UserResumeRow[];
  selectedResumeId: string | null;
  loading: boolean;
  attaching: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onUseResume: (row: UserResumeRow) => void;
}) {
  const orderedResumes = useMemo(
    () =>
      [...resumes].sort(
        (a, b) =>
          Number(b.is_default) - Number(a.is_default) ||
          b.updated_at.localeCompare(a.updated_at)
      ),
    [resumes]
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleResumes = useMemo(
    () =>
      normalizedQuery
        ? orderedResumes.filter((resume) =>
            resume.display_name.toLowerCase().includes(normalizedQuery)
          )
        : orderedResumes,
    [normalizedQuery, orderedResumes]
  );
  const fallbackResumeId = orderedResumes[0]?.id ?? null;
  const [draftResumeId, setDraftResumeId] = useState<string | null>(
    selectedResumeId ?? fallbackResumeId
  );

  useEffect(() => {
    setDraftResumeId(selectedResumeId ?? fallbackResumeId);
  }, [fallbackResumeId, selectedResumeId]);

  const draftResume =
    orderedResumes.find((resume) => resume.id === draftResumeId) ?? null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/50"
        aria-label="Close resume chooser"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-chooser-title"
        className="relative z-10 flex max-h-[min(40rem,calc(100vh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="resume-chooser-title"
              className="text-base font-semibold text-foreground"
            >
              Choose resume
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a saved resume for this campaign.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="border-b border-border px-5 py-4">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search resumes</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search resumes..."
              className="h-10 rounded-xl bg-background pl-10 text-sm"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading resumes...
            </div>
          ) : visibleResumes.length > 0 ? (
            <div className="space-y-2">
              {visibleResumes.map((resume) => {
                const selected = resume.id === draftResumeId;
                return (
                  <button
                    key={resume.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDraftResumeId(resume.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left transition hover:bg-muted/40",
                      selected
                        ? "border-primary/50 ring-2 ring-primary/15"
                        : "border-border"
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
                      <FileText aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">
                          {resume.display_name}
                        </span>
                        {resume.is_default ? (
                          <Badge
                            variant="secondary"
                            className="h-5 text-[0.68rem]"
                          >
                            Default
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{formatResumeUpdatedAt(resume.updated_at)}</span>
                        {resume.used_in_campaigns > 0 ? (
                          <span>
                            Used in {resume.used_in_campaigns} campaign
                            {resume.used_in_campaigns === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span
                      className={cn(
                        buttonVariants({
                          variant: selected ? "secondary" : "outline",
                          size: "sm",
                        }),
                        "rounded-xl"
                      )}
                      aria-hidden="true"
                    >
                      {selected ? "Selected" : "Use"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
              <FileText className="size-5 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-medium text-foreground">
                No saved resumes
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Upload a PDF from the resume field, or add reusable resumes from the resumes page.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={attaching}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={!draftResume || attaching}
            onClick={() => {
              if (draftResume) onUseResume(draftResume);
            }}
          >
            {attaching ? (
              <Loader2
                data-icon="inline-start"
                className="animate-spin"
                aria-hidden="true"
              />
            ) : null}
            Use selected
          </Button>
        </div>
      </div>
    </div>
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
  onAddTestEmail,
  onTestModeChange,
  onRemoveRecipient,
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
  onAddTestEmail: (email: string) => boolean;
  onTestModeChange: (enabled: boolean) => void;
  onRemoveRecipient: (index: number) => void;
  loading: "preview" | "send" | null;
  err: boolean;
  message: string;
  errorDetails: string | null;
  sendSuccess?: boolean;
  sendQueued?: boolean;
  actionsLocked?: boolean;
}) {
  const [fullPreview, setFullPreview] = useState<Recipient | null>(null);
  const [testEmailDraft, setTestEmailDraft] = useState("");
  const [testEmailError, setTestEmailError] = useState<string | null>(null);

  function submitTestEmail() {
    const trimmed = testEmailDraft.trim();
    if (!trimmed) {
      setTestEmailError(null);
      return;
    }
    if (!isValidEmail(trimmed)) {
      setTestEmailError("Enter a valid email address.");
      return;
    }
    const added = onAddTestEmail(trimmed);
    if (!added) {
      setTestEmailError("That address is already in the list.");
      return;
    }
    setTestEmailDraft("");
    setTestEmailError(null);
  }

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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <CardTitle className="text-base font-semibold">
            Preview
            {recipients.length > 0 ? (
              <span className="ml-2 font-normal text-muted-foreground">
                ({recipients.length})
              </span>
            ) : null}
          </CardTitle>
          <Field
            orientation="horizontal"
            data-disabled={actionsLocked || undefined}
            className="items-center gap-2"
          >
            <Checkbox
              id="test-mode"
              checked={testMode}
              disabled={actionsLocked}
              onCheckedChange={(checked) =>
                onTestModeChange(checked === true)
              }
            />
            <FieldLabel
              htmlFor="test-mode"
              className="text-xs font-medium text-muted-foreground"
            >
              Test mode
            </FieldLabel>
          </Field>
        </div>
        {testMode ? null : (
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
        )}
      </CardHeader>
      <CardContent className="p-0">
        {testMode ? (
          <div className="border-b border-border px-5 py-4">
            <label
              htmlFor="test-email"
              className="text-xs font-medium text-muted-foreground"
            >
              Test email addresses
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                id="test-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={testEmailDraft}
                disabled={actionsLocked}
                placeholder="you@example.com"
                onChange={(event) => {
                  setTestEmailDraft(event.target.value);
                  if (testEmailError) setTestEmailError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitTestEmail();
                  }
                }}
                aria-invalid={
                  (testEmailDraft.trim().length > 0 &&
                    !isValidEmail(testEmailDraft)) ||
                  testEmailError
                    ? true
                    : undefined
                }
                className="h-10 min-w-0 flex-1 rounded-xl text-sm"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={actionsLocked || !testEmailDraft.trim()}
                className="h-10 shrink-0 gap-1.5 rounded-xl px-3"
                onClick={submitTestEmail}
              >
                <Plus className="size-4" aria-hidden />
                Add
              </Button>
            </div>
            {testEmailError ? (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {testEmailError}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Add one or more addresses. The campaign will be sent only to
                these emails so you can check how it looks.
              </p>
            )}
          </div>
        ) : null}
        <div className="max-h-none overflow-y-visible px-5 py-4 xl:max-h-[calc(100vh-18rem)] xl:overflow-y-auto">
          {recipients.length === 0 ? (
            <Empty className="min-h-56 border border-dashed border-border bg-muted/30">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRound aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No recipients yet</EmptyTitle>
                <EmptyDescription>
                  {testMode
                    ? "Add test email addresses above, then preview each message here."
                    : "Find recruiters for your target company, then preview each email here."}
                </EmptyDescription>
              </EmptyHeader>
              {testMode ? null : (
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
              )}
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
                  onRemove={() => onRemoveRecipient(index)}
                  removeDisabled={loading !== null || actionsLocked}
                />
              ))}
            </div>
          )}
        </div>

        {message || errorDetails ? (
          <div className="min-w-0 px-5 pb-5">
            <Alert
              role={err ? "alert" : "status"}
              variant={err ? "destructive" : "default"}
              className={cn(
                "min-w-0 rounded-xl",
                err && "destructive",
                !err &&
                  sendSuccess &&
                  "border-primary/30 bg-primary/10 text-foreground",
                !err &&
                  !sendSuccess &&
                  "border-primary/20 bg-accent text-accent-foreground"
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
                className={cn(
                  "min-w-0 break-words",
                  !err && "text-accent-foreground/80"
                )}
              >
                {message}
                {err && errorDetails ? (
                  <span className="mt-2 block break-all font-mono text-xs leading-relaxed text-destructive/90">
                    {errorDetails}
                  </span>
                ) : null}
              </AlertDescription>
            </Alert>
          </div>
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
  onRemove,
  removeDisabled,
}: {
  recipient: Recipient;
  bodyText: string;
  company: string;
  subject: string;
  onViewFull: () => void;
  onRemove: () => void;
  removeDisabled: boolean;
}) {
  const name = recipient.greeting_name || recipientNameFromEmail(recipient.email);
  const linkedinUrl = recipient.linkedin_url?.trim();
  const mergedSubject = resolveMergeFields(subject, name, company);
  const snippet = resolveMergeFields(bodyText, name, company);

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
        <div className="flex shrink-0 items-center gap-1">
          {linkedinUrl ? (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-sm" }),
                "h-8 w-8 rounded-lg text-[0.72rem] font-bold text-[#0A66C2]"
              )}
              aria-label={`Open LinkedIn profile for ${name || "recruiter"}`}
              title="Open LinkedIn profile"
            >
              <LinkedInIcon className="size-3.5" />
            </a>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg px-2.5 text-xs"
            onClick={onViewFull}
          >
            <Eye className="size-3.5" aria-hidden />
            View full
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            className="rounded-xl"
            disabled={removeDisabled}
            aria-label={`Remove ${recipient.email || name || "recipient"}`}
            title="Remove recipient"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </article>
  );
}

// LinkedIn mark from Font Awesome Free 6.7.2, Icons: CC BY 4.0.
function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      focusable="false"
      viewBox="0 0 448 512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z" />
    </svg>
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
  const mergedBody = resolveMergeFields(bodyText, name, company);

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
                    src={`${resumePreviewUrl}#view=FitH&toolbar=0&navpanes=0`}
                    className="mt-3 aspect-[8.5/11] w-full rounded-lg border border-border bg-muted/20"
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

function isValidEmail(value: string) {
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function estimateSendDurationMinutes(recipientCount: number): number {
  const count = Math.max(1, recipientCount);
  if (count === 1) return 1;

  const initialMaxSec = 0;
  const spacingMaxSec = 48;
  const chunkPauseMaxSec = 100;
  const gaps = count - 1;
  const chunkPauses = Math.max(0, Math.floor(gaps / 2));
  const totalSec =
    initialMaxSec + gaps * spacingMaxSec + chunkPauses * chunkPauseMaxSec;

  return Math.max(2, Math.ceil(totalSec / 60));
}

function withinMinutesLabel(minutes: number) {
  return minutes === 1 ? "within 1 minute" : `within ${minutes} minutes`;
}

function queuedSendMessage(recipientCount: number, testMode: boolean) {
  const minutes = estimateSendDurationMinutes(recipientCount);
  const timing = withinMinutesLabel(minutes);

  if (testMode) {
    const target =
      recipientCount === 1
        ? "your test address"
        : `your ${recipientCount} test addresses`;
    return `Sending to ${target} in the background. Emails go out one at a time to avoid it being spam and should all be sent ${timing}. Check your Sent folder.`;
  }

  const recipientLabel =
    recipientCount === 1 ? "1 recipient" : `${recipientCount} recipients`;
  return `Campaign started for ${recipientLabel}. Emails go out one at a time to avoid it being spam and should all be sent ${timing}. Check your Sent folder.`;
}

function FreeCampaignsBadge({ status }: { status: BillingStatus | null }) {
  if (!status?.billing_enabled || status.unlocked) return null;
  if (status.free_remaining === null) return null;

  const remaining = status.free_remaining;

  return (
    <Badge
      variant={remaining === 0 ? "destructive" : "outline"}
      className="h-6 rounded-full px-2.5 text-[0.7rem] font-medium"
    >
      {remaining === 0
        ? "No free campaigns left"
        : `${remaining} free ${remaining === 1 ? "campaign" : "campaigns"} left`}
    </Badge>
  );
}

function noRecruitersMessage(company: string) {
  const name = company.trim();
  return name
    ? `No recruiters found for ${name}.`
    : "No recruiters found for that company.";
}

function isNoRecruitersDiscoveryError(
  payload: SendResponse | null,
  text: string
) {
  const message = `${payload?.error ?? ""} ${text}`.toLowerCase();
  return (
    payload?.code === "no_recruiters_found" ||
    message.includes("hasn't returned any results") ||
    message.includes("has not returned any results") ||
    message.includes("no addresses inferred") ||
    message.includes("serpapi returned nothing usable")
  );
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
