"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  FileText,
  HelpCircle,
  LogOut,
  Mail,
  Plus,
  Send,
  UserRound,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signOutEverywhere } from "@/lib/auth";
import {
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type DashboardSection = "Campaigns" | "Templates" | "Resumes";

const primaryNav = [
  { label: "Campaigns", icon: Send, href: "/dashboard" },
  { label: "Templates", icon: FileText, href: "/dashboard/templates" },
  { label: "Resumes", icon: Mail, href: "/dashboard/resumes" },
] satisfies Array<{
  label: DashboardSection;
  icon: typeof Send;
  href: string;
}>;

const utilityNav = [
  { label: "Sign out", icon: LogOut },
];

type DashboardUser = { email: string; avatarUrl: string | null };

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

function userToDashboard(user: User | null | undefined): DashboardUser | null {
  const email = user?.email?.trim();
  if (!email) return null;
  return { email, avatarUrl: avatarUrlFromUser(user) };
}

export function DashboardShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeFromPathname(pathname);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <div className="min-h-[calc(100vh-4rem)] overflow-x-hidden bg-background">
      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-background lg:fixed lg:left-0 lg:top-16 lg:z-40 lg:flex lg:h-[calc(100vh-4rem)] lg:w-56 lg:flex-col lg:overflow-y-auto">
          <div className="p-5">
            <Link
              href="/dashboard/new"
              className={cn(
                buttonVariants(),
                "min-h-10 w-full justify-start rounded-xl px-3 text-sm shadow-lg shadow-primary/15"
              )}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              New campaign
            </Link>
          </div>

          <nav
            aria-label="Dashboard navigation"
            className="flex min-h-0 flex-1 flex-col gap-1 px-4"
          >
            {primaryNav.map((item) => {
              const isActive = item.label === active;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "min-h-12 w-full justify-start rounded-xl px-4 text-left text-sm font-medium text-muted-foreground",
                    isActive &&
                      "bg-accent text-primary shadow-sm shadow-primary/5 hover:bg-accent hover:text-primary"
                  )}
                >
                  <item.icon data-icon="inline-start" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto shrink-0 px-4 pb-4">
            <Separator className="mb-4" />
            <DashboardAccountSummary />
            <div className="flex flex-col gap-1">
              {utilityNav.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "min-h-11 w-full justify-start rounded-xl px-4 text-left text-sm font-medium text-muted-foreground"
                  )}
                  onClick={() => {
                    if (item.label === "Sign out") {
                      void signOutEverywhere().finally(() => {
                        window.location.href = "/login";
                      });
                    }
                  }}
                >
                  <item.icon data-icon="inline-start" aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-2">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-8 lg:hidden">
            <Link
              href="/dashboard/new"
              className={cn(buttonVariants(), "min-h-11 rounded-xl px-4")}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              New campaign
            </Link>
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserRound aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{active}</span>
            </div>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}

function activeFromPathname(pathname: string): DashboardSection {
  if (
    pathname === "/dashboard/templates" ||
    pathname.startsWith("/dashboard/templates/")
  ) {
    return "Templates";
  }
  if (
    pathname === "/dashboard/resumes" ||
    pathname.startsWith("/dashboard/resumes/")
  ) {
    return "Resumes";
  }
  return "Campaigns";
}

function DashboardAccountSummary() {
  const [user, setUser] = useState<DashboardUser | null | undefined>(
    undefined
  );

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
        if (!cancelled) setUser(userToDashboard(data.user));
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(userToDashboard(session?.user ?? null));
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (user === undefined) {
    return (
      <div className="mb-2 flex min-h-11 items-center gap-3 rounded-xl px-3">
        <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="h-4 min-w-0 flex-1 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      className="mb-2 flex min-h-11 items-center gap-3 rounded-xl px-3 py-2"
      title={user.email}
    >
      <Avatar className="size-8">
        {user.avatarUrl ? (
          <AvatarImage
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
          />
        ) : null}
        <AvatarFallback className="text-xs font-semibold">
          {initialsFromEmail(user.email)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-sm font-medium text-muted-foreground">
        {user.email}
      </span>
    </div>
  );
}
