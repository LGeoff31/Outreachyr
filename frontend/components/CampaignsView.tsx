"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  MoreHorizontal,
  Search,
  Send,
  SlidersHorizontal,
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

type CampaignStatus = "Review ready" | "Sent" | "Draft" | "Paused";

type Campaign = {
  id: string;
  title: string;
  description: string;
  company: string;
  status: CampaignStatus;
  recipients: number | null;
  resumeAttached: boolean;
  updatedAt: string;
  updatedAtLabel: string;
  initial: string;
  accent: "blue" | "green" | "amber" | "violet" | "cyan";
};

const summaryCardConfig = [
  {
    label: "Total campaigns",
    detail: "All time",
    icon: Send,
    tone: "primary",
  },
  {
    label: "In review",
    detail: "Ready to send",
    icon: Clock,
    tone: "warning",
  },
  {
    label: "Sent",
    detail: "Completed campaigns",
    icon: CheckCircle2,
    tone: "success",
  },
  {
    label: "Drafts",
    detail: "Not yet reviewed",
    icon: FileText,
    tone: "violet",
  },
] as const;

const pageSize = 6;
const emptyCampaigns: Campaign[] = [];

export function CampaignsView({
  campaigns = emptyCampaigns,
}: {
  campaigns?: Campaign[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [company, setCompany] = useState("All companies");
  const [sortBy, setSortBy] = useState("Last updated");
  const [page, setPage] = useState(1);
  const hasCampaigns = campaigns.length > 0;

  const companyOptions = useMemo(
    () => ["All companies", ...Array.from(new Set(campaigns.map((item) => item.company))).sort()],
    [campaigns]
  );

  const summaryCards = useMemo(
    () =>
      summaryCardConfig.map((card) => {
        const value =
          card.label === "Total campaigns"
            ? campaigns.length
            : card.label === "In review"
              ? campaigns.filter((campaign) => campaign.status === "Review ready").length
              : card.label === "Sent"
                ? campaigns.filter((campaign) => campaign.status === "Sent").length
                : campaigns.filter((campaign) => campaign.status === "Draft").length;

        return { ...card, value: String(value) };
      }),
    [campaigns]
  );

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextCampaigns = campaigns.filter((campaign) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${campaign.title} ${campaign.description} ${campaign.company}`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus =
        status === "All statuses" || campaign.status === status;
      const matchesCompany =
        company === "All companies" || campaign.company === company;

      return matchesQuery && matchesStatus && matchesCompany;
    });

    return nextCampaigns.sort((a, b) => {
      if (sortBy === "Company") return a.company.localeCompare(b.company);
      if (sortBy === "Campaign") return a.title.localeCompare(b.title);
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [campaigns, company, query, sortBy, status]);

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
          </div>
        </div>

        <section
          aria-label="Campaign summary"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {summaryCards.map((card) => (
            <SummaryCard key={card.label} {...card} />
          ))}
        </section>

        <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="relative block min-w-0 flex-1 lg:max-w-[30rem]">
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

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[34rem]">
            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => resetPage(() => setStatus(value))}
              options={[
                "All statuses",
                "Review ready",
                "Sent",
                "Draft",
                "Paused",
              ]}
            />
            <FilterSelect
              label="Company"
              value={company}
              onChange={(value) => resetPage(() => setCompany(value))}
              options={companyOptions}
            />
            <FilterSelect
              label="Sort by"
              value={sortBy}
              onChange={(value) => resetPage(() => setSortBy(value))}
              options={["Last updated", "Company", "Campaign"]}
              icon={<SlidersHorizontal aria-hidden="true" className="size-4" />}
            />
          </div>
        </section>

        <Card className="rounded-2xl bg-card py-0 shadow-sm">
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] table-fixed border-collapse text-left text-sm lg:min-w-full">
                <colgroup>
                  <col className="w-[31%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                  <col className="w-[16%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-xs font-semibold text-foreground">
                    <th className="px-4 py-3 sm:px-5">Campaign</th>
                    <th className="px-4 py-3">Target company</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Recipients</th>
                    <th className="px-4 py-3">Resume</th>
                    <th className="px-4 py-3">Last updated</th>
                    <th className="px-4 py-3 text-right sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCampaigns.length > 0 ? (
                    visibleCampaigns.map((campaign) => (
                      <CampaignRow key={campaign.id} campaign={campaign} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 sm:px-5">
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
                    ? "No campaigns match your filters"
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

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: (typeof summaryCardConfig)[number] & { value: string }) {
  return (
    <Card className="rounded-2xl bg-card py-0 shadow-sm">
      <CardContent className="flex items-center gap-4 px-5 py-4">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            tone === "primary" &&
              "bg-primary/10 text-primary",
            tone === "warning" &&
              "bg-[hsl(var(--chart-3)/0.14)] text-[hsl(var(--chart-3))]",
            tone === "success" &&
              "bg-[hsl(var(--chart-2)/0.14)] text-[hsl(var(--chart-2))]",
            tone === "violet" &&
              "bg-[hsl(var(--chart-4)/0.10)] text-[hsl(var(--chart-4))]"
          )}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
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
            ? "Adjust your search or filters to see more campaigns."
            : "Create a campaign when you are ready to start tracking outreach."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  icon?: ReactNode;
}) {
  return (
    <label className="relative block">
      <span className="absolute left-3 top-1 text-[0.7rem] font-medium leading-none text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-input bg-card px-3 pb-1.5 pt-4 text-sm font-medium text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {icon ?? <ChevronDown aria-hidden="true" className="size-4" />}
      </span>
    </label>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const actionLabel = campaign.status === "Draft" ? "Edit" : "Open";
  const { date, time } = splitUpdatedAtLabel(campaign.updatedAtLabel);

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
        {campaign.recipients === null ? "-" : `${campaign.recipients} found`}
      </td>
      <td className="px-4 py-3">
        {campaign.resumeAttached ? (
          <span className="inline-flex items-center gap-2 font-medium text-foreground">
            <CheckCircle2
              aria-hidden="true"
              className="size-4 text-[hsl(var(--chart-2))]"
            />
            Attached
          </span>
        ) : (
          <span className="text-muted-foreground">Not attached</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        <span className="block whitespace-nowrap">{date}</span>
        <span className="mt-1 block whitespace-nowrap text-xs">{time}</span>
      </td>
      <td className="px-4 py-3 sm:px-5">
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-8 rounded-xl px-3 text-primary"
          >
            {actionLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`More actions for ${campaign.title}`}
            className="rounded-xl text-muted-foreground"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function splitUpdatedAtLabel(label: string) {
  const match = label.match(/^(.+,\s\d{4})\s(.+)$/);
  return {
    date: match?.[1] ?? label,
    time: match?.[2] ?? "",
  };
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
