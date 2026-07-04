"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Search,
  Send,
  SendHorizontal,
  UsersRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  fetchCampaignRows,
  fetchCampaignDetail,
  downloadCampaignResume,
  type CampaignApiRow,
  type CampaignDetailResponse,
} from "@/lib/supabase/campaigns";
import { resumeApiAuthHeaders } from "@/lib/supabase/userResumes";

type CampaignStatus = "Review ready" | "Sent" | "Draft" | "Paused";

type Campaign = {
  id: string;
  title: string;
  description: string;
  company: string;
  status: CampaignStatus;
  updatedAt: string;
  sentAt: string | null;
  recipientCount: number;
  resumeAttached: boolean;
};

function formatSentAt(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return "Today";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function mapApiCampaign(row: CampaignApiRow): Campaign {
  const title =
    row.subject?.trim() ||
    (row.company?.trim() ? `${row.company} outreach` : "Campaign");
  const description = (row.body_preview ?? "").trim();
  const ts =
    row.updated_at || row.sent_at || row.created_at || new Date().toISOString();
  const raw = (row.status || "draft").toLowerCase();
  let status: CampaignStatus = "Draft";
  if (raw === "sent") status = "Sent";
  else if (raw === "paused") status = "Paused";
  else if (raw === "review" || raw === "review_ready") status = "Review ready";

  return {
    id: row.id,
    title,
    description: description || "—",
    company: row.company,
    status,
    updatedAt: ts,
    sentAt: row.sent_at,
    recipientCount: row.recipient_count ?? 0,
    resumeAttached: row.resume_attached,
  };
}

export function CampaignsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setCampaigns([]);
      setListLoading(false);
      setListError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setListError(null);
      const { rows, error } = await fetchCampaignRows();
      if (cancelled) return;
      if (error) {
        setCampaigns([]);
        setListError(error.message);
      } else {
        setCampaigns(rows.map(mapApiCampaign));
      }
      setListLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasCampaigns = campaigns.length > 0;

  const visibleCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextCampaigns = campaigns.filter((campaign) => {
      if (normalizedQuery.length === 0) return true;
      return `${campaign.title} ${campaign.description} ${campaign.company}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
    return nextCampaigns.sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    );
  }, [campaigns, query]);

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background pb-10">
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Campaigns
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sent outreach batches and their recipient lists.
          </p>
          {listError ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {listError}
            </p>
          ) : null}
        </div>

        <section>
          <label className="relative block min-w-0 max-w-[30rem]">
            <span className="sr-only">Search campaigns</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search campaigns…"
              className="h-10 rounded-xl bg-card pl-10 text-sm"
            />
          </label>
        </section>

        {!listLoading && visibleCampaigns.length > 0 ? (
          <section
            aria-label="Campaigns"
            className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3"
          >
            {visibleCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </section>
        ) : (
          <Card className="rounded-2xl bg-card shadow-sm">
            <CardContent className="p-5">
              {listLoading ? (
                <CampaignsLoadingState />
              ) : (
                <CampaignsEmptyState hasCampaigns={hasCampaigns} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

function CampaignsLoadingState() {
  return (
    <Empty className="min-h-56 border border-dashed border-border bg-muted/40 sm:min-h-[18rem]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Loader2 aria-hidden="true" className="animate-spin" />
        </EmptyMedia>
        <EmptyTitle>Loading campaigns…</EmptyTitle>
        <EmptyDescription>Checking your sent outreach batches.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function CampaignsEmptyState({ hasCampaigns }: { hasCampaigns: boolean }) {
  return (
    <Empty className="min-h-56 border border-dashed border-border bg-muted/40 sm:min-h-[18rem]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Send aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          {hasCampaigns ? "No matching campaigns" : "No campaigns yet"}
        </EmptyTitle>
        <EmptyDescription>
          {hasCampaigns
            ? "Try different keywords in your search."
            : "Send a campaign to see each outreach batch here."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const href = `/dashboard/new?campaign=${encodeURIComponent(campaign.id)}`;
  const { url: resumePreviewUrl, loading: resumePreviewLoading } =
    useCampaignResumePreviewUrl(campaign.id, campaign.resumeAttached);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [viewingRecipients, setViewingRecipients] = useState<Campaign | null>(
    null
  );
  const [previewingCampaign, setPreviewingCampaign] =
    useState<Campaign | null>(null);
  const displayDate = campaign.sentAt
    ? `Sent ${formatSentAt(campaign.sentAt)}`
    : `Updated ${formatSentAt(campaign.updatedAt)}`;
  const bodyPreview =
    campaign.description !== "—" ? campaign.description.trim() : "";

  async function handleDownloadResume() {
    if (!campaign.resumeAttached || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    const safeCompany =
      campaign.company.trim().replace(/[/\\]/g, "-") || "resume";
    const { error } = await downloadCampaignResume(
      campaign.id,
      `${safeCompany}-resume.pdf`
    );
    setDownloading(false);
    if (error) setDownloadError(error.message);
  }

  return (
    <>
    <Card className="flex h-full flex-col gap-0 rounded-2xl bg-card py-0 shadow-sm">
      <CardContent className="flex min-h-56 flex-1 flex-col gap-3 p-5">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
              {campaign.title}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {campaign.company}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StatusBadge status={campaign.status} />
            <CampaignCardActionsMenu
              title={campaign.title}
              href={href}
              resumeAttached={campaign.resumeAttached}
              downloading={downloading}
              onDownloadResume={() => void handleDownloadResume()}
            />
          </div>
        </div>

        {bodyPreview && campaign.resumeAttached ? (
          <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
            {bodyPreview}
          </p>
        ) : null}

        {campaign.resumeAttached ? (
          <div className="relative min-h-40 flex-1 overflow-hidden rounded-xl border border-border bg-muted/30">
            {resumePreviewLoading ? (
              <span className="flex size-full min-h-40 items-center justify-center">
                <Loader2
                  aria-hidden
                  className="size-5 animate-spin text-muted-foreground"
                />
              </span>
            ) : resumePreviewUrl ? (
              <iframe
                src={`${resumePreviewUrl}#page=1&view=FitH&toolbar=0&navpanes=0`}
                title={`Resume attached to ${campaign.title}`}
                className="pointer-events-none absolute inset-x-0 top-0 h-[240%] w-full border-0 bg-card"
              />
            ) : (
              <span className="flex size-full min-h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
                <FileText aria-hidden className="size-4" />
                Resume attached
              </span>
            )}
          </div>
        ) : null}

        {bodyPreview && !campaign.resumeAttached ? (
          <p className="line-clamp-4 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {bodyPreview}
          </p>
        ) : null}

        <button
          type="button"
          disabled={campaign.recipientCount === 0}
          onClick={() => setViewingRecipients(campaign)}
          className="inline-flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-60 disabled:hover:bg-muted/40"
        >
          <UsersRound aria-hidden className="size-3.5 shrink-0" />
          {campaign.recipientCount}{" "}
          {campaign.recipientCount === 1 ? "recipient" : "recipients"}
        </button>

        {downloadError ? (
          <p className="text-xs text-destructive" role="alert">
            {downloadError}
          </p>
        ) : null}

        <div className="flex shrink-0 items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">{displayDate}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-8 gap-1.5 rounded-xl px-3 text-xs"
              onClick={() => setPreviewingCampaign(campaign)}
            >
              <Eye className="size-3.5" aria-hidden />
              Preview
            </Button>
            <Link
              href={href}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-h-8 gap-1.5 rounded-xl px-3 text-xs text-primary"
              )}
            >
              <SendHorizontal className="size-3.5" aria-hidden />
              Open
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
    {viewingRecipients ? (
      <CampaignRecipientsDialog
        campaign={viewingRecipients}
        onClose={() => setViewingRecipients(null)}
      />
    ) : null}
    {previewingCampaign ? (
      <CampaignPreviewDialog
        campaign={previewingCampaign}
        onClose={() => setPreviewingCampaign(null)}
      />
    ) : null}
    </>
  );
}

