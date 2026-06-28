"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { loginPathWithNext } from "@/lib/safeNextPath";
import {
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

export function DashboardAuthBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const loginPath = loginPathWithNext(
      `${window.location.pathname}${window.location.search}`
    );

    if (!isSupabaseConfigured()) {
      router.replace(loginPath);
      setReady(true);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data.user) {
          router.replace(loginPath);
          return;
        }
        setAllowed(true);
      })
      .catch(() => {
        if (!cancelled) router.replace(loginPath);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}
