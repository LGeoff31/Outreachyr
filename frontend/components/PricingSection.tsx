import Link from "next/link";
import { Check } from "lucide-react";

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

const planFeatures = [
  "Unlimited campaigns after unlock",
  "Verified recruiter emails at any company",
  "Personalized emails for every recipient",
  "Hit recruiter inboxes, not spam",
  "Send from your Gmail account",
  "Saved templates and resumes",
  "Full history tracking",
];

const faqs = [
  {
    question: "Why email instead of LinkedIn?",
    answer:
      "Recruiters receive thousands of LinkedIn messages. A thoughtful email to a verified inbox stands out more, especially with a good hook.",
  },
  {
    question: "What counts toward the free trial?",
    answer:
      "Each completed campaign, from finding recruiters through sending your approved emails uses one of your 3 free sends. Dry runs and previews do not count.",
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

type PricingSectionProps = {
  /** Homepage embed below logos — uses section wrapper and h2. */
  embedded?: boolean;
  className?: string;
};

export function PricingSection({
  embedded = false,
  className,
}: PricingSectionProps) {
  const headingId = embedded ? "landing-pricing-heading" : "pricing-heading";
  const faqHeadingId = embedded ? "landing-pricing-faq-heading" : "pricing-faq-heading";

  const content = (
    <>
      <div className="mx-auto max-w-2xl text-center">
        <Badge
          variant="secondary"
          className="mb-4 rounded-lg px-3 py-1 text-xs font-semibold"
        >
          Simple pricing
        </Badge>
        {embedded ? (
          <h2
            id={headingId}
            className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            Three free campaigns. Then{" "}
            <span className="text-primary">$5</span> for unlimited.
          </h2>
        ) : (
          <h1
            id={headingId}
            className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl"
          >
            Three free campaigns. Then{" "}
            <span className="text-primary">$5</span> for unlimited.
          </h1>
        )}
        <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
          Verified recruiter emails and personalized outreach — not another
          LinkedIn message that gets ignored.
        </p>
      </div>

      <div className="mx-auto mt-14 max-w-md">
        <Card className="rounded-2xl border-primary/20 bg-card py-0 shadow-lg shadow-primary/10 ring-1 ring-primary/15">
          <CardHeader className="gap-2 px-6 pt-6 pb-0">
            <CardTitle className="text-xl font-semibold">Full access</CardTitle>
            <CardDescription className="text-sm leading-6">
              Start with 3 campaigns free. Pay once when you&apos;re ready.
            </CardDescription>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight">$5</span>
              <span className="text-sm text-muted-foreground">one-time</span>
            </div>
          </CardHeader>
          <CardContent className="px-6 pt-6">
            <ul className="space-y-3">
              {planFeatures.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-3 text-sm leading-6"
                >
                  <Check
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 px-6 pb-6 pt-2">
            <UnlockCampaignsButton />
            <Link
              href="/dashboard/new"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "min-h-11 w-full rounded-xl text-base font-semibold"
              )}
            >
              Start with 3 free campaigns
            </Link>
          </CardFooter>
        </Card>
      </div>

      <section
        aria-labelledby={faqHeadingId}
        className="mx-auto mt-20 max-w-2xl"
      >
        <h2
          id={faqHeadingId}
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
        </Link>
        {embedded ? null : (
          <>
            {" "}
            ·{" "}
            <Link href="/" className="font-medium text-primary hover:underline">
              Back to home
            </Link>
          </>
        )}
      </p>
    </>
  );

  if (embedded) {
    return (
      <section
        aria-labelledby={headingId}
        className={cn(
          "border-t border-border/50 bg-muted/20 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-20",
          className
        )}
      >
        <div className="mx-auto max-w-[90rem]">{content}</div>
      </section>
    );
  }

  return (
    <div
      className={cn(
        "mx-auto max-w-[90rem] px-5 py-14 sm:px-8 sm:py-20",
        className
      )}
    >
      {content}
    </div>
  );
}
