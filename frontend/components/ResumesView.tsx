"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Upload,
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
import {
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  fetchUserResumeRows,
  resumeApiAuthHeaders,
  setUserResumeAsDefault,
  uploadUserResumePdf,
  type UserResumeRow,
} from "@/lib/supabase/userResumes";

type ResumeStatus = "Ready" | "Default" | "Draft" | "Archived";

type ResumeRecord = {
  id: string;
  name: string;
  focus: string;
  fileType: string;
  fileSize: string;
  usedInCampaigns: number;
  updatedAt: string;
  status: ResumeStatus;
  /** Supabase Storage path (`userId/resumeId.pdf`) when saved. */
  storagePath?: string;
  /** Local blob URL before persistence or offline fallback. */
  previewUrl?: string;
};

type ActiveResumePreview = { name: string; url: string };

const emptyResumes: ResumeRecord[] = [];
const pageSize = 6;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUpdatedAt(value: string) {
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

function rowToResumeRecord(row: UserResumeRow): ResumeRecord {
  const s = row.status as ResumeStatus;
  const normalized: ResumeStatus =
    s === "Draft" || s === "Archived" ? s : "Ready";
  return {
    id: row.id,
    name: row.display_name,
    focus: row.focus,
    fileType: row.file_type,
    fileSize:
      row.byte_size != null ? formatFileSize(row.byte_size) : "—",
    usedInCampaigns: row.used_in_campaigns,
    updatedAt: row.updated_at,
    status: row.is_default ? "Default" : normalized,
    storagePath: row.resume_storage_path,
  };
}

export function ResumesView({
  initialResumes = emptyResumes,
}: {
  initialResumes?: ResumeRecord[];
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const [resumes, setResumes] = useState<ResumeRecord[]>(initialResumes);
  const [listLoading, setListLoading] = useState(isSupabaseConfigured());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState("All roles");
  const [status, setStatus] = useState("All statuses");
  const [sortBy, setSortBy] = useState("Last updated");
  const [page, setPage] = useState(1);
  const [activePreview, setActivePreview] = useState<ActiveResumePreview | null>(
    null
  );

  const closeResumePreview = useCallback(() => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
    setActivePreview(null);
  }, []);

  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      objectUrlsRef.current.clear();
      if (previewBlobUrlRef.current) {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setListLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setListLoading(true);
      setLoadError(null);
      const { rows, error } = await fetchUserResumeRows();
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        setResumes([]);
      } else {
        setResumes(rows.map(rowToResumeRecord));
      }
      setListLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activePreview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeResumePreview();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [activePreview, closeResumePreview]);

  const focusOptions = useMemo(
    () => [
      "All roles",
      ...Array.from(new Set(resumes.map((resume) => resume.focus))).sort(),
    ],
    [resumes]
  );

  const filteredResumes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextResumes = resumes.filter((resume) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        `${resume.name} ${resume.focus} ${resume.fileType} ${resume.status}`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesFocus = focus === "All roles" || resume.focus === focus;
      const matchesStatus =
        status === "All statuses" || resume.status === status;

      return matchesQuery && matchesFocus && matchesStatus;
    });

    return nextResumes.sort((a, b) => {
      if (sortBy === "Name") return a.name.localeCompare(b.name);
      if (sortBy === "Role / Focus") return a.focus.localeCompare(b.focus);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [focus, query, resumes, sortBy, status]);

  const pageCount = Math.max(1, Math.ceil(filteredResumes.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleResumes = filteredResumes.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );
  const visibleStart =
    filteredResumes.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const visibleEnd = Math.min(safePage * pageSize, filteredResumes.length);
  const hasResumes = resumes.length > 0;

  function resetPage(next: () => void) {
    next();
    setPage(1);
  }

  async function openResumePreview(resume: ResumeRecord) {
    setActionError(null);
    closeResumePreview();
    if (resume.previewUrl) {
      setActivePreview({ name: resume.name, url: resume.previewUrl });
      return;
    }
    if (!resume.storagePath || !resume.id) return;
    if (!isSupabaseConfigured()) return;

    try {
      const res = await fetch(
        `/api/user-resumes/${encodeURIComponent(resume.id)}/file`,
        { headers: await resumeApiAuthHeaders() }
      );
      if (!res.ok) {
        const text = await res.text();
        setActionError(text || "Could not open preview.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewBlobUrlRef.current = url;
      setActivePreview({ name: resume.name, url });
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not open preview."
      );
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setActionError(null);

    if (isSupabaseConfigured()) {
      setUploading(true);
      const added: ResumeRecord[] = [];
      try {
        for (const file of Array.from(files)) {
          const { row, error } = await uploadUserResumePdf(file);
          if (error || !row) {
            setActionError(error?.message ?? "Upload failed.");
            break;
          }
          added.push(rowToResumeRecord(row));
        }
        if (added.length > 0) {
          setResumes((current) => [...added, ...current]);
          setPage(1);
        }
      } finally {
        setUploading(false);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const uploadedResumes = Array.from(files).map((file, index) => {
      const extension = file.name.split(".").pop()?.toUpperCase() || "FILE";
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return {
        id: `${file.name}-${file.lastModified}-${index}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        focus: "Unassigned",
        fileType: extension,
        fileSize: formatFileSize(file.size),
        usedInCampaigns: 0,
        updatedAt: new Date().toISOString(),
        status: "Ready" as ResumeStatus,
        previewUrl,
      };
    });

    setResumes((current) => [...uploadedResumes, ...current]);
    setPage(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background pb-10">
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Resumes
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Upload, organize, and choose the right resume for each outreach
              campaign.
            </p>
            {loadError ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                Could not load resumes: {loadError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-stretch gap-2 md:items-end">
            <Input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(event) => void handleUpload(event.target.files)}
            />
            <Button
              type="button"
              disabled={uploading}
              className="min-h-10 rounded-xl px-4 shadow-lg shadow-primary/15 md:mt-1"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2
                  className="size-4 animate-spin"
                  data-icon="inline-start"
                  aria-hidden="true"
                />
              ) : (
                <Upload data-icon="inline-start" aria-hidden="true" />
              )}
              {uploading ? "Uploading…" : "Upload resume"}
            </Button>
            {actionError ? (
              <p className="text-right text-sm text-destructive md:max-w-xs">
                {actionError}
              </p>
            ) : null}
          </div>
        </div>

        <section className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_minmax(16rem,0.62fr)_minmax(16rem,0.62fr)_minmax(16rem,0.62fr)]">
          <label className="relative block min-w-0">
            <span className="sr-only">Search resumes</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) =>
                resetPage(() => setQuery(event.target.value))
              }
              placeholder="Search resumes..."
              className="h-10 rounded-xl bg-card pl-10 text-sm"
            />
          </label>

          <FilterSelect
            label="Role / Focus"
            value={focus}
            onChange={(value) => resetPage(() => setFocus(value))}
            options={focusOptions}
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={(value) => resetPage(() => setStatus(value))}
            options={["All statuses", "Ready", "Default", "Draft", "Archived"]}
          />
          <FilterSelect
            label="Sort by"
            value={sortBy}
            onChange={(value) => resetPage(() => setSortBy(value))}
            options={["Last updated", "Name", "Role / Focus"]}
            icon={<SlidersHorizontal aria-hidden="true" className="size-4" />}
          />
        </section>

        <Card className="rounded-2xl bg-card py-0 shadow-sm">
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] table-fixed border-collapse text-left text-sm lg:min-w-full">
                <colgroup>
                  <col className="w-[27%]" />
                  <col className="w-[15%]" />
                  <col className="w-[10%]" />
                  <col className="w-[15%]" />
                  <col className="w-[14%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-xs font-semibold text-foreground">
                    <th className="px-4 py-3 sm:px-5">Resume</th>
                    <th className="px-4 py-3">Focus</th>
                    <th className="px-4 py-3">File type</th>
                    <th className="px-4 py-3">Used in campaigns</th>
                    <th className="px-4 py-3">Last updated</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadError ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-sm text-destructive sm:px-5"
                      >
                        {loadError}
                      </td>
                    </tr>
                  ) : listLoading ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-16 text-center text-muted-foreground sm:px-5"
                      >
                        <Loader2
                          className="mx-auto size-8 animate-spin"
                          aria-label="Loading resumes"
                        />
                      </td>
                    </tr>
                  ) : visibleResumes.length > 0 ? (
                    visibleResumes.map((resume) => (
                      <ResumeRow
                        key={resume.id}
                        resume={resume}
                        onPreview={() => void openResumePreview(resume)}
                        onSetDefault={async () => {
                          setActionError(null);
                          if (
                            resume.storagePath &&
                            isSupabaseConfigured()
                          ) {
                            const { error } = await setUserResumeAsDefault(
                              resume.id
                            );
                            if (error) {
                              setActionError(error.message);
                              return;
                            }
                          }
                          setResumes((current) =>
                            current.map((item) => ({
                              ...item,
                              status:
                                item.id === resume.id
                                  ? "Default"
                                  : item.status === "Default"
                                    ? "Ready"
                                    : item.status,
                            }))
                          );
                        }}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 sm:px-5">
                        <div className="sticky left-0 w-[calc(100vw-4.5rem)] lg:static lg:w-auto">
                          <ResumesEmptyState hasResumes={hasResumes} />
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p>
                {filteredResumes.length === 0
                  ? hasResumes
                    ? "No resumes match your filters"
                    : "No resumes yet"
                  : `Showing ${visibleStart} to ${visibleEnd} of ${filteredResumes.length} resumes`}
              </p>
              {filteredResumes.length > 0 && (
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

      {activePreview ? (
        <div className="fixed inset-0 z-50 p-3 sm:p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-black/50"
            aria-label="Close preview"
            onClick={closeResumePreview}
          />
          <iframe
            title={`Resume preview: ${activePreview.name}`}
            src={activePreview.url}
            className="relative z-10 h-full w-full rounded-lg border-0 bg-card shadow-xl"
          />
        </div>
      ) : null}
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

function ResumesEmptyState({ hasResumes }: { hasResumes: boolean }) {
  return (
    <Empty className="min-h-56 border border-dashed border-border bg-muted/40">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          {hasResumes ? "No matching resumes" : "No resumes yet"}
        </EmptyTitle>
        <EmptyDescription>
          {hasResumes
            ? "Adjust your search or filters to see more resumes."
            : "Upload a resume when you are ready to attach it to campaigns."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ResumeRow({
  resume,
  onPreview,
  onSetDefault,
}: {
  resume: ResumeRecord;
  onPreview: () => void;
  onSetDefault: () => void | Promise<void>;
}) {
  const isDefault = resume.status === "Default";
  const canPreview = Boolean(
    resume.previewUrl || (resume.storagePath && resume.id)
  );

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <FileText aria-hidden="true" className="size-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {resume.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {resume.fileSize}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{resume.focus}</td>
      <td className="px-4 py-3">
        <span className="block font-medium text-foreground">
          {resume.fileType}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {resume.usedInCampaigns === 1
          ? "1 campaign"
          : `${resume.usedInCampaigns} campaigns`}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {formatUpdatedAt(resume.updatedAt)}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={resume.status} />
      </td>
      <td className="px-4 py-3 sm:px-5">
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canPreview}
            title={
              canPreview
                ? "Preview PDF"
                : "Preview unavailable for this resume"
            }
            onClick={onPreview}
            className="min-h-8 rounded-xl px-3 text-primary"
          >
            Preview
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDefault}
            onClick={onSetDefault}
            className="min-h-8 rounded-xl px-3"
          >
            {isDefault ? "Default" : "Set default"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`More actions for ${resume.name}`}
            className="rounded-xl text-muted-foreground"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: ResumeStatus }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-lg px-2.5 font-semibold",
        status === "Ready" &&
          "bg-[hsl(var(--chart-2)/0.12)] text-[hsl(var(--chart-2))]",
        status === "Default" &&
          "bg-[hsl(var(--chart-2)/0.14)] text-[hsl(var(--chart-2))]",
        status === "Draft" &&
          "bg-[hsl(var(--chart-3)/0.12)] text-[hsl(var(--chart-3))]",
        status === "Archived" && "bg-secondary text-muted-foreground"
      )}
    >
      {status === "Default" && (
        <CheckCircle2 data-icon="inline-start" aria-hidden="true" />
      )}
      {status}
    </Badge>
  );
}
