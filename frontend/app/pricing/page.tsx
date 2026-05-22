import type { Metadata } from "next";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import { UnlockCampaignsButton } from "@/components/UnlockCampaignsButton";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing | Outreachyr",
  description:
    "Try Outreachyr with 3 free campaigns. Unlock unlimited campaigns with a one-time $5 payment.",
};

const freeFeatures = [
  "Three full campaigns end to end",
  "Recruiter discovery for any company",
  "Personalized email drafts",
  "Review every recipient before sending",
  "Send from your Gmail account",
];

const fullFeatures = [
  "Everything in Free",
  "Unlimited campaigns",
  "Saved templates and resumes",
  "Full campaign history",
  "No subscription — pay once",
];

const faqs = [
  {
    question: "What counts toward the free trial?",
    answer:
      "Each completed campaign — from finding recruiters through sending your approved emails — uses one of your 3 free sends. Dry runs and previews do not count.",
  },
  {
    question: "Is the $5 fee a subscription?",
    answer:
      "No. It is a one-time payment. Once unlocked, you can run as many campaigns as you need with no recurring charges.",
  },
  {
    question: "When do I pay?",
    answer:
      "You can send up to 3 campaigns at no cost. Before your 4th send, you will be prompted to pay the one-time $5 fee.",
  },
  {
    question: "Can I try before I pay?",
    answer:
      "Yes. Sign in and send up to 3 campaigns free. You only pay if you want unlimited access after that.",
  },
];

export default function PricingPage() {
  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto max-w-[90rem] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4 rounded-lg px-3 py-1 text-xs font-semibold">
            Simple pricing
          </Badge>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Three campaigns free. Pay once if you love it.
          </h1>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-6 lg:grid-cols-2 lg:gap-8">
          <Card className="rounded-2xl border-border bg-card py-0 shadow-sm">
            <CardHeader className="gap-2 px-6 pt-6 pb-0">
              <CardTitle className="text-xl font-semibold">Free trial</CardTitle>
              <CardDescription className="text-sm leading-6">
                Perfect for testing Outreachyr on your next application.
              </CardDescription>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">$0</span>
                <span className="text-sm text-muted-foreground">3 campaigns</span>
              </div>
            </CardHeader>
            <CardContent className="px-6 pt-6">
              <ul className="space-y-3">
                {freeFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm leading-6">
                    <Check
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-[hsl(var(--chart-2))]"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="px-6 pb-6 pt-2">
              <Link
                href="/dashboard/new"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "min-h-11 w-full rounded-xl border-border bg-card text-base font-semibold shadow-sm hover:bg-muted/60"
                )}
              >
                Start free
              </Link>
            </CardFooter>
          </Card>

          <Card className="relative rounded-2xl border-primary/20 bg-card py-0 shadow-lg shadow-primary/10 ring-1 ring-primary/15">
            <div className="absolute right-5 top-5">
              <Badge className="rounded-lg px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide">
                Best value
              </Badge>
            </div>
            <CardHeader className="gap-2 px-6 pt-6 pb-0">
              <CardTitle className="flex items-center gap-2 text-xl font-semibold">
                Full access
              </CardTitle>
              <CardDescription className="text-sm leading-6">
                For students running outreach across multiple companies.
              </CardDescription>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">$5</span>
                <span className="text-sm text-muted-foreground">one-time</span>
              </div>
            </CardHeader>
            <CardContent className="px-6 pt-6">
              <ul className="space-y-3">
                {fullFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm leading-6">
                    <Check
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-primary"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="px-6 pb-6 pt-2">
              <UnlockCampaignsButton />
            </CardFooter>
          </Card>
        </div>

        <section
          aria-labelledby="pricing-faq-heading"
          className="mx-auto mt-20 max-w-2xl"
        >
          <h2
            id="pricing-faq-heading"
            className="text-center text-2xl font-semibold tracking-tight"
          >
            Frequently asked questions
          </h2>
          <dl className="mt-8 space-y-6">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
              >
                <dt className="text-sm font-semibold text-foreground">
                  {faq.question}
                </dt>
                <dd className="mt-2 text-sm leading-6 text-muted-foreground">
                  {faq.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mx-auto mt-12 max-w-xl text-center text-sm text-muted-foreground">
          Questions about billing?{" "}
          <Link href="/terms" className="font-medium text-primary hover:underline">
            Terms of Service
          </Link>{" "}
          ·{" "}
          <Link href="/" className="font-medium text-primary hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
