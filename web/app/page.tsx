import Link from "next/link";
import { ArrowRight, Eye, FileText, Lock, Paperclip, Search } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const recipients = [
  {
    name: "Aisha Khan",
    role: "Technical Recruiter",
    location: "San Francisco, CA",
    initials: "AK",
  },
  {
    name: "Michael Park",
    role: "Senior Recruiter",
    location: "Palo Alto, CA",
    initials: "MP",
  },
  {
    name: "David Lin",
    role: "University Recruiter",
    location: "New York, NY",
    initials: "DL",
  },
];

const steps = [
  {
    title: "Find recruiters",
    body: "Type a company name and Outreachyr checks the mapped company domain before looking for matching recruiter contacts.",
    icon: Search,
  },
  {
    title: "Review before send",
    body: "See the recipients, subject, and message in one place. The send action stays locked until review is confirmed.",
    icon: Eye,
  },
  {
    title: "Attach your resume",
    body: "Add a PDF once, preview the campaign, then send only after the final confirmation step.",
    icon: Paperclip,
  },
];

const pricing = [
  {
    name: "Start",
    price: "Free",
    body: "Build and preview outreach campaigns with your local backend.",
  },
  {
    name: "Campus",
    price: "Team-ready",
    body: "Shared templates, review workflows, and clearer handoffs for student groups.",
  },
];

export default function HomePage() {
  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-[90rem] items-center gap-14 px-5 pb-16 pt-14 sm:px-8 sm:pt-16 lg:min-h-[calc(100svh-13rem)] lg:grid-cols-[0.9fr_1.05fr] lg:gap-16 lg:py-0">
          <div className="min-w-0 max-w-[calc(100vw-2.5rem)] sm:max-w-2xl">
            <h1 className="text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              Reach the right <span className="text-primary">recruiters.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Enter a company name. Outreachyr finds relevant recruiters,
              drafts personalized emails, and keeps every message in review
              until you approve it.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-14 rounded-xl px-8 text-base shadow-xl shadow-primary/20"
                )}
              >
                Start free
              </Link>
              <Link
                href="#how-it-works"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "lg" }),
                  "min-h-14 rounded-xl px-6 text-base text-primary"
                )}
              >
                See how it works
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-7 flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <Lock aria-hidden="true" className="size-5 text-foreground" />
              Nothing is sent without your review.
            </p>
          </div>

          <CampaignPreview />
        </div>
      </section>

      <section id="how-it-works" className="border-y border-border bg-muted">
        <div className="mx-auto max-w-[90rem] px-5 pb-20 pt-12 sm:px-8 lg:pb-24 lg:pt-14">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="uppercase tracking-wide">
              How it works
            </Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              A guided flow that keeps users in control.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              The interface uses plain labels, visible steps, and a locked send
              path so first-time users know exactly what happens next.
            </p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <Card key={step.title} className="rounded-2xl bg-card shadow-sm">
                <CardHeader className="px-6">
                  <span className="flex size-12 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm">
                    <step.icon aria-hidden="true" className="size-6" />
                  </span>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 px-6 pb-3 pt-3">
                  <CardTitle>{step.title}</CardTitle>
                  <CardDescription className="leading-6">
                    {step.body}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="bg-background">
        <div className="mx-auto max-w-[90rem] px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <Badge variant="outline">Pricing</Badge>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Pricing that matches early outreach.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Start with a simple local workflow. Move into shared review when
              multiple people are managing recruiter outreach together.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {pricing.map((plan) => (
              <Card key={plan.name} className="rounded-2xl bg-card shadow-sm">
                <CardHeader className="px-7">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardAction className="text-right text-xl font-semibold text-primary">
                    {plan.price}
                  </CardAction>
                  <CardDescription className="max-w-md leading-6">
                    {plan.body}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function CampaignPreview() {
  return (
    <div className="relative min-w-0 max-w-[calc(100vw-2.5rem)] sm:max-w-none">
      <div className="absolute inset-0 translate-y-10 rounded-[2rem] bg-primary/10 blur-3xl" />
      <Card className="relative w-full rounded-[1.75rem] bg-card p-5 shadow-2xl shadow-muted-foreground/15 ring-border/80 sm:p-6">
        <CardHeader className="px-0">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            <div>
              <CardTitle>Campaign preview</CardTitle>
              <CardDescription>Review mode active</CardDescription>
            </div>
          </div>
          <CardAction>
            <Badge variant="secondary">Not sent</Badge>
          </CardAction>
        </CardHeader>

        <CardContent className="px-0">
          <div className="rounded-2xl border border-border bg-background">
            <PreviewField label="Company" value="Palantir" />
            <PreviewField
              label="Subject line"
              value="Fall 2026 Software Engineering Opportunities"
            />
            <div className="px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground">
                Message preview
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                Hi Aisha,
                <br />
                I am a CS student interested in building impactful software. I
                am reaching out to learn more about Fall 2026 opportunities.
              </p>
            </div>

            <Separator />

            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Recipients (3)
                </p>
                <p className="text-xs font-semibold text-primary">
                  Confirm each
                </p>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {recipients.map((person) => (
                  <div
                    key={person.name}
                    className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-3"
                  >
                    <Avatar>
                      <AvatarFallback>{person.initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {person.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {person.role} - {person.location}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-10 px-3 sm:px-4"
                    >
                      Preview
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <Lock aria-hidden="true" className="size-5 text-primary" />
              Send unlocks after every recipient and message is reviewed.
            </p>
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "min-h-11 rounded-xl px-5"
              )}
            >
              Build campaign
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="px-5 py-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
      </div>
      <Separator />
    </>
  );
}
