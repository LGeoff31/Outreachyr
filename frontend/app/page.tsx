import Link from "next/link";
import { FileText, Lock } from "lucide-react";

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
            <p className="mt-9 flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <Lock aria-hidden="true" className="size-5 text-foreground" />
              Nothing is sent without your review.
            </p>
          </div>

          <CampaignPreview />
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
              href="/dashboard/new"
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