function useCampaignResumePreviewUrl(campaignId: string, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const ownedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/campaigns/${encodeURIComponent(campaignId)}/resume`,
          { headers: await resumeApiAuthHeaders() }
        );
        if (!res.ok) throw new Error("Could not load resume preview");
        const blob = await res.blob();
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(blob);
        ownedUrlRef.current = nextUrl;
        setUrl(nextUrl);
      } catch {
        if (!cancelled) setUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (ownedUrlRef.current) {
        URL.revokeObjectURL(ownedUrlRef.current);
        ownedUrlRef.current = null;
      }
    };
  }, [campaignId, enabled]);

  return { url, loading };
}

function CampaignPreviewDialog({
  campaign,
  onClose,
}: {
  campaign: Campaign;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetailResponse | null>(null);
  const { url: resumePreviewUrl, loading: resumePreviewLoading } =
    useCampaignResumePreviewUrl(campaign.id, campaign.resumeAttached);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await fetchCampaignDetail(campaign.id);
      if (cancelled) return;
      if (fetchError || !data) {
        setError(fetchError?.message ?? "Could not load campaign.");
        setDetail(null);
      } else {
        setDetail(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign.id]);

  const sentLabel = campaign.sentAt
    ? `Sent ${formatSentAt(campaign.sentAt)}`
    : `Updated ${formatSentAt(campaign.updatedAt)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/50"
        aria-label="Close campaign preview"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-preview-title"
        className="relative z-10 flex max-h-[min(44rem,calc(100vh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="campaign-preview-title"
              className="text-base font-semibold text-foreground"
            >
              Campaign preview
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {campaign.company}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{sentLabel}</p>
          </div>
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading campaign…
            </div>
          ) : error || !detail ? (
            <p className="text-sm text-destructive" role="alert">
              {error ?? "Could not load campaign."}
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Subject
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {detail.subject}
                </p>
              </div>

              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Message
                </p>
                <div className="mt-2 whitespace-pre-wrap rounded-xl border border-border bg-muted/25 px-3 py-3 text-sm leading-relaxed text-foreground">
                  {detail.body_text}
                </div>
              </div>

              {campaign.resumeAttached ? (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    Resume
                  </p>
                  {resumePreviewLoading ? (
                    <div className="mt-2 flex min-h-32 items-center justify-center rounded-xl border border-border bg-muted/25">
                      <Loader2
                        aria-hidden
                        className="size-5 animate-spin text-muted-foreground"
                      />
                    </div>
                  ) : resumePreviewUrl ? (
                    <iframe
                      title={`Resume for ${campaign.title}`}
                      src={`${resumePreviewUrl}#view=FitH&toolbar=0&navpanes=0`}
                      className="mt-2 aspect-[8.5/11] w-full rounded-xl border border-border bg-muted/20"
                    />
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Resume attached
                    </p>
                  )}
                </div>
              ) : null}

              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recipients ({detail.recipients.length})
                </p>
                {detail.recipients.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No recipients recorded.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                    {detail.recipients.map((recipient, index) => (
                      <li
                        key={`${recipient.email}-${index}`}
                        className="rounded-xl border border-border bg-muted/25 px-3 py-2.5"
                      >
                        <p className="truncate text-sm font-medium text-foreground">
                          {recipient.greeting_name?.trim() || "Recruiter"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {recipient.email}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={onClose}
          >
            Close
          </Button>
          <Link
            href={`/dashboard/new?campaign=${encodeURIComponent(campaign.id)}`}
            className={cn(buttonVariants(), "rounded-xl")}
            onClick={onClose}
          >
            Open in editor
          </Link>
        </div>
      </div>
    </div>
  );
}

function CampaignRecipientsDialog({
  campaign,
  onClose,
}: {
  campaign: Campaign;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<
    Array<{ email: string; greeting_name: string }>
  >([]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await fetchCampaignDetail(campaign.id);
      if (cancelled) return;
      if (fetchError || !data) {
        setError(fetchError?.message ?? "Could not load recipients.");
        setRecipients([]);
      } else {
        setRecipients(data.recipients ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/50"
        aria-label="Close recipients"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-recipients-title"
        className="relative z-10 flex max-h-[min(32rem,calc(100vh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="campaign-recipients-title"
              className="truncate text-base font-semibold text-foreground"
            >
              Recipients
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {campaign.company} · {campaign.title}
            </p>
          </div>
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
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading recipients…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : recipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recipients recorded for this campaign.
            </p>
          ) : (
            <ul className="space-y-2">
              {recipients.map((recipient, index) => (
                <li
                  key={`${recipient.email}-${index}`}
                  className="rounded-xl border border-border bg-muted/25 px-3 py-2.5"
                >
                  <p className="truncate text-sm font-medium text-foreground">
                    {recipient.greeting_name?.trim() || "Recruiter"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {recipient.email}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignCardActionsMenu({
  title,
  href,
  resumeAttached = false,
  downloading = false,
  onDownloadResume,
}: {
  title: string;
  href: string;
  resumeAttached?: boolean;
  downloading?: boolean;
  onDownloadResume?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <details className="relative">
      <summary
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "cursor-pointer list-none rounded-lg text-muted-foreground [&::-webkit-details-marker]:hidden"
        )}
        aria-label={`More actions for ${title}`}
      >
        <MoreHorizontal aria-hidden="true" />
      </summary>
      <div
        role="menu"
        className="absolute right-0 top-full z-10 mt-1 min-w-[12rem] rounded-xl border border-border bg-popover py-1 shadow-md"
      >
        <Link
          href={href}
          role="menuitem"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
          Open campaign
        </Link>
        {resumeAttached && onDownloadResume ? (
          <button
            type="button"
            role="menuitem"
            disabled={downloading}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
            onClick={onDownloadResume}
          >
            {downloading ? (
              <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
            ) : (
              <Download aria-hidden="true" className="size-4 shrink-0" />
            )}
            Download resume
          </button>
        ) : null}
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-accent"
          onClick={() => {
            const full =
              typeof window !== "undefined"
                ? `${window.location.origin}${href}`
                : href;
            void navigator.clipboard.writeText(full).then(() => {
              setCopied(true);
            });
          }}
        >
          <Copy aria-hidden="true" className="size-4 shrink-0" />
          {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
    </details>
  );
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "shrink-0 rounded-lg px-2 py-0.5 text-[0.65rem] font-semibold",
        status === "Review ready" &&
          "bg-[hsl(var(--chart-3)/0.12)] text-[hsl(var(--chart-3))]",
        status === "Sent" &&
          "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))]",
        status === "Draft" && "bg-secondary text-muted-foreground",
        status === "Paused" &&
          "bg-[hsl(var(--chart-3)/0.08)] text-[hsl(var(--chart-3))]"
      )}
    >
      {status}
    </Badge>
  );
}
