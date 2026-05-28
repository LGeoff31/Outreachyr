"use client";

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

function LogoRow({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div
      className="flex shrink-0 items-center gap-12 pr-12 sm:gap-16 sm:pr-16"
      aria-hidden={ariaHidden}
    >
      {COMPANIES.map((company) => (
        <div
          key={company.name}
          className="flex h-28 w-56 shrink-0 items-center justify-center sm:h-36 sm:w-72"
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

export function LandingSocialProof() {
  return (
    <section
      aria-label="Interview outcomes at leading companies"
      className="border-t border-border/50 bg-background pb-16 pt-20 sm:pb-20 sm:pt-28"
    >
      <p className="mx-auto max-w-2xl px-5 text-center text-base leading-relaxed text-muted-foreground sm:text-lg">
        <span className="font-semibold text-foreground">Candidates</span> have
        landed 20+ interviews at companies like
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
    </section>
  );
}
