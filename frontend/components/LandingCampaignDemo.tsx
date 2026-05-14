"use client";

import Link from "next/link";
import {
  FileText,
  Loader2,
  Lock,
  MousePointer2,
  Search,
  SendHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DEMO_COMPANY = "Palantir";

const DEMO_SUBJECT =
  "Fall 2026 Software Engineering Opportunities at Palantir";

const DEMO_BODY = `Hi {{first_name}},

I'm a CS student interested in impactful software at {{company}}.

I'd love to learn more about Fall 2026 opportunities.`;

const RECIPIENTS = [
  {
    name: "Aisha Khan",
    firstName: "Aisha",
    role: "Technical Recruiter",
    location: "San Francisco, CA",
    initials: "AK",
  },
  {
    name: "Michael Park",
    firstName: "Michael",
    role: "Senior Recruiter",
    location: "Palo Alto, CA",
    initials: "MP",
  },
  {
    name: "David Lin",
    firstName: "David",
    role: "University Recruiter",
    location: "New York, NY",
    initials: "DL",
  },
] as const;

const STAGE_H = "min-h-[28rem] sm:min-h-[30rem]";

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function resolveTemplate(
  text: string,
  firstName: string,
  company: string
): string {
  return text
    .replaceAll("{{first_name}}", firstName)
    .replaceAll("{{company}}", company)
    .replaceAll("__FIRST_NAME__", firstName)
    .replaceAll("{{role}}", "recruiting");
}

function Cursor() {
  return (
    <span
      className="ml-px inline-block h-[1em] w-px animate-pulse bg-primary align-text-bottom"
      aria-hidden
    />
  );
}

export function LandingCampaignDemo() {
  const [typedSubject, setTypedSubject] = useState("");
  const [typedBody, setTypedBody] = useState("");
  const [activeField, setActiveField] = useState<"subject" | "body" | null>(
    "subject"
  );
  const [highlightDryRun, setHighlightDryRun] = useState(false);
  const [stage, setStage] = useState<"compose" | "review">("compose");
  const [focusRecipient, setFocusRecipient] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cursorPt, setCursorPt] = useState<{ x: number; y: number } | null>(
    null
  );
  const dryRunWrapRef = useRef<HTMLDivElement>(null);
  const emailCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sendWrapRef = useRef<HTMLDivElement>(null);

  const recipientBodies = useMemo(
    () =>
      RECIPIENTS.map((r) =>
        resolveTemplate(DEMO_BODY, r.firstName, DEMO_COMPANY)
      ),
    []
  );

  useEffect(() => {
    let cancelled = false;
    let reduceMotion = false;
    if (typeof window !== "undefined") {
      reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    }

    async function moveCursorTo(el: HTMLElement | null, pad = 8) {
      if (!el || reduceMotion) return;
      const rect = el.getBoundingClientRect();
      const root = document.getElementById("landing-campaign-demo");
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      setCursorPt({
        x: rect.left - rootRect.left + rect.width / 2,
        y: rect.top - rootRect.top + rect.height / 2 + pad,
      });
      await sleep(320);
    }

    async function hideCursor() {
      setCursorPt(null);
    }

    async function playCycle() {
      if (reduceMotion) {
        setTypedSubject(DEMO_SUBJECT);
        setTypedBody(DEMO_BODY);
        setActiveField(null);
        setStage("review");
        setFocusRecipient(0);
        await sleep(600);
        if (cancelled) return;
        setFocusRecipient(1);
        await sleep(600);
        if (cancelled) return;
        setFocusRecipient(2);
        await sleep(600);
        if (cancelled) return;
        setFocusRecipient(null);
        setSending(true);
        await sleep(600);
        if (cancelled) return;
        setSending(false);
        setSent(true);
        await sleep(2000);
        if (cancelled) return;
        setSent(false);
        setStage("compose");
        await sleep(2800);
        return;
      }

      setTypedSubject("");
      setTypedBody("");
      setActiveField("subject");
      setHighlightDryRun(false);
      setStage("compose");
      setFocusRecipient(null);
      setSending(false);
      setSent(false);
      await hideCursor();

      for (let i = 0; i <= DEMO_SUBJECT.length; i++) {
        if (cancelled) return;
        setTypedSubject(DEMO_SUBJECT.slice(0, i));
        await sleep(20);
      }
      await sleep(280);
      if (cancelled) return;

      setActiveField("body");
      for (let i = 0; i <= DEMO_BODY.length; i++) {
        if (cancelled) return;
        setTypedBody(DEMO_BODY.slice(0, i));
        await sleep(11);
      }
      await sleep(350);
      if (cancelled) return;

      setActiveField(null);
      await sleep(400);
      if (cancelled) return;
      await moveCursorTo(dryRunWrapRef.current);
      setHighlightDryRun(true);
      await sleep(700);
      if (cancelled) return;
      setHighlightDryRun(false);
      await hideCursor();
      setStage("review");
      await sleep(400);
      if (cancelled) return;

      for (let r = 0; r < RECIPIENTS.length; r++) {
        await moveCursorTo(emailCardRefs.current[r]);
        setFocusRecipient(r);
        await sleep(750);
        if (cancelled) return;
      }

      setFocusRecipient(null);
      await hideCursor();
      await sleep(320);
      if (cancelled) return;

      await moveCursorTo(sendWrapRef.current);
      setSending(true);
      await sleep(700);
      if (cancelled) return;
      setSending(false);
      setSent(true);
      await hideCursor();
      await sleep(2200);
      if (cancelled) return;

      setSent(false);
      await sleep(500);
    }

    async function loop() {
      while (!cancelled) {
        await playCycle();
        if (reduceMotion) await sleep(800);
      }
    }

    void loop();
    return () => {
      cancelled = true;
    };
  }, []);

  const badgeLabel = sent
    ? "Sent"
    : stage === "compose"
      ? "Draft"
      : sending
        ? "Sending…"
        : "Ready to send";
  const badgeVariant = sent ? "default" : "secondary";

  return (
    <div
      className="relative min-w-0 max-w-[calc(100vw-2.5rem)] self-start scroll-mt-24 sm:max-w-none"
      id="landing-campaign-demo"
    >
      <div className="absolute inset-0 translate-y-10 rounded-[2rem] bg-primary/10 blur-3xl" />
      <Card className="relative w-full rounded-[1.75rem] bg-card p-5 shadow-2xl shadow-muted-foreground/15 ring-border/80 sm:p-6">
        {cursorPt ? (
          <div
            className="pointer-events-none absolute z-20 transition-all duration-300 ease-out"
            style={{
              left: cursorPt.x,
              top: cursorPt.y,
              transform: "translate(-2px, -2px)",
            }}
            aria-hidden
          >
            <MousePointer2
              className="size-6 text-primary drop-shadow-md"
              strokeWidth={2}
            />
          </div>
        ) : null}

        <CardHeader className="px-0">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            <div>
              <CardTitle>Live demo</CardTitle>
              <CardDescription>
                Draft → personalized previews → send
              </CardDescription>
            </div>
          </div>
          <CardAction>
            <Badge variant={badgeVariant}>{badgeLabel}</Badge>
          </CardAction>
        </CardHeader>

        <CardContent className="px-0">
          <div
            className={cn(
              "pointer-events-none relative overflow-hidden rounded-2xl border border-border bg-background select-none",
              STAGE_H
            )}
          >
            <div
              className={cn(
                "absolute inset-0 flex flex-col transition-opacity duration-300 ease-out",
                stage === "compose"
                  ? "z-10 opacity-100"
                  : "z-0 opacity-0 pointer-events-none"
              )}
            >
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Company
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {DEMO_COMPANY}
                </p>
              </div>
              <Separator />

              <div className="px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Subject
                </p>
                <div className="relative mt-2">
                  <Input
                    readOnly
                    tabIndex={-1}
                    value={typedSubject}
                    className="h-10 cursor-default rounded-xl border-border bg-muted/30 pr-8 text-sm font-medium"
                    aria-hidden
                  />
                  {activeField === "subject" ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                      <Cursor />
                    </span>
                  ) : null}
                </div>
              </div>
              <Separator />

              <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Message
                </p>
                <div className="relative mt-2 min-h-0 flex-1">
                  <Textarea
                    readOnly
                    tabIndex={-1}
                    value={typedBody}
                    className="h-[calc(100%-0px)] min-h-[7.5rem] cursor-default resize-none rounded-xl border-border bg-muted/30 font-mono text-xs leading-relaxed sm:text-sm"
                    aria-hidden
                  />
                  {activeField === "body" ? (
                    <span className="pointer-events-none absolute bottom-3 right-3">
                      <Cursor />
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-auto border-t border-border bg-muted/20 px-5 py-3">
                <div
                  ref={dryRunWrapRef}
                  className="inline-block w-full sm:w-auto"
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={cn(
                      "min-h-10 w-full rounded-xl transition-shadow sm:w-auto",
                      highlightDryRun &&
                        "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                    aria-hidden
                    tabIndex={-1}
                  >
                    <Search aria-hidden className="size-4" />
                    Run dry run
                  </Button>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "absolute inset-0 flex flex-col overflow-y-auto transition-opacity duration-300 ease-out",
                stage === "review"
                  ? "z-10 opacity-100"
                  : "z-0 opacity-0 pointer-events-none"
              )}
            >
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Outgoing mail
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {RECIPIENTS.length} personalized emails
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Each message is filled for the recipient before you send.
                </p>
              </div>
              <Separator />

              <div className="flex flex-1 flex-col gap-2.5 px-5 py-4">
                {RECIPIENTS.map((person, i) => (
                  <div
                    key={person.name}
                    ref={(el) => {
                      emailCardRefs.current[i] = el;
                    }}
                    className={cn(
                      "rounded-xl border bg-muted/25 px-3 py-3 transition-colors",
                      focusRecipient === i &&
                        "border-primary/40 bg-primary/8 ring-1 ring-primary/20"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="text-[0.65rem]">
                          {person.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                          To
                        </p>
                        <p className="truncate text-xs font-medium text-foreground">
                          {person.name}
                        </p>
                        <p className="truncate text-[0.7rem] text-muted-foreground">
                          {person.role} · {person.location}
                        </p>
                        <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                          Subject
                        </p>
                        <p className="line-clamp-1 text-xs font-semibold text-foreground">
                          {DEMO_SUBJECT}
                        </p>
                        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[0.75rem] leading-relaxed text-muted-foreground">
                          {recipientBodies[i]}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <Lock aria-hidden="true" className="size-5 text-primary" />
              {stage === "compose"
                ? "Run a dry run to see outgoing previews."
                : "Nothing sends until you confirm."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div ref={sendWrapRef} className="inline-flex w-full sm:w-auto">
                <Button
                  type="button"
                  size="lg"
                  className={cn(
                    "pointer-events-none min-h-11 w-full gap-2 rounded-xl px-5 sm:w-auto",
                    sending && "opacity-95",
                    sent && "bg-primary"
                  )}
                  aria-hidden
                  tabIndex={-1}
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : sent ? (
                    <>
                      <SendHorizontal className="size-4" aria-hidden />
                      Sent
                    </>
                  ) : (
                    <>
                      <SendHorizontal className="size-4" aria-hidden />
                      Send campaign
                    </>
                  )}
                </Button>
              </div>
              <Link
                href="/dashboard/new"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "min-h-11 w-full justify-center rounded-xl px-5 sm:w-auto"
                )}
              >
                Try it yourself
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
