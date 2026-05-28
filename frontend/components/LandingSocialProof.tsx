"use client";

const COMPANIES = [
  { name: "Stripe", src: "/logos/stripe.svg" },
  { name: "Notion", src: "/logos/notion.svg" },
  { name: "Figma", src: "/logos/figma.svg" },
  { name: "Shopify", src: "/logos/shopify.svg" },
  { name: "Nvidia", src: "/logos/nvidia.svg" },
  { name: "Databricks", src: "/logos/databricks.svg" },
  { name: "Plaid", src: "/logos/plaid.svg" },
  { name: "Robinhood", src: "/logos/robinhood.svg" },
  { name: "Coinbase", src: "/logos/coinbase.svg" },
  { name: "Ramp", src: "/logos/ramp.svg" },
] as const;

function LogoRow({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-16 pr-16 sm:gap-24 sm:pr-24"
      aria-hidden={ariaHidden}
    >
      {COMPANIES.map((company) => (
        <div
          key={company.name}
          className="flex h-9 w-28 shrink-0 items-center justify-center sm:w-32"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={company.src}
            alt={ariaHidden ? "" : company.name}
            className="h-7 w-auto max-w-full opacity-[0.38] transition-opacity duration-300 group-hover/marquee:opacity-[0.55] sm:h-8"
            loading="lazy"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}

export function LandingSocialProof() {
  return (
    <section
      aria-label="Companies where users have landed interviews"
      className="border-t border-border/60 bg-muted/20 py-12 sm:py-14"
    >
      <p className="text-center text-sm font-medium tracking-tight text-muted-foreground">
        Candidates have landed interviews at
      </p>

      <div className="group/marquee relative mt-8 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-muted/20 to-transparent sm:w-32"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-muted/20 to-transparent sm:w-32"
        />

        <div className="flex w-max motion-reduce:animate-none animate-logo-marquee group-hover/marquee:[animation-play-state:paused]">
          <LogoRow />
          <LogoRow ariaHidden />
        </div>
      </div>
    </section>
  );
}
