"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { signOutEverywhere } from "@/lib/auth";
import {
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-zA-Z]/g, "");
  if (cleaned.length >= 2) return cleaned.slice(0, 2).toUpperCase();
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return (email[0] ?? "?").toUpperCase();
}

export function HeaderAuth() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setEmail(null);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setEmail(data.user?.email ?? null);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (email === undefined) {
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

  if (email) {
    return (
      <div className="flex min-h-11 max-w-[min(100vw-8rem,28rem)] items-center gap-2 sm:gap-3">
        <Link
          href="/dashboard"
          title={email}
          className="flex min-w-0 items-center gap-2 rounded-xl py-1 pr-1 transition hover:bg-accent/60 sm:gap-3 sm:pr-2"
        >
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="text-xs font-semibold">
              {initialsFromEmail(email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 truncate text-sm font-medium text-foreground sm:inline">
            {email}
          </span>
        </Link>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "shrink-0 rounded-xl px-3 text-muted-foreground hover:text-foreground"
          )}
          onClick={() => {
            void signOutEverywhere().finally(() => {
              setEmail(null);
              window.location.href = "/";
            });
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className={cn(
        buttonVariants({ variant: "default", size: "sm" }),
        "min-h-10 rounded-xl px-4 shadow-sm shadow-primary/20"
      )}
    >
      Sign in
    </Link>
  );
}
