"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

const COMPANIES = [
  { name: "Amazon", src: "/logos/amazon.png" },
  { name: "Shopify", src: "/logos/shopify.png" },
  { name: "Nvidia", src: "/logos/nvidia.png" },
  { name: "Databricks", src: "/logos/databricks.png" },
  { name: "Snowflake", src: "/logos/snowflake.png" },
  { name: "Point72", src: "/logos/point72.png" },
  { name: "Gemini", src: "/logos/gemini.png" },
  { name: "Cockroach Labs", src: "/logos/cockroach.png" },
] as const;

const EMAIL_PROOF_EXAMPLES = [
  {
    company: "Snowflake",
    logo: "/logos/snowflake.png",
    outreach: {
      src: "/logos/example1_me.png",
      alt: "Outreach email sent to a Snowflake recruiter with resume attached",
      caption: "Outreach email + resume",
    },
    reply: {
      src: "/logos/example1_them.png",
      alt: "Snowflake recruiter reply asking to schedule an interview call",
      caption: "Recruiter reply · interview scheduled",
    },
  },
  {
    company: "Gemini",
    logo: "/logos/gemini.png",
    outreach: {
      src: "/logos/example2_me.png",
      alt: "Outreach email sent to a Gemini recruiter with resume attached",
      caption: "Outreach email + resume",
    },
    reply: {
      src: "/logos/example2_you.png",
      alt: "Gemini recruiter reply moving the candidate forward",
      caption: "Recruiter reply · moved forward",
    },
  },
  {
    company: "Cockroach Labs",
    logo: "/logos/cockroach.png",
    outreach: {
      src: "/logos/example3_me.png",
      alt: "Outreach email sent to a Cockroach Labs recruiter with resume attached",
      caption: "Outreach email + resume",
    },
    reply: {
      src: "/logos/example3_you.png",
      alt: "Cockroach Labs recruiter reply asking to book a call",
      caption: "Recruiter reply · book a call",
    },
  },
  {
    company: "Point72",
    logo: "/logos/point72.png",
    outreach: {
      src: "/logos/example4_you.png",
      alt: "Outreach email sent to a Point72 recruiter with resume attached",
      caption: "Outreach email + resume",
    },
    reply: {
      src: "/logos/example4_me.png",
      alt: "Point72 reply confirming next steps in the process",
      caption: "Recruiter reply · next steps",
    },
  },
] as const;

function LogoRow({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-12 pr-12 sm:gap-16 sm:pr-16"
      aria-hidden={ariaHidden}
    >
      {COMPANIES.map((company) => (
        <div
          key={company.name}
          className="flex h-28 w-56 shrink-0 justify-center sm:h-36 sm:w-72"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={company.src}
            alt={ariaHidden ? "" : company.name}
            className="h-24 w-52 object-contain opacity-90 transition-opacity duration-300 group-hover/marquee:opacity-100 sm:h-32 sm:w-64"
            loading="lazy"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}

function EmailProofExample({
  company,
  logo,
  outreach,
  reply,
}: (typeof EMAIL_PROOF_EXAMPLES)[number]) {
  return (
    <article className="flex flex-col gap-3">
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" aria-hidden className="size-4 object-contain" />
        <span className="text-[0.7rem] font-semibold text-foreground">
          {company}
        </span>
      </div>

      <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4">
        <figure className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={outreach.src}
            alt={outreach.alt}
            className="max-h-48 w-full object-cover object-top sm:max-h-52"
            loading="lazy"
          />
          <figcaption className="border-t border-border px-3 py-2 text-center text-[0.65rem] font-medium text-muted-foreground">
            {outreach.caption}
          </figcaption>
        </figure>

        <div aria-hidden className="flex justify-center text-primary sm:px-0.5">
          <ArrowRight className="size-5 rotate-90 sm:rotate-0" />
        </div>

        <figure className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reply.src}
            alt={reply.alt}
            className="max-h-48 w-full object-cover object-top sm:max-h-52"
            loading="lazy"
          />
          <figcaption className="border-t border-border px-3 py-2 text-center text-[0.65rem] font-medium text-muted-foreground">
            {reply.caption}
          </figcaption>
        </figure>
      </div>
    </article>
  );
}

export function LandingSocialProof() {
  const [activeExample, setActiveExample] = useState(0);

  return (
    <section
      aria-label="Interview outcomes at leading companies"
      className="border-t border-border/50 bg-background pb-12 pt-20 sm:pb-16 sm:pt-28"
    >
      <p className="mx-auto max-w-2xl px-5 text-center text-base leading-relaxed text-muted-foreground sm:text-lg">
        <span className="font-semibold text-foreground">Candidates</span> have
        landed 20+ interviews/OA&apos;s at companies like
      </p>

      <div className="group/marquee relative mt-14 overflow-hidden sm:mt-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-28"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-28"
        />

        <div className="flex w-max motion-reduce:animate-none animate-logo-marquee group-hover/marquee:[animation-play-state:paused]">
          <LogoRow />
          <LogoRow ariaHidden />
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-5xl px-5 sm:mt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Real examples
            </p>
            <h3 className="mt-1 text-balance text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              From cold email to recruiter replies
            </h3>
          </div>

          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Email proof examples"
          >
            {EMAIL_PROOF_EXAMPLES.map((example, index) => (
              <button
                key={example.company}
                type="button"
                role="tab"
                aria-selected={activeExample === index}
                onClick={() => setActiveExample(index)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  activeExample === index
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={example.logo}
                  alt=""
                  aria-hidden
                  className="size-3.5 object-contain"
                />
                {example.company}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <EmailProofExample {...EMAIL_PROOF_EXAMPLES[activeExample]!} />
        </div>
      </div>
    </section>
  );
}
