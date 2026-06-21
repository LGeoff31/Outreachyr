"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil,
  FileText,
  Loader2,
  Plus,
  Search,
  Save,
  Trash2,
  Upload,
  X,
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
import { AutosizeTextarea } from "@/components/ui/textarea";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  deleteUserResume,
  fetchUserResumeRows,
  resumeApiAuthHeaders,
  uploadUserResumePdf,
  updateUserResumeProfile,
  type UserResumeProfile,
  type UserResumeProfilePatch,
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
  profile?: UserResumeProfile;
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
    profile: row.profile,
  };
}

function resumeProfileSummary(profile?: UserResumeProfile) {
  if (!profile) return null;
  if (profile.parse_status === "failed") return "Profile parse failed";
  if (profile.parse_status !== "ready") return "Profile parsing";
  if (!profile.user_confirmed_at) return "Review parsed fields";
  const parts = [
    profile.primary_school_name,
    profile.primary_major,
    profile.grad_year ? String(profile.grad_year) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : null;
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
  const [savingProfile, setSavingProfile] = useState(false);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<ActiveResumePreview | null>(
    null
  );
  const [editingResume, setEditingResume] = useState<ResumeRecord | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pendingReviewResumeId, setPendingReviewResumeId] = useState<
    string | null
  >(null);

  const closeResumePreview = useCallback(() => {
    if (previewBlobUrlRef.current) {
      URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = null;
    }
    setActivePreview(null);
  }, []);

  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    return () => {
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
      objectUrls.clear();
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

  const hasPendingProfiles = useMemo(
    () => resumes.some((resume) => resume.profile?.parse_status === "pending"),
    [resumes]
  );

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    if (!hasPendingProfiles && !pendingReviewResumeId) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      void (async () => {
        const { rows, error } = await fetchUserResumeRows();
        if (cancelled || error) return;
        const nextResumes = rows.map(rowToResumeRecord);
        setResumes(nextResumes);
        if (!pendingReviewResumeId) return;
        const reviewResume = nextResumes.find(
          (resume) => resume.id === pendingReviewResumeId
        );
        if (
          reviewResume?.profile &&
          reviewResume.profile.parse_status !== "pending"
        ) {
          setEditingResume(reviewResume);
          setPendingReviewResumeId(null);
          setProfileError(null);
        }
      })();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hasPendingProfiles, pendingReviewResumeId]);

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
    if (pendingReviewResumeId === resume.id) {
      setPendingReviewResumeId(null);
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
          if (added[0].profile?.parse_status === "pending") {
            setPendingReviewResumeId(added[0].id);
          } else {
            setEditingResume(added[0]);
          }
          setProfileError(null);
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

  async function handleSaveProfile(
    resume: ResumeRecord,
    profile: UserResumeProfilePatch
  ) {
    setSavingProfile(true);
    setProfileError(null);
    const { row, error } = await updateUserResumeProfile(resume.id, profile);
    setSavingProfile(false);
    if (error || !row) {
      setProfileError(error?.message ?? "Could not save profile.");
      return;
    }
    const nextResume = rowToResumeRecord(row);
    setResumes((current) =>
      current.map((item) => (item.id === nextResume.id ? nextResume : item))
    );
    setPendingReviewResumeId(null);
    setEditingResume(null);
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
                onEdit={() => {
                  setProfileError(null);
                  setPendingReviewResumeId(null);
                  setEditingResume(resume);
                }}
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

      {editingResume ? (
        <ResumeProfileEditor
          key={editingResume.id}
          resume={editingResume}
          saving={savingProfile}
          error={profileError}
          onClose={() => {
            if (!savingProfile) {
              setEditingResume(null);
              setProfileError(null);
            }
          }}
          onSave={(profile) => void handleSaveProfile(editingResume, profile)}
        />
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
  onEdit,
}: {
  resume: ResumeRecord;
  deleting: boolean;
  onPreview: (url?: string) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { url, loading } = useResumeThumbnailUrl(resume);
  const canPreview = Boolean(url);
  const profileSummary = resumeProfileSummary(resume.profile);

  return (
    <Card className="flex h-full flex-col gap-0 rounded-2xl bg-card py-0 shadow-sm">
      <CardContent className="flex min-h-56 flex-1 flex-col gap-3 p-5">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {resume.name}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-lg"
              aria-label={`Edit parsed fields for ${resume.name}`}
              onClick={onEdit}
            >
              <Pencil aria-hidden className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-lg text-destructive hover:text-destructive"
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
        {profileSummary ? (
          <p className="shrink-0 text-xs text-muted-foreground">
            {profileSummary}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

type EducationDraft = {
  id: string;
  school: string;
  degree: string;
  major: string;
  startYear: string;
  endYear: string;
  isCurrent: boolean;
};

type ExperienceDraft = {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  highlights: string;
  skills: string;
};

type ProjectDraft = {
  id: string;
  name: string;
  description: string;
  skills: string;
  links: string;
  startDate: string;
  endDate: string;
};

let profileDraftId = 0;

function nextProfileDraftId() {
  profileDraftId += 1;
  return `profile-draft-${profileDraftId}`;
}

function ResumeProfileEditor({
  resume,
  saving,
  error,
  onClose,
  onSave,
}: {
  resume: ResumeRecord;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (profile: UserResumeProfilePatch) => void;
}) {
  const profile = resume.profile;
  const [school, setSchool] = useState(profile?.primary_school_name ?? "");
  const [major, setMajor] = useState(profile?.primary_major ?? "");
  const [gradYear, setGradYear] = useState(
    profile?.grad_year ? String(profile.grad_year) : ""
  );
  const [skills, setSkills] = useState(() =>
    cleanStringList(profile?.skills ?? [])
  );
  const [skillInput, setSkillInput] = useState("");
  const [links, setLinks] = useState(() => cleanStringList(profile?.links ?? []));
  const [linkInput, setLinkInput] = useState("");
  const [education, setEducation] = useState(() =>
    normalizeEducationDrafts(profile?.education ?? [])
  );
  const [experience, setExperience] = useState(() =>
    normalizeExperienceDrafts(profile?.experience ?? [])
  );
  const [projects, setProjects] = useState(() =>
    normalizeProjectDrafts(profile?.projects ?? [])
  );

  const parsedGradYear = parseGradYear(gradYear);
  const gradYearInvalid = gradYear.trim().length > 0 && parsedGradYear == null;

  function saveProfile() {
    onSave({
      primary_school_name: cleanNullable(school),
      primary_major: cleanNullable(major),
      grad_year: parsedGradYear,
      skills: cleanStringList(skills),
      education: education.map(educationDraftToRecord).filter(hasRecordValues),
      experience: experience.map(experienceDraftToRecord).filter(hasRecordValues),
      projects: projects.map(projectDraftToRecord).filter(hasRecordValues),
      links: cleanStringList(links),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 border-0 bg-black/50"
        aria-label="Close profile editor"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-profile-editor-title"
        className="relative z-10 flex max-h-[min(48rem,calc(100vh-1.5rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="resume-profile-editor-title"
              className="truncate text-base font-semibold text-foreground"
            >
              Review parsed fields
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {resume.name}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            disabled={saving}
            onClick={onClose}
          >
            <X aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="School" value={school} onChange={setSchool} />
            <TextField label="Major" value={major} onChange={setMajor} />
            <TextField
              label="Grad year"
              value={gradYear}
              inputMode="numeric"
              invalid={gradYearInvalid}
              onChange={setGradYear}
            />
          </div>

          <div className="mt-5 grid gap-5">
            <StringListEditor
              label="Skills"
              values={skills}
              inputValue={skillInput}
              addLabel="Add skill"
              onInputChange={setSkillInput}
              onAdd={(value) => {
                setSkills((current) => appendUniqueString(current, value));
                setSkillInput("");
              }}
              onRemove={(index) =>
                setSkills((current) => removeAtIndex(current, index))
              }
            />

            <EducationEditor
              items={education}
              onAdd={() =>
                setEducation((current) => [...current, emptyEducationDraft()])
              }
              onRemove={(index) =>
                setEducation((current) => removeAtIndex(current, index))
              }
              onChange={(index, patch) =>
                setEducation((current) =>
                  updateDraftAtIndex(current, index, patch)
                )
              }
            />

            <ExperienceEditor
              items={experience}
              onAdd={() =>
                setExperience((current) => [...current, emptyExperienceDraft()])
              }
              onRemove={(index) =>
                setExperience((current) => removeAtIndex(current, index))
              }
              onChange={(index, patch) =>
                setExperience((current) =>
                  updateDraftAtIndex(current, index, patch)
                )
              }
            />

            <ProjectEditor
              items={projects}
              onAdd={() =>
                setProjects((current) => [...current, emptyProjectDraft()])
              }
              onRemove={(index) =>
                setProjects((current) => removeAtIndex(current, index))
              }
              onChange={(index, patch) =>
                setProjects((current) => updateDraftAtIndex(current, index, patch))
              }
            />

            <StringListEditor
              label="Links"
              values={links}
              inputValue={linkInput}
              addLabel="Add link"
              onInputChange={setLinkInput}
              onAdd={(value) => {
                setLinks((current) => appendUniqueString(current, value));
                setLinkInput("");
              }}
              onRemove={(index) =>
                setLinks((current) => removeAtIndex(current, index))
              }
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {error ? (
              <p className="text-destructive" role="alert">
                {error}
              </p>
            ) : gradYearInvalid ? (
              <p className="text-destructive" role="alert">
                Enter a valid 4-digit year.
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={saving || gradYearInvalid}
              onClick={saveProfile}
            >
              {saving ? (
                <Loader2
                  className="size-4 animate-spin"
                  data-icon="inline-start"
                  aria-hidden
                />
              ) : (
                <Save data-icon="inline-start" aria-hidden />
              )}
              Save fields
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  addLabel,
  onAdd,
}: {
  title: string;
  count: number;
  addLabel?: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{count} saved</p>
      </div>
      {addLabel && onAdd ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-xl"
          onClick={onAdd}
        >
          <Plus data-icon="inline-start" aria-hidden />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  inputMode,
  invalid,
  onChange,
}: {
  label: string;
  value: string;
  inputMode?: "numeric";
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        value={value}
        inputMode={inputMode}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 rounded-xl text-sm"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  rows = 2,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <AutosizeTextarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 rounded-xl text-sm leading-relaxed"
      />
    </label>
  );
}

function StringListEditor({
  label,
  values,
  inputValue,
  addLabel,
  onInputChange,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  inputValue: string;
  addLabel: string;
  onInputChange: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="min-w-0 border-t border-border pt-5">
      <SectionHeader
        title={label}
        count={values.length}
      />
      {values.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((value, index) => (
            <span
              key={`${value}-${index}`}
              className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground"
            >
              <span className="truncate">{value}</span>
              <button
                type="button"
                className="rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${value}`}
                onClick={() => onRemove(index)}
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Input
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd(inputValue);
            }
          }}
          className="h-10 rounded-xl text-sm"
        />
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={() => onAdd(inputValue)}
        >
          <Plus data-icon="inline-start" aria-hidden />
          Add
        </Button>
      </div>
    </section>
  );
}

function EducationEditor({
  items,
  onAdd,
  onRemove,
  onChange,
}: {
  items: EducationDraft[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, patch: Partial<EducationDraft>) => void;
}) {
  return (
    <section className="min-w-0 border-t border-border pt-5">
      <SectionHeader
        title="Education"
        count={items.length}
        addLabel="Add school"
        onAdd={onAdd}
      />
      <div className="mt-3 grid gap-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-background/40 p-4"
          >
            <ItemHeader
              title={item.school || "Education"}
              onRemove={() => onRemove(index)}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label="School"
                value={item.school}
                onChange={(value) => onChange(index, { school: value })}
              />
              <TextField
                label="Degree"
                value={item.degree}
                onChange={(value) => onChange(index, { degree: value })}
              />
              <TextField
                label="Major"
                value={item.major}
                onChange={(value) => onChange(index, { major: value })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Start"
                  value={item.startYear}
                  inputMode="numeric"
                  onChange={(value) => onChange(index, { startYear: value })}
                />
                <TextField
                  label="End"
                  value={item.endYear}
                  inputMode="numeric"
                  onChange={(value) => onChange(index, { endYear: value })}
                />
              </div>
            </div>
            <CheckboxField
              label="Current"
              checked={item.isCurrent}
              onChange={(value) => onChange(index, { isCurrent: value })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ExperienceEditor({
  items,
  onAdd,
  onRemove,
  onChange,
}: {
  items: ExperienceDraft[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, patch: Partial<ExperienceDraft>) => void;
}) {
  return (
    <section className="min-w-0 border-t border-border pt-5">
      <SectionHeader
        title="Experience"
        count={items.length}
        addLabel="Add role"
        onAdd={onAdd}
      />
      <div className="mt-3 grid gap-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-background/40 p-4"
          >
            <ItemHeader
              title={formatTitleSubtitle(item.title, item.company) || "Experience"}
              onRemove={() => onRemove(index)}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label="Title"
                value={item.title}
                onChange={(value) => onChange(index, { title: value })}
              />
              <TextField
                label="Company"
                value={item.company}
                onChange={(value) => onChange(index, { company: value })}
              />
              <TextField
                label="Location"
                value={item.location}
                onChange={(value) => onChange(index, { location: value })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Start"
                  value={item.startDate}
                  onChange={(value) => onChange(index, { startDate: value })}
                />
                <TextField
                  label="End"
                  value={item.endDate}
                  onChange={(value) => onChange(index, { endDate: value })}
                />
              </div>
            </div>
            <div className="mt-3 grid gap-3">
              <TextareaField
                label="Description"
                value={item.description}
                onChange={(value) => onChange(index, { description: value })}
              />
              <TextareaField
                label="Highlights"
                value={item.highlights}
                onChange={(value) => onChange(index, { highlights: value })}
              />
              <TextField
                label="Skills"
                value={item.skills}
                onChange={(value) => onChange(index, { skills: value })}
              />
            </div>
            <CheckboxField
              label="Current"
              checked={item.isCurrent}
              onChange={(value) => onChange(index, { isCurrent: value })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectEditor({
  items,
  onAdd,
  onRemove,
  onChange,
}: {
  items: ProjectDraft[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, patch: Partial<ProjectDraft>) => void;
}) {
  return (
    <section className="min-w-0 border-t border-border pt-5">
      <SectionHeader
        title="Projects"
        count={items.length}
        addLabel="Add project"
        onAdd={onAdd}
      />
      <div className="mt-3 grid gap-3">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-xl border border-border bg-background/40 p-4"
          >
            <ItemHeader
              title={item.name || "Project"}
              onRemove={() => onRemove(index)}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label="Name"
                value={item.name}
                onChange={(value) => onChange(index, { name: value })}
              />
              <TextField
                label="Skills"
                value={item.skills}
                onChange={(value) => onChange(index, { skills: value })}
              />
              <TextField
                label="Start"
                value={item.startDate}
                onChange={(value) => onChange(index, { startDate: value })}
              />
              <TextField
                label="End"
                value={item.endDate}
                onChange={(value) => onChange(index, { endDate: value })}
              />
            </div>
            <div className="mt-3 grid gap-3">
              <TextareaField
                label="Description"
                value={item.description}
                onChange={(value) => onChange(index, { description: value })}
              />
              <TextareaField
                label="Links"
                value={item.links}
                onChange={(value) => onChange(index, { links: value })}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ItemHeader({
  title,
  onRemove,
}: {
  title: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h4 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {title}
      </h4>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 rounded-lg text-destructive hover:text-destructive"
        aria-label={`Remove ${title}`}
        onClick={onRemove}
      >
        <Trash2 aria-hidden className="size-4" />
      </Button>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="mt-3 flex w-fit items-center gap-2 text-xs font-medium text-muted-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-border"
      />
      {label}
    </label>
  );
}

function cleanNullable(value: string) {
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

function parseGradYear(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  if (!/^\d{4}$/.test(clean)) return null;
  const year = Number(clean);
  return year >= 1900 && year <= 2200 ? year : null;
}

function parseDelimitedList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanStringList(values: unknown[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = String(value ?? "").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function appendUniqueString(values: string[], value: string) {
  return cleanStringList([...values, value]);
}

function removeAtIndex<T>(values: T[], index: number) {
  return values.filter((_, itemIndex) => itemIndex !== index);
}

function updateDraftAtIndex<T>(values: T[], index: number, patch: Partial<T>) {
  return values.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...patch } : item
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value == null) return "";
  return String(value);
}

function boolFromRecord(record: Record<string, unknown>, key: string) {
  return record[key] === true;
}

function normalizeEducationDrafts(values: unknown[]) {
  const drafts = values.filter(isRecord).map((record) => ({
    id: nextProfileDraftId(),
    school: textFromRecord(record, "school"),
    degree: textFromRecord(record, "degree"),
    major: textFromRecord(record, "major"),
    startYear: textFromRecord(record, "start_year"),
    endYear: textFromRecord(record, "end_year"),
    isCurrent: boolFromRecord(record, "is_current"),
  }));
  return drafts.length > 0 ? drafts : [];
}

function normalizeExperienceDrafts(values: unknown[]) {
  const drafts = values.filter(isRecord).map((record) => ({
    id: nextProfileDraftId(),
    title: textFromRecord(record, "title"),
    company: textFromRecord(record, "company"),
    location: textFromRecord(record, "location"),
    startDate: textFromRecord(record, "start_date"),
    endDate: textFromRecord(record, "end_date"),
    isCurrent: boolFromRecord(record, "is_current"),
    description: textFromRecord(record, "description"),
    highlights: textFromRecord(record, "highlights"),
    skills:
      textFromRecord(record, "skills") ||
      textFromRecord(record, "technologies"),
  }));
  return drafts.length > 0 ? drafts : [];
}

function normalizeProjectDrafts(values: unknown[]) {
  const drafts = values.filter(isRecord).map((record) => ({
    id: nextProfileDraftId(),
    name: textFromRecord(record, "name"),
    description: textFromRecord(record, "description"),
    skills:
      textFromRecord(record, "skills") ||
      textFromRecord(record, "technologies"),
    links: textFromRecord(record, "links"),
    startDate: textFromRecord(record, "start_date"),
    endDate: textFromRecord(record, "end_date"),
  }));
  return drafts.length > 0 ? drafts : [];
}

function emptyEducationDraft(): EducationDraft {
  return {
    id: nextProfileDraftId(),
    school: "",
    degree: "",
    major: "",
    startYear: "",
    endYear: "",
    isCurrent: false,
  };
}

function emptyExperienceDraft(): ExperienceDraft {
  return {
    id: nextProfileDraftId(),
    title: "",
    company: "",
    location: "",
    startDate: "",
    endDate: "",
    isCurrent: false,
    description: "",
    highlights: "",
    skills: "",
  };
}

function emptyProjectDraft(): ProjectDraft {
  return {
    id: nextProfileDraftId(),
    name: "",
    description: "",
    skills: "",
    links: "",
    startDate: "",
    endDate: "",
  };
}

function educationDraftToRecord(item: EducationDraft) {
  const record: Record<string, unknown> = {};
  assignCleanText(record, "school", item.school);
  assignCleanText(record, "degree", item.degree);
  assignCleanText(record, "major", item.major);
  assignCleanYear(record, "start_year", item.startYear);
  assignCleanYear(record, "end_year", item.endYear);
  if (hasRecordValues(record)) record.is_current = item.isCurrent;
  return record;
}

function experienceDraftToRecord(item: ExperienceDraft) {
  const record: Record<string, unknown> = {};
  assignCleanText(record, "title", item.title);
  assignCleanText(record, "company", item.company);
  assignCleanText(record, "location", item.location);
  assignCleanText(record, "start_date", item.startDate);
  assignCleanText(record, "end_date", item.endDate);
  assignCleanText(record, "description", item.description);
  assignCleanList(record, "highlights", parseLineList(item.highlights));
  assignCleanList(record, "skills", parseDelimitedList(item.skills));
  if (hasRecordValues(record)) record.is_current = item.isCurrent;
  return record;
}

function projectDraftToRecord(item: ProjectDraft) {
  const record: Record<string, unknown> = {};
  assignCleanText(record, "name", item.name);
  assignCleanText(record, "description", item.description);
  assignCleanText(record, "start_date", item.startDate);
  assignCleanText(record, "end_date", item.endDate);
  assignCleanList(record, "skills", parseDelimitedList(item.skills));
  assignCleanList(record, "links", parseLineList(item.links));
  return record;
}

function assignCleanText(
  record: Record<string, unknown>,
  key: string,
  value: string
) {
  const clean = cleanNullable(value);
  if (clean) record[key] = clean;
}

function assignCleanYear(
  record: Record<string, unknown>,
  key: string,
  value: string
) {
  const year = parseGradYear(value);
  if (year != null) record[key] = year;
}

function assignCleanList(
  record: Record<string, unknown>,
  key: string,
  values: string[]
) {
  const clean = cleanStringList(values);
  if (clean.length > 0) record[key] = clean;
}

function hasRecordValues(record: Record<string, unknown>) {
  return Object.keys(record).length > 0;
}

function formatTitleSubtitle(title: string, subtitle: string) {
  const cleanTitle = title.trim();
  const cleanSubtitle = subtitle.trim();
  if (cleanTitle && cleanSubtitle) return `${cleanTitle} - ${cleanSubtitle}`;
  return cleanTitle || cleanSubtitle;
}
