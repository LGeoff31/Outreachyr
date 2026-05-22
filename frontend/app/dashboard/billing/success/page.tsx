"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirmCheckoutSession, fetchBillingStatus } from "@/lib/billing";

function BillingSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() || "";
  const [ready, setReady] = useState(false);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      if (sessionId) {
        const confirmed = await confirmCheckoutSession(sessionId);
        if (confirmed?.unlocked) {
          if (!cancelled) {
            setReady(true);
            setPolling(false);
          }
          return;
        }
      }

      while (!cancelled && attempts < 12) {
        attempts += 1;
        const status = await fetchBillingStatus();
        if (status?.unlocked) {
          if (!cancelled) {
            setReady(true);
            setPolling(false);
          }
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      if (!cancelled) setPolling(false);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {ready ? (
          <>
            <CheckCircle2
              aria-hidden
              className="mx-auto size-10 text-[hsl(var(--chart-2))]"
            />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              You&apos;re unlocked
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Unlimited campaigns are now available on your account.
            </p>
            <Button asChild className="mt-6 rounded-xl">
              <Link href="/dashboard/new">Start a campaign</Link>
            </Button>
          </>
        ) : (
          <>
            <Loader2
              aria-hidden
              className="mx-auto size-8 animate-spin text-muted-foreground"
            />
            <h1 className="mt-4 text-xl font-semibold tracking-tight">
              {polling ? "Confirming payment…" : "Almost there"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {polling
                ? "This usually takes a few seconds."
                : "Payment went through but unlock is still pending. Try refreshing, or run Stripe CLI locally for webhooks."}
            </p>
            {!polling ? (
              <Button asChild variant="outline" className="mt-6 rounded-xl">
                <Link href="/dashboard/new">Back to campaigns</Link>
              </Button>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <Loader2
            aria-hidden
            className="size-8 animate-spin text-muted-foreground"
          />
        </main>
      }
    >
      <BillingSuccessContent />
    </Suspense>
  );
}
