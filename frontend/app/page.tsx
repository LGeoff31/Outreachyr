import Link from "next/link";
import { LayoutDashboard, Lock, PenLine } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { LandingCampaignDemo } from "@/components/LandingCampaignDemo";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-[90rem] items-center gap-14 px-5 pb-16 pt-14 sm:px-8 sm:pt-16 lg:min-h-[calc(100svh-13rem)] lg:grid-cols-[0.9fr_1.05fr] lg:gap-16 lg:py-0">
          <div className="min-w-0 max-w-[calc(100vw-2.5rem)] sm:max-w-2xl">
            <h1 className="text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              Reach the right <span className="text-primary">recruiters.</span>
            </h1>
            <p className="mt-5 max-w-xl text-balance text-xl font-medium tracking-tight sm:text-2xl">
              <span className="font-semibold text-primary">Guaranteed responses</span>
              {", "}
              <span className="font-semibold text-foreground">more interviews</span>.
            </p>
            <p className="mt-8 flex items-center gap-3 text-sm font-medium text-muted-foreground">
              <Lock aria-hidden="true" className="size-5 text-foreground" />
              You approve every send.
            </p>
            <div className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/dashboard/new"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-12 w-full justify-center gap-2 rounded-xl px-6 text-base font-semibold shadow-lg shadow-primary/15 sm:w-auto"
                )}
              >
                Try it yourself
              </Link>
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "min-h-12 w-full justify-center gap-2 rounded-xl px-6 text-base font-semibold sm:w-auto"
                )}
              >
                Dashboard
              </Link>
            </div>
          </div>

          <LandingCampaignDemo />
        </div>
      </section>
    </div>
  );
}
