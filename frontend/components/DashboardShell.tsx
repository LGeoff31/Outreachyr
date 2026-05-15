"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  FileText,
  HelpCircle,
  LogOut,
  Mail,
  Plus,
  Send,
  UserRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { signOutEverywhere } from "@/lib/auth";
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
  { label: "Help", icon: HelpCircle },
  { label: "Sign out", icon: LogOut },
];

export function DashboardShell({
  active,
  children,
}: {
  active: DashboardSection;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[calc(100vh-4rem)] overflow-x-hidden bg-background">
      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-background lg:flex lg:flex-col lg:self-stretch">
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
            className="flex flex-1 flex-col gap-1 px-4"
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

          <div className="px-4 pb-6">
            <Separator className="mb-4" />
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

        <div className="min-w-0">
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
