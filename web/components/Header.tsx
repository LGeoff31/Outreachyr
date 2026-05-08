import Link from "next/link";
import { Send } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-screen max-w-full overflow-hidden border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-3 text-lg font-semibold tracking-tight text-foreground"
          aria-label="Outreachyr home"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
            <Send aria-hidden="true" className="size-5" />
          </span>
          Outreachyr.
        </Link>
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-8 text-sm font-medium md:flex"
        >
          <Link
            href="/#how-it-works"
            className="min-h-11 content-center text-muted-foreground transition hover:text-foreground"
          >
            How it works
          </Link>
          <Link
            href="/#pricing"
            className="min-h-11 content-center text-muted-foreground transition hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/dashboard"
            className="min-h-11 content-center text-muted-foreground transition hover:text-foreground"
          >
            Sign in
          </Link>
        </nav>
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ size: "lg" }),
            "min-h-11 rounded-xl px-5 shadow-lg shadow-primary/20"
          )}
        >
          Start free
        </Link>
      </div>
    </header>
  );
}
