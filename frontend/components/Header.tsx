"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send } from "lucide-react";

import { HeaderAuth } from "@/components/HeaderAuth";

export function Header() {
  const pathname = usePathname();
  const isDashboard =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  return (
    <header className="fixed inset-x-0 top-0 z-50 w-full overflow-hidden border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div
        className={
          isDashboard
            ? "flex h-16 w-full items-center justify-between px-5"
            : "mx-auto flex h-16 w-full max-w-[90rem] items-center justify-between px-5 sm:px-8"
        }
      >
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
        {isDashboard ? null : <HeaderAuth />}
      </div>
    </header>
  );
}
