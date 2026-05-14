"use client";

import Link from "next/link";
import {
  CheckCircle2,
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
  "Nvidia Summer 2027 Software Engineering Internships!";

const DEMO_BODY = `Hi {{first_name}},

I'm Geoffrey Lee (Software Engineering, University of Waterloo).

I've previously worked at Shopify and would love to contribute to {{company}}'s distributed systems teams.

I’ve added my resume, and would love the opportunity to interview.
`;

const DEMO_RECIPIENTS = [
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
  {
    name: "Rachel Torres",
    firstName: "Rachel",
    role: "Campus Recruiting Lead",
    location: "Denver, CO",
    initials: "RT",
  },
  {
    name: "James Okonkwo",
    firstName: "James",
    role: "Talent Partner",
    location: "Seattle, WA",
    initials: "JO",
  },
  {
    name: "Elena Vasquez",
    firstName: "Elena",
    role: "Engineering Recruiter",
    location: "Austin, TX",
    initials: "EV",
  },
  {
    name: "Sam Patel",
    firstName: "Sam",
    role: "University Relations",
    location: "Chicago, IL",
    initials: "SP",
  },
  {
    name: "Jordan Blake",
    firstName: "Jordan",
    role: "Leadership Recruiting",
    location: "Boston, MA",
    initials: "JB",
  },
  {
    name: "Morgan Chen",
    firstName: "Morgan",
    role: "Early Career Recruiter",
    location: "Los Angeles, CA",
    initials: "MC",
  },
  {
    name: "Alex Rivera",
    firstName: "Alex",
    role: "Technical Sourcer",
    location: "Washington, DC",
    initials: "AR",
  },
] as const;

/** Preview cards the demo cursor visits before jumping to Send. */
const CURSOR_EMAIL_CLICKS = 2;

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
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const sendWrapRef = useRef<HTMLDivElement>(null);

  const recipientBodies = useMemo(
    () =>
      DEMO_RECIPIENTS.map((r) =>
        resolveTemplate(DEMO_BODY, r.firstName, DEMO_COMPANY)
      ),
    []
  );

  useEffect(() => {
    if (stage !== "review") return;
    const el = previewScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [stage]);

  useEffect(() => {
    if (stage !== "review" || focusRecipient === null) return;
    const el = emailCardRefs.current[focusRecipient];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [stage, focusRecipient]);

  useEffect(() => {
    if (!sent) return;
    let cancelled = false;
    const run = async () => {
      const { default: confetti } = await import("canvas-confetti");
      if (cancelled) return;
      const root = document.getElementById("landing-campaign-demo");
      const rect = root?.getBoundingClientRect();
      const origin = {
        x: rect
          ? (rect.left + rect.width / 2) / window.innerWidth
          : 0.5,
        y: rect
          ? (rect.top + rect.height * 0.36) / window.innerHeight
          : 0.42,
      };
      const base = {
        origin,
        zIndex: 80,
        disableForReducedMotion: true,
      } as const;
      confetti({
        ...base,
        particleCount: 110,
        spread: 72,
        startVelocity: 42,
        colors: ["#3b82f6", "#6366f1", "#22c55e", "#f59e0b", "#f1f5f9"],
      });
      await new Promise((r) => setTimeout(r, 160));
      if (cancelled) return;
      confetti({
        ...base,
        particleCount: 65,
        spread: 100,
        startVelocity: 32,
        scalar: 0.85,
        ticks: 240,
        colors: ["#60a5fa", "#a78bfa", "#4ade80", "#fde047"],
      });
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [sent]);

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
      await sleep(250);
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
        await sleep(120);
        if (cancelled) return;
        setFocusRecipient(0);
        await sleep(600);
        if (cancelled) return;
        setFocusRecipient(1);
        await sleep(600);
        if (cancelled) return;
        setFocusRecipient(null);
        const sc = previewScrollRef.current;
        if (sc) {
          sc.scrollTop = 0;
          await sleep(100);
          if (cancelled) return;
          sc.scrollTop = sc.scrollHeight;
          await sleep(500);
          if (cancelled) return;
        }
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
      if (previewScrollRef.current) {
        previewScrollRef.current.scrollTop = 0;
      }

      const n = Math.min(CURSOR_EMAIL_CLICKS, DEMO_RECIPIENTS.length);
      for (let r = 0; r < n; r++) {
        await moveCursorTo(emailCardRefs.current[r]);
        setFocusRecipient(r);
        await sleep(520);
        if (cancelled) return;
      }

      setFocusRecipient(null);
      await hideCursor();
      await sleep(200);
      if (cancelled) return;

      const scroller = previewScrollRef.current;
      if (scroller) {
        scroller.scrollTop = 0;
        await sleep(100);
        if (cancelled) return;
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
        await sleep(1000);
        if (cancelled) return;
      }

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
            className="pointer-events-none absolute z-20 transition-[left,top] duration-200 ease-out"
            style={{
              left: cursorPt.x,
              top: cursorPt.y,
              transform: "translate(-2px, -2px) rotate(-14deg)",
            }}
            aria-hidden
          >
            <MousePointer2
              className="size-5 text-foreground drop-shadow-sm"
              strokeWidth={2.25}
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
                Draft → Preview → Send
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
                    Fetch recruiters
                  </Button>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "absolute inset-0 flex min-h-0 flex-col overflow-hidden transition-opacity duration-300 ease-out",
                stage === "review"
                  ? "z-10 opacity-100"
                  : "z-0 opacity-0 pointer-events-none"
              )}
            >
              <div className="shrink-0 px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Outgoing mail
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {DEMO_RECIPIENTS.length} personalized emails
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scroll through every recruiter preview—then send when
                  you&apos;re ready.
                </p>
              </div>
              <Separator className="shrink-0" />

              <div
                ref={previewScrollRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth px-5 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin]"
              >
                <div className="flex flex-col gap-2.5 pb-1">
                  {DEMO_RECIPIENTS.map((person, i) => (
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
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <Lock aria-hidden="true" className="size-5 text-primary" />
              {stage === "compose"
                ? "Fetch recruiters to see personalized previews."
                : "Nothing sends until you confirm."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div ref={sendWrapRef} className="inline-flex w-full sm:w-auto">
                <Button
                  type="button"
                  size="lg"
                  className={cn(
                    "pointer-events-none min-h-11 w-full gap-2 rounded-xl px-5 transition-all duration-300 sm:w-auto",
                    sending && "opacity-95",
                    sent &&
                      "bg-primary shadow-lg shadow-primary/30 ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
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
                      <CheckCircle2 className="size-4" aria-hidden />
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
