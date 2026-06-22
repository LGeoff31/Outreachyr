"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AutosizeTextarea } from "@/components/ui/textarea";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SendFeedbackButtonProps = {
  className?: string;
  variant?: "nav" | "header" | "link";
};

export function SendFeedbackButton({
  className,
  variant = "nav",
}: SendFeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [fromEmail, setFromEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !sending) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, sending]);

  useEffect(() => {
    if (!open) {
      setMessage("");
      setFromEmail(null);
      setSending(false);
      setSent(false);
      setError(null);
      return;
    }

    if (!isSupabaseConfigured()) return;

    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setFromEmail(data.user?.email?.trim() ?? null);
      })
      .catch(() => {
        if (!cancelled) setFromEmail(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/send-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, fromEmail }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not send feedback.");
        return;
      }
      setSent(true);
      window.setTimeout(() => setOpen(false), 1500);
    } catch {
      setError("Could not send feedback.");
    } finally {
      setSending(false);
    }
  }

  const trigger =
    variant === "link" ? (
      <button
        type="button"
        className={cn(
          "font-medium text-foreground/80 underline-offset-4 transition hover:text-foreground hover:underline",
          className
        )}
        onClick={() => setOpen(true)}
      >
        Send feedback
      </button>
    ) : variant === "header" ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("rounded-xl", className)}
        onClick={() => setOpen(true)}
      >
        <HelpCircle data-icon="inline-start" aria-hidden="true" />
        Feedback
      </Button>
    ) : (
      <button
        type="button"
        className={cn(
          "inline-flex min-h-11 w-full items-center justify-start gap-2 rounded-xl px-4 text-left text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground",
          className
        )}
        onClick={() => setOpen(true)}
      >
        <HelpCircle aria-hidden="true" className="size-4 shrink-0" />
        Send feedback
      </button>
    );

  return (
    <>
      {trigger}

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-black/50"
            aria-label="Close feedback form"
            disabled={sending}
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
            className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="border-b border-border px-5 py-4">
              <h2
                id="feedback-dialog-title"
                className="text-lg font-semibold text-foreground"
              >
                Send feedback
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Share a bug, idea, or anything else. We read each one.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              {sent ? (
                <p className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--chart-2))]">
                  <CheckCircle2 aria-hidden className="size-4" />
                  Thanks — feedback sent.
                </p>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Message</span>
                  <AutosizeTextarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="What's on your mind?"
                    className="rounded-xl text-sm leading-relaxed"
                    autoFocus
                    disabled={sending}
                  />
                </label>
              )}
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            {!sent ? (
              <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={sending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={!message.trim() || sending}
                  onClick={() => void handleSend()}
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    "Send feedback"
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
