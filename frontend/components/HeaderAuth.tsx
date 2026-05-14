"use client";

import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Google / OIDC avatars from Supabase user (metadata + identities). */
function avatarUrlFromUser(user: User | null | undefined): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const fromMeta =
    stringField(meta.avatar_url) ?? stringField(meta.picture);
  if (fromMeta) return fromMeta;
  const google = user.identities?.find((i) => i.provider === "google");
  const data = google?.identity_data ?? {};
  return stringField(data.avatar_url) ?? stringField(data.picture);
}

type HeaderUser = { email: string; avatarUrl: string | null };

function userToHeader(user: User | null | undefined): HeaderUser | null {
  const email = user?.email?.trim();
  if (!email) return null;
  return { email, avatarUrl: avatarUrlFromUser(user) };
}

export function HeaderAuth() {
  const [user, setUser] = useState<HeaderUser | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setUser(null);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setUser(userToHeader(data.user));
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(userToHeader(session?.user ?? null));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (user === undefined) {
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

  if (user) {
    const { email, avatarUrl } = user;
    return (
      <div className="flex min-h-11 max-w-[min(100vw-8rem,28rem)] items-center gap-2 sm:gap-3">
        <Link
          href="/dashboard"
          title={email}
          className="flex min-w-0 items-center gap-2 rounded-xl py-1 pr-1 transition hover:bg-accent/60 sm:gap-3 sm:pr-2"
        >
          <Avatar className="size-9 shrink-0">
            {avatarUrl ? (
              <AvatarImage
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            ) : null}
            <AvatarFallback className="text-xs font-semibold">
              {initialsFromEmail(email)}
            </AvatarFallback>
          </Avatar>
        </Link>
        <button
          type="button"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "shrink-0 rounded-xl px-3 text-muted-foreground hover:text-foreground"
          )}
          onClick={() => {
            void signOutEverywhere().finally(() => {
              setUser(null);
              window.location.href = "/";
            });
          }}
        >
          <LogOut data-icon="inline-start" aria-hidden className="size-3.5" />
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
