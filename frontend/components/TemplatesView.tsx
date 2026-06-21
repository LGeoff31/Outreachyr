"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  createEmailTemplate,
  deleteEmailTemplate,
  fetchEmailTemplateRows,
  updateEmailTemplate,
  type EmailTemplateRow,
} from "@/lib/supabase/emailTemplates";

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

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; row: EmailTemplateRow };

export function TemplatesView() {
  const [rows, setRows] = useState<EmailTemplateRow[]>([]);
  const [listLoading, setListLoading] = useState(isSupabaseConfigured());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [formSubject, setFormSubject] = useState("");
  const [formBody, setFormBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] =
    useState<EmailTemplateRow | null>(null);

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setListLoading(false);
      return;
    }
    setListLoading(true);
    setLoadError(null);
    const { rows: next, error } = await fetchEmailTemplateRows();
    if (error) {
      setLoadError(error.message);
      setRows([]);
    } else {
      setRows(next);
    }
    setListLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!editor) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setEditor(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      setFormSubject("");
      setFormBody("");
      return;
    }
    if (editor.mode === "create") {
      setFormSubject("");
      setFormBody("");
    } else {
      setFormSubject(editor.row.subject);
      setFormBody(editor.row.body_text);
    }
  }, [editor]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (normalizedQuery.length === 0) return true;
      const blob = `${r.subject} ${r.body_text}`.toLowerCase();
      return blob.includes(normalizedQuery);
    });
    return [...filtered].sort(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
    );
  }, [query, rows]);

  const openCreate = () => {
    setActionError(null);
    setEditor({ mode: "create" });
  };

  const openEdit = (row: EmailTemplateRow) => {
    setActionError(null);
    setEditor({ mode: "edit", row });
  };

  async function handleSave() {
    if (!editor) return;
    const subject = formSubject.trim();
    const body_text = formBody.trim();
    const name = subject.slice(0, 80) || "Template";
    if (!subject || !body_text) {
      setActionError("Subject and message are required.");
      return;
    }
    setSaving(true);
    setActionError(null);
    if (editor.mode === "create") {
      const { row, error } = await createEmailTemplate({
        name,
        subject,
        body_text,
      });
      if (error || !row) {
        setActionError(error?.message ?? "Could not create template.");
        setSaving(false);
        return;
      }
      setRows((current) => [row, ...current]);
    } else {
      const { row, error } = await updateEmailTemplate(editor.row.id, {
        name,
        subject,
        body_text,
      });
      if (error || !row) {
        setActionError(error?.message ?? "Could not update template.");
        setSaving(false);
        return;
      }
      setRows((current) =>
        current.map((r) => (r.id === row.id ? row : r))
      );
    }
    setSaving(false);
    setEditor(null);
  }

  async function confirmDeleteTemplate() {
    const row = templateToDelete;
    if (!row || deletingId) return;
    setActionError(null);
    setDeletingId(row.id);
    const { error } = await deleteEmailTemplate(row.id);
    setDeletingId(null);
    setTemplateToDelete(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setRows((current) => current.filter((r) => r.id !== row.id));
  }

  const supabaseReady = isSupabaseConfigured();
  const hasRows = rows.length > 0;

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background pb-10">
      <div className="mx-auto flex w-full max-w-[82rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Templates
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Save subject lines and message bodies with merge tokens like{" "}
              <span className="font-mono text-xs">{"{{first_name}}"}</span>.
              Use them from the New campaign page.
            </p>
          </div>
          <Button
            type="button"
            className="min-h-10 rounded-xl px-4 shadow-lg shadow-primary/15 md:mt-1"
            onClick={openCreate}
            disabled={!supabaseReady || listLoading}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            New template
          </Button>
        </div>

        {!supabaseReady ? (
          <Alert>
            <AlertTitle>Sign in required</AlertTitle>
            <AlertDescription>
              Configure Supabase on the frontend and sign in to load and save
              templates to your account.
            </AlertDescription>
          </Alert>
        ) : null}

        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load templates</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : null}

        {actionError ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        <section>
          <label className="relative block min-w-0 max-w-[30rem]">
            <span className="sr-only">Search templates</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by subject or message…"
              className="h-10 rounded-xl bg-card pl-10 text-sm"
              disabled={!supabaseReady}
            />
          </label>
        </section>

        {listLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading templates…
          </div>
        ) : visibleRows.length > 0 ? (
          <section
            aria-label="Templates"
            className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3"
          >
            {visibleRows.map((row) => (
              <Card
                key={row.id}
                className="flex h-full flex-col gap-0 py-0 rounded-2xl bg-card shadow-sm"
              >
                <CardContent className="flex min-h-48 flex-1 flex-col gap-3 p-5">
                  <div className="flex shrink-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold leading-snug text-foreground line-clamp-2">
                        {row.subject}
                      </h2>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-lg"
                        aria-label={`Edit template`}
                        onClick={() => openEdit(row)}
                      >
                        <Pencil aria-hidden className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-lg text-destructive hover:text-destructive"
                        aria-label="Delete template"
                        disabled={deletingId === row.id}
                        onClick={() => setTemplateToDelete(row)}
                      >
                        {deletingId === row.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 aria-hidden className="size-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="line-clamp-4 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {row.body_text}
                  </p>
                  <p className="shrink-0 pt-1 text-xs text-muted-foreground">
                    Updated {formatUpdatedAt(row.updated_at)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : (
          <Card className="rounded-2xl bg-card shadow-sm">
            <CardContent className="p-5">
              <Empty className="min-h-56 border border-dashed border-border bg-muted/40 sm:min-h-[18rem]">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileText aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {hasRows ? "No matching templates" : "No templates yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasRows
                      ? "Try a different search."
                      : "Create a template to reuse outreach copy in campaigns."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        )}
      </div>

      {editor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-black/50"
            aria-label="Close editor"
            onClick={() => setEditor(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-editor-title"
            className="relative z-10 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="border-b border-border px-5 py-4">
              <h2
                id="template-editor-title"
                className="text-lg font-semibold text-foreground"
              >
                {editor.mode === "create"
                  ? "New template"
                  : "Edit template"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Stored in your account; you can apply this from New campaign.
              </p>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium">Subject</span>
                <Input
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="Email subject line"
                  className="rounded-xl"
                  autoFocus
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Message</span>
                <AutosizeTextarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Hi {{first_name}}, ..."
                  className="rounded-xl text-sm leading-6"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(templateToDelete)}
        title="Delete template?"
        description="Delete this template? This cannot be undone."
        confirmLabel="Delete template"
        confirming={Boolean(
          templateToDelete && deletingId === templateToDelete.id
        )}
        onOpenChange={(open) => {
          if (!open && !deletingId) setTemplateToDelete(null);
        }}
        onConfirm={() => void confirmDeleteTemplate()}
      />
    </main>
  );
}
