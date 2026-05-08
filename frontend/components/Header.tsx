import Link from "next/link";
import { Send } from "lucide-react";

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
        <Link
          href="/login"
          className="min-h-11 content-center text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Sign in with Google
        </Link>
      </div>
    </header>
  );
}
