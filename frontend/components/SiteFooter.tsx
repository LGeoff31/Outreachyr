"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();
  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  if (isDashboard) return null;

  return (
    <footer className="border-t border-border/70 bg-background">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-center gap-x-5 gap-y-1 px-5 py-4 text-sm text-muted-foreground sm:justify-between sm:px-8">
        <p className="text-center sm:text-left">
          &copy; {new Date().getFullYear()} Outreachyr
        </p>
        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1"
        >
          <Link
            href="/privacy"
            className="font-medium text-foreground/80 underline-offset-4 transition hover:text-foreground hover:underline"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="font-medium text-foreground/80 underline-offset-4 transition hover:text-foreground hover:underline"
          >
            Terms of Service
          </Link>
        </nav>
      </div>
    </footer>
  );
}
