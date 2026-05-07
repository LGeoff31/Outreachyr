"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  LockKeyhole,
  SendHorizontal,
  Upload,
  UsersRound,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fetchCompanyKeys } from "@/lib/api";

type Recipient = {
  email?: string;
  greeting_name?: string;
};

type SendResponse = {
  ok?: boolean;
  error?: string;
  dry_run?: boolean;
  count?: number;
  recipients?: Recipient[];
  sent?: number;
};

const formSteps = [
  ["1", "Company"],
  ["2", "Message"],
  ["3", "Review"],
];

export function OutreachForm() {
  const [company, setCompany] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState(
    "Start with a company name, then preview the campaign."
  );
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState<"preview" | "send" | null>(null);

  useEffect(() => {
    fetchCompanyKeys()
      .then(setHints)
      .catch(() => {});
  }, []);

  const companyReady = company.trim().length > 0;
  const canSend = recipients.length > 0 && reviewed && loading === null;
  const companyInvalid = err && !companyReady;

  const fileLabel = useMemo(() => {
    if (!file) return "Upload resume PDF";
    const size = Math.max(1, Math.round(file.size / 1024));
    return `${file.name} (${size} KB)`;
  }, [file]);

  const runCampaign = useCallback(
    async (dryRun: boolean) => {
      if (!companyReady) {
        setErr(true);
        setMessage("Enter a company name before previewing the campaign.");
        return;
      }

      if (!dryRun && !reviewed) {
        setErr(true);
        setMessage("Review the recipients and message before sending.");
        return;
      }

      setLoading(dryRun ? "preview" : "send");
      setErr(false);
      setMessage(dryRun ? "Finding recruiters..." : "Sending campaign...");

      const fd = new FormData();
      fd.append("company", company.trim());
      fd.append("dry_run", dryRun ? "true" : "false");
      fd.append("subject", subject);
      fd.append("body_text", bodyText);
      if (file) fd.append("resume", file, file.name);

      try {
        const res = await fetch("/api/send", { method: "POST", body: fd });
        const data = (await res.json()) as SendResponse;

        if (!data.ok) {
          setErr(true);
          setMessage(data.error ?? "The campaign could not be prepared.");
          return;
        }

        if (data.dry_run) {
          const nextRecipients = data.recipients ?? [];
          setRecipients(nextRecipients);
          setReviewed(false);
          setMessage(
            nextRecipients.length > 0
              ? `Preview ready. Review ${
                  data.count ?? nextRecipients.length
                } recipient(s), then confirm if everything looks right.`
              : "Preview finished, but no recipients were returned."
          );
        } else {
          setRecipients([]);
          setReviewed(false);
          setMessage(`Sent to ${data.sent ?? 0} recipient(s).`);
        }
      } catch {
        setErr(true);
        setMessage(
          "Could not reach the outreach server. Start the backend, then try preview again."
        );
      } finally {
        setLoading(null);
      }
    },
    [bodyText, company, companyReady, file, reviewed, subject]
  );

  return (
    <Card className="min-w-0 max-w-[calc(100vw-2.5rem)] rounded-2xl bg-card shadow-sm sm:max-w-none">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runCampaign(true);
        }}
      >
        <CardContent className="px-4 py-2 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {formSteps.map(([number, label]) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-3"
              >
                <Badge
                  variant="secondary"
                  className="size-8 shrink-0 rounded-full p-0 text-sm font-bold"
                >
                  {number}
                </Badge>
                <span className="text-sm font-semibold text-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <Separator className="my-6" />

          <FieldGroup className="lg:grid lg:grid-cols-2">
            <Field
              className="lg:col-span-2"
              data-invalid={companyInvalid || undefined}
            >
              <FieldLabel htmlFor="company">Company name</FieldLabel>
              <Input
                id="company"
                list="company-options"
                value={company}
                onChange={(event) => {
                  setCompany(event.target.value);
                  setRecipients([]);
                  setReviewed(false);
                }}
                placeholder="Palantir"
                className="min-h-12 rounded-xl px-4 text-base"
                autoComplete="organization"
                aria-invalid={companyInvalid || undefined}
              />
              <datalist id="company-options">
                {hints.map((hint) => (
                  <option key={hint} value={hint} />
                ))}
              </datalist>
              <FieldDescription>
                Use the company name you want recruiters matched against.
                {hints.length > 0
                  ? ` Available: ${hints.slice(0, 4).join(", ")}.`
                  : ""}
              </FieldDescription>
            </Field>

            <Field className="lg:col-span-2">
              <FieldLabel htmlFor="subject">Subject line</FieldLabel>
              <Input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Fall 2026 software opportunities"
                className="min-h-12 rounded-xl px-4 text-base"
              />
              <FieldDescription>
                Leave blank to use the backend default subject.
              </FieldDescription>
            </Field>

            <Field className="lg:col-span-2">
              <FieldLabel htmlFor="body">Email message</FieldLabel>
              <Textarea
                id="body"
                value={bodyText}
                onChange={(event) => setBodyText(event.target.value)}
                rows={8}
                placeholder={`Hi __FIRST_NAME__,\n\nI am reaching out to learn more about Fall 2026 opportunities...`}
                className="min-h-48 resize-y rounded-xl px-4 py-3 text-base leading-7"
              />
              <FieldDescription>
                Leave blank to use the saved message in the server body file.
              </FieldDescription>
            </Field>

            <Field className="lg:col-span-2">
              <FieldLabel htmlFor="resume">Resume attachment</FieldLabel>
              <label
                htmlFor="resume"
                className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted px-5 py-6 text-center transition hover:border-primary/40 hover:bg-accent"
              >
                <Input
                  id="resume"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                />
                <Upload aria-hidden="true" className="mb-3 size-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {fileLabel}
                </span>
                <span className="mt-1 text-sm text-muted-foreground">
                  PDF only. You can preview before sending.
                </span>
              </label>
            </Field>
          </FieldGroup>

          <section className="mt-6 rounded-2xl border border-border bg-muted p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Recruiter preview
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Preview finds recipients and keeps send locked until you
                  review.
                </p>
              </div>
              <Button
                type="submit"
                disabled={loading !== null}
                size="lg"
                className="min-h-12 rounded-xl px-6"
              >
                {loading === "preview" ? (
                  <Loader2
                    data-icon="inline-start"
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : (
                  <Eye data-icon="inline-start" aria-hidden="true" />
                )}
                {loading === "preview" ? "Previewing..." : "Preview campaign"}
              </Button>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {recipients.length === 0 ? (
                <Empty className="border border-border bg-background">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <UsersRound aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No recipients previewed yet</EmptyTitle>
                    <EmptyDescription>
                      Recipient results will appear here after preview.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                recipients.map((recipient, index) => (
                  <div
                    key={`${recipient.email ?? "recipient"}-${index}`}
                    className="grid gap-3 rounded-xl border border-border bg-background p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                  >
                    <Avatar>
                      <AvatarFallback>
                        {recipientInitial(recipient.greeting_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {recipient.greeting_name || "Recruiter"}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {recipient.email || "Email unavailable"}
                      </p>
                    </div>
                    <Badge className="w-fit" variant="secondary">
                      Previewed
                    </Badge>
                  </div>
                ))
              )}
            </div>

            <Field
              orientation="horizontal"
              data-disabled={recipients.length === 0 || undefined}
              className="mt-5 rounded-xl border border-border bg-background p-4"
            >
              <Checkbox
                id="reviewed"
                checked={reviewed}
                onCheckedChange={(checked) => setReviewed(checked === true)}
                disabled={recipients.length === 0}
              />
              <FieldContent>
                <FieldLabel htmlFor="reviewed">
                  I reviewed the recipients, message, and resume.
                </FieldLabel>
                <FieldDescription>
                  This confirmation unlocks the send button.
                </FieldDescription>
              </FieldContent>
            </Field>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <LockKeyhole aria-hidden="true" className="size-4" />
                Send button status:
                <Badge variant={canSend ? "default" : "secondary"}>
                  {canSend ? "unlocked" : "locked"}
                </Badge>
              </div>
              <Button
                type="button"
                disabled={!canSend}
                onClick={() => void runCampaign(false)}
                size="lg"
                className="min-h-12 rounded-xl px-6"
              >
                {loading === "send" ? (
                  <Loader2
                    data-icon="inline-start"
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : (
                  <SendHorizontal data-icon="inline-start" aria-hidden="true" />
                )}
                {loading === "send" ? "Sending..." : "Send campaign"}
              </Button>
            </div>
          </section>

          <Alert
            role={err ? "alert" : "status"}
            variant={err ? "destructive" : "default"}
            className={cn(
              "mt-5",
              !err && "border-primary/20 bg-accent text-accent-foreground"
            )}
          >
            {err ? (
              <AlertCircle aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
            <AlertTitle>{err ? "Needs attention" : "Campaign status"}</AlertTitle>
            <AlertDescription
              className={cn(!err && "text-accent-foreground/80")}
            >
              {message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </form>
    </Card>
  );
}

function recipientInitial(name?: string) {
  return (name?.trim().charAt(0) || "R").toUpperCase();
}
