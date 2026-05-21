"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Search,
  Send,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  type CampaignApiRow,
} from "@/lib/supabase/campaigns";
import { buttonVariants } from "@/components/ui/button";

type CampaignStatus = "Review ready" | "Sent" | "Draft" | "Paused";

type Campaign = {
  id: string;
  title: string;
  description: string;
  company: string;
  status: CampaignStatus;
  updatedAt: string;
  sentAt: string | null;
  initial: string;
  accent: "blue" | "green" | "amber" | "violet" | "cyan";
};

const ACCENT_ROTATION = ["blue", "green", "amber", "violet", "cyan"] as const;

function accentFromId(id: string): Campaign["accent"] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ACCENT_ROTATION[Math.abs(h) % ACCENT_ROTATION.length] as Campaign["accent"];
}

function formatSentAt(value: string): string {
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
    initial: (title.slice(0, 1) || "?").toUpperCase(),
    accent: accentFromId(row.id),
  };
}

const pageSize = 6;

export function CampaignsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

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
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const hasCampaigns = campaigns.length > 0;

  const filteredCampaigns = useMemo(() => {
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

  const pageCount = Math.max(1, Math.ceil(filteredCampaigns.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleCampaigns = filteredCampaigns.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );
  const visibleStart =
    filteredCampaigns.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const visibleEnd = Math.min(safePage * pageSize, filteredCampaigns.length);

  function resetPage(next: () => void) {
    next();
    setPage(1);
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background pb-10">
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="min-w-0">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Campaigns
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Manage your outreach campaigns and track their progress.
            </p>
            {listError ? (
              <p
                className="mt-3 text-sm text-destructive"
                role="alert"
              >
                {listError}
              </p>
            ) : null}
          </div>
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
              onChange={(event) =>
                resetPage(() => setQuery(event.target.value))
              }
              placeholder="Search campaigns..."
              className="h-10 rounded-xl bg-card pl-10 text-sm"
            />
          </label>
        </section>

        <Card className="rounded-2xl bg-card py-0 shadow-sm">
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-[36%]" />
                  <col className="w-[16%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-xs font-semibold text-foreground">
                    <th className="px-4 py-3 sm:px-5">Campaign</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date sent</th>
                    <th className="px-4 py-3 text-right sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-14 text-center text-sm text-muted-foreground sm:px-5"
                      >
                        <Loader2
                          aria-hidden="true"
                          className="mx-auto size-6 animate-spin"
                        />
                        <span className="mt-2 block">Loading campaigns…</span>
                      </td>
                    </tr>
                  ) : visibleCampaigns.length > 0 ? (
                    visibleCampaigns.map((campaign) => (
                      <CampaignRow key={campaign.id} campaign={campaign} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 sm:px-5">
                        <CampaignsEmptyState hasCampaigns={hasCampaigns} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p>
                {filteredCampaigns.length === 0
                  ? hasCampaigns
                    ? "No campaigns match your search"
                    : "No campaigns yet"
                  : `Showing ${visibleStart} to ${visibleEnd} of ${filteredCampaigns.length} campaigns`}
              </p>
              {filteredCampaigns.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous page"
                    disabled={safePage === 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="rounded-xl"
                  >
                    <ArrowLeft aria-hidden="true" />
                  </Button>
                  {Array.from({ length: pageCount }).map((_, index) => {
                    const nextPage = index + 1;
                    return (
                      <Button
                        key={nextPage}
                        type="button"
                        variant={safePage === nextPage ? "secondary" : "ghost"}
                        size="icon-sm"
                        aria-label={`Page ${nextPage}`}
                        onClick={() => setPage(nextPage)}
                        className={cn(
                          "rounded-xl",
                          safePage === nextPage && "text-primary"
                        )}
                      >
                        {nextPage}
                      </Button>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next page"
                    disabled={safePage === pageCount}
                    onClick={() =>
                      setPage((current) => Math.min(pageCount, current + 1))
                    }
                    className="rounded-xl"
                  >
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function CampaignsEmptyState({ hasCampaigns }: { hasCampaigns: boolean }) {
  return (
    <Empty className="min-h-56 border border-dashed border-border bg-muted/40">
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
            : "Create a campaign when you are ready to start tracking outreach."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const actionLabel = campaign.status === "Draft" ? "Edit" : "Open";
  const href = `/dashboard/new?campaign=${encodeURIComponent(campaign.id)}`;

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              campaign.accent === "blue" && "bg-primary/10 text-primary",
              campaign.accent === "green" &&
                "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))]",
              campaign.accent === "amber" &&
                "bg-[hsl(var(--chart-3)/0.12)] text-[hsl(var(--chart-3))]",
              campaign.accent === "violet" &&
                "bg-[hsl(var(--chart-4)/0.10)] text-[hsl(var(--chart-4))]",
              campaign.accent === "cyan" &&
                "bg-[hsl(var(--chart-1)/0.10)] text-[hsl(var(--chart-1))]"
            )}
          >
            {campaign.initial}
          </span>
          <div className="min-w-0">
            <p className="max-w-[24rem] truncate font-medium text-foreground">
              {campaign.title}
            </p>
            <p className="mt-1 max-w-[24rem] truncate text-muted-foreground">
              {campaign.description}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{campaign.company}</td>
      <td className="px-4 py-3">
        <StatusBadge status={campaign.status} />
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {campaign.sentAt ? formatSentAt(campaign.sentAt) : "—"}
      </td>
      <td className="px-4 py-3 sm:px-5">
        <div className="flex justify-end gap-2">
          <Link
            href={href}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "min-h-8 rounded-xl px-3 text-primary"
            )}
          >
            {actionLabel}
          </Link>
          <CampaignRowActionsMenu title={campaign.title} href={href} />
        </div>
      </td>
    </tr>
  );
}

function CampaignRowActionsMenu({
  title,
  href,
}: {
  title: string;
  href: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <details className="relative z-10">
      <summary
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "cursor-pointer list-none rounded-xl text-muted-foreground [&::-webkit-details-marker]:hidden"
        )}
        aria-label={`More actions for ${title}`}
      >
        <MoreHorizontal aria-hidden="true" />
      </summary>
      <div
        role="menu"
        className="absolute right-0 top-full mt-1 min-w-[12rem] rounded-xl border border-border bg-popover py-1 shadow-md"
      >
        <Link
          href={href}
          role="menuitem"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
          Open campaign
        </Link>
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
        "rounded-lg px-2.5 font-semibold",
        status === "Review ready" &&
          "bg-[hsl(var(--chart-3)/0.12)] text-[hsl(var(--chart-3))]",
        status === "Sent" &&
          "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))]",
        status === "Draft" &&
          "bg-secondary text-muted-foreground",
        status === "Paused" &&
          "bg-[hsl(var(--chart-3)/0.08)] text-[hsl(var(--chart-3))]"
      )}
    >
      {status}
    </Badge>
  );
}
