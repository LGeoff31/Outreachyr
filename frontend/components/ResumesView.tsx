"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Search,
  Trash2,
  Upload,
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
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  deleteUserResume,
  fetchUserResumeRows,
  resumeApiAuthHeaders,
  uploadUserResumePdf,
  type UserResumeRow,
} from "@/lib/supabase/userResumes";

type ResumeRecord = {
  id: string;
  name: string;
  fileSize: string;
  usedInCampaigns: number;
  updatedAt: string;
  storagePath?: string;
  previewUrl?: string;
};

type ActiveResumePreview = { name: string; url: string; resumeId: string };

const emptyResumes: ResumeRecord[] = [];

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
  return {
    id: row.id,
    name: row.display_name,
    fileSize: row.byte_size != null ? formatFileSize(row.byte_size) : "—",
    usedInCampaigns: row.used_in_campaigns,
    updatedAt: row.updated_at,
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const visibleResumes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const nextResumes = resumes.filter((resume) => {
      if (normalizedQuery.length === 0) return true;
      return resume.name.toLowerCase().includes(normalizedQuery);
    });
    return nextResumes.sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [query, resumes]);

  const hasResumes = resumes.length > 0;

  async function handleDelete(resume: ResumeRecord) {
    if (
      !window.confirm(
        `Remove “${resume.name}” from your library? This cannot be undone.`
      )
    ) {
      return;
    }
    setActionError(null);
    if (activePreview?.resumeId === resume.id) {
      closeResumePreview();
    }
    if (!isSupabaseConfigured()) {
      if (resume.previewUrl) {
        objectUrlsRef.current.delete(resume.previewUrl);
        URL.revokeObjectURL(resume.previewUrl);
      }
      setResumes((current) => current.filter((item) => item.id !== resume.id));
      return;
    }
    setDeletingId(resume.id);
    const { error } = await deleteUserResume(resume.id);
    setDeletingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setResumes((current) => current.filter((item) => item.id !== resume.id));
  }

  async function openResumePreview(resume: ResumeRecord, existingUrl?: string) {
    setActionError(null);
    closeResumePreview();
    if (existingUrl) {
      setActivePreview({
        name: resume.name,
        url: existingUrl,
        resumeId: resume.id,
      });
      return;
    }
    if (resume.previewUrl) {
      setActivePreview({
        name: resume.name,
        url: resume.previewUrl,
        resumeId: resume.id,
      });
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
      setActivePreview({ name: resume.name, url, resumeId: resume.id });
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
        }
      } finally {
        setUploading(false);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const uploadedResumes = Array.from(files).map((file, index) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return {
        id: `${file.name}-${file.lastModified}-${index}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        fileSize: formatFileSize(file.size),
        usedInCampaigns: 0,
        updatedAt: new Date().toISOString(),
        previewUrl,
      };
    });

    setResumes((current) => [...uploadedResumes, ...current]);
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
              Upload PDFs to attach them in outreach campaigns.
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

        <section>
          <label className="relative block min-w-0 max-w-[30rem]">
            <span className="sr-only">Search resumes</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search resumes…"
              className="h-10 rounded-xl bg-card pl-10 text-sm"
            />
          </label>
        </section>

        {listLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading resumes…
          </div>
        ) : visibleResumes.length > 0 ? (
          <section
            aria-label="Resumes"
            className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3"
          >
            {visibleResumes.map((resume) => (
              <ResumeCard
                key={resume.id}
                resume={resume}
                deleting={deletingId === resume.id}
                onPreview={(url) => void openResumePreview(resume, url)}
                onDelete={() => void handleDelete(resume)}
              />
            ))}
          </section>
        ) : (
          <Card className="rounded-2xl bg-card shadow-sm">
            <CardContent className="p-5">
              <ResumesEmptyState hasResumes={hasResumes} />
            </CardContent>
          </Card>
        )}
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

function ResumesEmptyState({ hasResumes }: { hasResumes: boolean }) {
  return (
    <Empty className="min-h-56 border border-dashed border-border bg-muted/40 sm:min-h-[18rem]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          {hasResumes ? "No matching resumes" : "No resumes yet"}
        </EmptyTitle>
        <EmptyDescription>
          {hasResumes
            ? "Try different keywords in your search."
            : "Upload a resume when you are ready to attach it to campaigns."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function useResumeThumbnailUrl(resume: ResumeRecord) {
  const [url, setUrl] = useState<string | null>(resume.previewUrl ?? null);
  const [loading, setLoading] = useState(
    !resume.previewUrl && Boolean(resume.storagePath && resume.id)
  );
  const ownedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (resume.previewUrl) {
      setUrl(resume.previewUrl);
      setLoading(false);
      return;
    }

    if (!resume.storagePath || !resume.id || !isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/user-resumes/${encodeURIComponent(resume.id)}/file`,
          { headers: await resumeApiAuthHeaders() }
        );
        if (!res.ok) throw new Error("Could not load preview");
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
  }, [resume.id, resume.previewUrl, resume.storagePath]);

  return { url, loading };
}

function ResumeCard({
  resume,
  deleting,
  onPreview,
  onDelete,
}: {
  resume: ResumeRecord;
  deleting: boolean;
  onPreview: (url?: string) => void;
  onDelete: () => void;
}) {
  const { url, loading } = useResumeThumbnailUrl(resume);
  const canPreview = Boolean(url);

  return (
    <Card className="flex h-full flex-col gap-0 rounded-2xl bg-card py-0 shadow-sm">
      <CardContent className="flex min-h-56 flex-1 flex-col gap-3 p-5">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {resume.name}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 rounded-lg text-destructive hover:text-destructive"
            aria-label={`Delete ${resume.name}`}
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 aria-hidden className="size-4" />
            )}
          </Button>
        </div>

        <button
          type="button"
          disabled={!canPreview && !loading}
          aria-label={`Preview ${resume.name}`}
          onClick={() => onPreview(url ?? undefined)}
          className="relative flex min-h-40 flex-1 overflow-hidden rounded-xl border border-border bg-muted/30 transition-colors hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-muted/30"
        >
          {loading ? (
            <span className="flex size-full items-center justify-center">
              <Loader2
                aria-hidden
                className="size-5 animate-spin text-muted-foreground"
              />
            </span>
          ) : url ? (
            <iframe
              src={`${url}#page=1&view=FitH&toolbar=0&navpanes=0`}
              title={`Preview of ${resume.name}`}
              className="pointer-events-none absolute inset-x-0 top-0 h-[240%] w-full border-0 bg-card"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <FileText
                aria-hidden
                className="size-8 text-muted-foreground/40"
              />
            </span>
          )}
        </button>

        <p className="shrink-0 pt-1 text-xs text-muted-foreground">
          Updated {formatUpdatedAt(resume.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
}
