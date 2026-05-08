import {
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Mail,
  Plus,
  Send,
  Settings,
  UserRound,
} from "lucide-react";

import { OutreachForm } from "@/components/OutreachForm";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Campaign builder - Outreachyr",
};

const primaryNav = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Campaigns", icon: Send },
  { label: "Templates", icon: FileText },
  { label: "Resumes", icon: Mail },
  { label: "Settings", icon: Settings },
];

const utilityNav = [
  { label: "Help", icon: HelpCircle },
  { label: "Sign out", icon: LogOut },
];

export default function DashboardPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] overflow-x-hidden bg-background">
      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-background lg:sticky lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col">
          <div className="p-6">
            <Button className="min-h-12 w-full justify-start rounded-xl px-4 text-base">
              <Plus data-icon="inline-start" aria-hidden="true" />
              New campaign
            </Button>
          </div>

          <nav
            aria-label="Dashboard navigation"
            className="flex flex-1 flex-col gap-1 px-4"
          >
            {primaryNav.map((item) => (
              <Button
                key={item.label}
                type="button"
                variant="ghost"
                className={cn(
                  "min-h-12 w-full justify-start rounded-xl px-4 text-left text-sm font-medium text-muted-foreground",
                  item.active &&
                    "bg-accent text-primary shadow-sm shadow-primary/5 hover:bg-accent hover:text-primary"
                )}
              >
                <item.icon aria-hidden="true" className="size-5" />
                {item.label}
              </Button>
            ))}
          </nav>

          <div className="px-4 pb-6">
            <Separator className="mb-4" />
            <div className="flex flex-col gap-1">
              {utilityNav.map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  variant="ghost"
                  className="min-h-11 w-full justify-start rounded-xl px-4 text-left text-sm font-medium text-muted-foreground"
                >
                  <item.icon aria-hidden="true" className="size-5" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-8 lg:hidden">
            <Button className="min-h-11 rounded-xl px-4">
              <Plus data-icon="inline-start" aria-hidden="true" />
              New campaign
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
              <UserRound aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">Dashboard</span>
            </div>
          </div>

          <OutreachForm />
        </div>
      </div>
    </div>
  );
}
