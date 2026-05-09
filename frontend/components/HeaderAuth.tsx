"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MeResponse = {
  authenticated?: boolean;
  oauth_required?: boolean;
  email?: string | null;
};

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-zA-Z]/g, "");
  if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase();
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

export function HeaderAuth() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json() as Promise<MeResponse>)
      .then(setMe)
      .catch(() => setMe({ oauth_required: false, authenticated: false }));
  }, []);

  if (me === null) {
    return (
      <div
        className="flex min-h-11 items-center gap-3"
        aria-hidden
      >
        <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="hidden h-4 w-32 animate-pulse rounded bg-muted sm:block" />
      </div>
    );
  }

  if (me.authenticated && me.email) {
    return (
      <div className="flex min-h-11 max-w-[min(100vw-8rem,28rem)] items-center gap-2 sm:gap-3">
        <Link
          href="/dashboard"
          title={me.email}
          className="flex min-w-0 items-center gap-2 rounded-xl py-1 pr-1 transition hover:bg-accent/60 sm:gap-3 sm:pr-2"
        >
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="text-xs font-semibold">
              {initialsFromEmail(me.email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 truncate text-sm font-medium text-foreground sm:inline">
            {me.email}
          </span>
        </Link>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "shrink-0 rounded-xl px-3 text-muted-foreground hover:text-foreground"
          )}
          onClick={() => {
            void fetch("/api/auth/logout", {
              method: "POST",
              credentials: "include",
            }).finally(() => {
              setMe({ oauth_required: true, authenticated: false });
              window.location.href = "/";
            });
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  if (me.oauth_required) {
    return (
      <Link
        href="/login"
        className="min-h-11 content-center text-sm font-medium text-muted-foreground transition hover:text-foreground"
      >
        Sign in with Google
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "min-h-11 rounded-xl text-muted-foreground hover:text-foreground"
      )}
    >
      Dashboard
    </Link>
  );
}
