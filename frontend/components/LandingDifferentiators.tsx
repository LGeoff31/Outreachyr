import { MailCheck, MessageSquareOff, PenLine, X } from "lucide-react";

const points = [
  {
    title: "LinkedIn messages don't work",
    description:
      "Recruiters get thousands of LinkedIn spam. Yours is easy to ignore. Email from a real inbox cuts through the noise.",
    icon: MessageSquareOff,
    contrast: true,
  },
  {
    title: "100% verified recruiter emails",
    description:
      "We source from a database of real recruiter emails, not guessed addresses or stale lists.",
    icon: MailCheck,
    contrast: false,
  },
  {
    title: "Personalized emails that convert",
    description:
      "Merge fields and templates help you write outreach that sounds like you at scale, with higher reply rates.",
    icon: PenLine,
    contrast: false,
  },
] as const;

export function LandingDifferentiators() {
  return (
    <section
      aria-labelledby="differentiators-heading"
      className="border-t border-border/50 bg-muted/20 px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="mx-auto max-w-[90rem]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Why email wins
          </p>
          <h2
            id="differentiators-heading"
            className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Skip LinkedIn spam. Send emails that get{" "}
            <span className="text-primary">replies.</span>
          </h2>
        </div>

        <ul className="mx-auto mt-10 grid max-w-5xl gap-5 sm:grid-cols-3 sm:gap-6">
          {points.map((point) => {
            const Icon = point.icon;
            return (
              <li
                key={point.title}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={
                      point.contrast
                        ? "flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
                        : "flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
                    }
                  >
                    <Icon aria-hidden className="size-5" />
                  </span>
                  {point.contrast ? (
                    <span
                      aria-hidden
                      className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    >
                      <X className="size-3.5" />
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-4 text-base font-semibold tracking-tight">
                  {point.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {point.description}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
