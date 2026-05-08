"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  Clock,
  FileText,
  LayoutGrid,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";

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

type TemplateCategory = string;
type TemplateTone = string;

type OutreachTemplate = {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  tone: TemplateTone;
  favorite: boolean;
  lastUsedAt: string | null;
  updatedAt: string;
};

type TemplateTab = "All templates" | "Favorites" | "Recently used";

const emptyTemplates: OutreachTemplate[] = [];

const tabs = [
  { label: "All templates", icon: LayoutGrid },
  { label: "Favorites", icon: Star },
  { label: "Recently used", icon: Clock },
] satisfies Array<{ label: TemplateTab; icon: typeof LayoutGrid }>;

export function TemplatesView({
  templates = emptyTemplates,
}: {
  templates?: OutreachTemplate[];
}) {
  const [activeTab, setActiveTab] = useState<TemplateTab>("All templates");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [tone, setTone] = useState("All tones");
  const [sortBy, setSortBy] = useState("Last updated");

  const categoryOptions = useMemo(
    () => [
      "All categories",
      ...Array.from(new Set(templates.map((template) => template.category))).sort(),
    ],
    [templates]
  );
  const toneOptions = useMemo(
    () => [
      "All tones",
      ...Array.from(new Set(templates.map((template) => template.tone))).sort(),
    ],
    [templates]
  );

  const visibleTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextTemplates = templates.filter((template) => {
      const matchesTab =
        activeTab === "All templates" ||
        (activeTab === "Favorites" && template.favorite) ||
        (activeTab === "Recently used" && template.lastUsedAt !== null);
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${template.title} ${template.description} ${template.category} ${template.tone}`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCategory =
        category === "All categories" || template.category === category;
      const matchesTone = tone === "All tones" || template.tone === tone;

      return matchesTab && matchesQuery && matchesCategory && matchesTone;
    });

    return nextTemplates.sort((a, b) => {
      if (sortBy === "Name") return a.title.localeCompare(b.title);
      if (sortBy === "Category") return a.category.localeCompare(b.category);
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [activeTab, category, query, sortBy, templates, tone]);

  const hasTemplates = templates.length > 0;

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background pb-10">
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Templates
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Save, reuse, and customize your outreach templates.
            </p>
          </div>
          <Button className="min-h-10 rounded-xl px-4 shadow-lg shadow-primary/15 md:mt-1">
            <Plus data-icon="inline-start" aria-hidden="true" />
            New template
          </Button>
        </div>

        <div className="border-b border-border">
          <div
            role="tablist"
            aria-label="Template views"
            className="flex flex-nowrap gap-5 overflow-x-auto"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.label;
              return (
                <button
                  key={tab.label}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.label)}
                  className={cn(
                    "flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-2 text-sm font-medium text-muted-foreground transition hover:text-foreground",
                    isActive && "border-primary text-primary"
                  )}
                >
                  <tab.icon aria-hidden="true" className="size-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <section className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_minmax(16rem,0.66fr)_minmax(16rem,0.66fr)_minmax(16rem,0.66fr)]">
          <label className="relative block min-w-0">
            <span className="sr-only">Search templates</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates..."
              className="h-10 rounded-xl bg-card pl-10 text-sm"
            />
          </label>

          <FilterSelect
            label="Category"
            value={category}
            onChange={setCategory}
            options={categoryOptions}
          />
          <FilterSelect
            label="Tone"
            value={tone}
            onChange={setTone}
            options={toneOptions}
          />
          <FilterSelect
            label="Sort by"
            value={sortBy}
            onChange={setSortBy}
            options={["Last updated", "Name", "Category"]}
            icon={<SlidersHorizontal aria-hidden="true" className="size-4" />}
          />
        </section>

        {visibleTemplates.length > 0 ? (
          <section
            aria-label="Templates"
            className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3"
          >
            {visibleTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </section>
        ) : (
          <Card className="rounded-2xl bg-card shadow-sm">
            <CardContent className="p-5">
              <TemplatesEmptyState
                activeTab={activeTab}
                hasTemplates={hasTemplates}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
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

function TemplatesEmptyState({
  activeTab,
  hasTemplates,
}: {
  activeTab: TemplateTab;
  hasTemplates: boolean;
}) {
  const title = hasTemplates ? "No matching templates" : "No templates yet";
  const description = hasTemplates
    ? "Adjust your search or filters to see more templates."
    : activeTab === "Favorites"
      ? "Favorite templates will appear here once you create and save them."
      : activeTab === "Recently used"
        ? "Templates you use in campaigns will appear here."
        : "Create your first template when you are ready to reuse outreach copy.";

  return (
    <Empty className="min-h-56 border border-dashed border-border bg-muted/40 sm:min-h-[24rem]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function TemplateCard({ template }: { template: OutreachTemplate }) {
  return (
    <Card className="rounded-2xl bg-card shadow-sm">
      <CardContent className="flex min-h-56 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">
              {template.category}
            </p>
            <h2 className="mt-3 text-lg font-semibold leading-snug text-foreground">
              {template.title}
            </h2>
          </div>
          <Star aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          {template.description}
        </p>
      </CardContent>
    </Card>
  );
}
