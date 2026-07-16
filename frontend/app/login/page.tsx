"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Suspense, type SVGProps, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GOOGLE_OAUTH_SCOPES,
  loginErrorMessage,
  safeNextPath,
} from "@/lib/auth";
import {
  DEFAULT_POST_LOGIN_PATH,
  setPostLoginRedirectClient,
} from "@/lib/safeNextPath";
import {
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function oauthCallbackOrigin() {
  const url = new URL(window.location.href);
  if (url.hostname === "0.0.0.0" || url.hostname === "::") {
    url.hostname = "localhost";
  }
  return url.origin;
}

function GoogleLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...props}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const err = searchParams.get("error");
  const next = safeNextPath(searchParams.get("next"));
  const supabaseConfigured = isSupabaseConfigured();
  const [checkingSession, setCheckingSession] = useState(supabaseConfigured);
  const [startingLogin, setStartingLogin] = useState(false);

  useEffect(() => {
    if (next !== DEFAULT_POST_LOGIN_PATH) {
      setPostLoginRedirectClient(next);
    }
  }, [next]);

  useEffect(() => {
    if (!supabaseConfigured) return;

    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.user) {
          router.replace(next);
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (!cancelled) setCheckingSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router, supabaseConfigured, next]);

  const errorMessage = loginErrorMessage(err);

  async function signInWithGoogle() {
    setStartingLogin(true);
    try {
      setPostLoginRedirectClient(next);
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${oauthCallbackOrigin()}/auth/callback`,
          scopes: GOOGLE_OAUTH_SCOPES,
        },
      });

      if (error) {
        setStartingLogin(false);
      }
    } catch {
      setStartingLogin(false);
    }
  }

  return (
    <section className="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md rounded-2xl border-border/80 shadow-sm shadow-black/[0.03] dark:shadow-black/20">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl font-semibold tracking-tight text-foreground text-center">
            Welcome back
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground text-center">
            Sign in with Google to access your Outreachyr workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {errorMessage ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          {!supabaseConfigured ? (
            <p className="text-sm text-muted-foreground">
              Supabase Auth is not configured. Add{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                SUPABASE_PUBLISHABLE_KEY
              </code>{" "}
              to the root{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>
              .
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={cn(
              "h-12 w-full gap-3 rounded-xl border-border/90 bg-card px-5 text-[0.9375rem] font-medium",
              "transition-all hover:border-border hover:bg-muted/40 hover:shadow-sm",
              "disabled:opacity-60"
            )}
            disabled={!supabaseConfigured || checkingSession || startingLogin}
            onClick={() => void signInWithGoogle()}
          >
            {checkingSession ? (
              <>
                <Loader2
                  aria-hidden
                  className="size-5 shrink-0 animate-spin text-muted-foreground"
                />
                Checking session…
              </>
            ) : startingLogin ? (
              <>
                <Loader2
                  aria-hidden
                  className="size-5 shrink-0 animate-spin text-muted-foreground"
                />
                Redirecting to Google…
              </>
            ) : (
              <>
                <GoogleLogo
                  data-icon="inline-start"
                  className="size-5 shrink-0"
                />
                Continue with Google
              </>
            )}
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
