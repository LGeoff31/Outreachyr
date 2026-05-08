"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type MeResponse = {
  authenticated?: boolean;
  oauth_required?: boolean;
  email?: string | null;
};

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const err = searchParams.get("error");
  const [oauthReady, setOauthReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json() as Promise<MeResponse>)
      .then((d) => {
        if (d.oauth_required && d.authenticated) {
          router.replace("/dashboard");
          return;
        }
        setOauthReady(d.oauth_required === true);
      })
      .catch(() => setOauthReady(false));
  }, [router]);

  const errorMessage =
    err === "access_denied"
      ? "Google sign-in was canceled."
      : err === "invalid_state"
        ? "Login session expired. Try again."
        : err === "exchange"
          ? "Could not finish Google login. Try again or revoke app access under Google Account permissions and retry."
          : err
            ? "Something went wrong with Google sign-in."
            : null;

  return (
    <section className="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md rounded-2xl shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Sign in with Google
          </CardTitle>
          <CardDescription className="leading-6">
            We request permission to send outreach email from your Gmail account
            using Google&apos;s secure Gmail API. Dry runs do not require
            sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorMessage ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          {oauthReady === false ? (
            <p className="text-sm text-muted-foreground">
              Google OAuth is not configured on the API server. Add{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                GOOGLE_CLIENT_ID
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                GOOGLE_CLIENT_SECRET
              </code>{" "}
              to your backend{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>
              .
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="min-h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/15"
            disabled={oauthReady !== true}
            onClick={() => {
              window.location.href = "/api/auth/google/start";
            }}
          >
            {oauthReady === null ? "Checking setup…" : "Continue with Google"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/" className="font-medium text-primary hover:underline">
              Back to home
            </Link>
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-background text-muted-foreground">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
