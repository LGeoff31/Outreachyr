import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function backendBaseUrl() {
  return process.env.OUTREACH_API_URL ?? "http://127.0.0.1:5050";
}

function safeNext(searchParams: URLSearchParams) {
  const next = searchParams.get("next") ?? "/dashboard";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

async function syncGmailSession({
  accessToken,
  providerRefreshToken,
}: {
  accessToken: string;
  providerRefreshToken: string;
}) {
  const response = await fetch(`${backendBaseUrl()}/api/auth/google/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: accessToken,
      provider_refresh_token: providerRefreshToken,
    }),
  });
  const data = (await response.json().catch(() => null)) as {
    code?: string;
  } | null;

  if (!response.ok) {
    return { errorCode: data?.code ?? "gmail_session", ok: false, setCookie: null };
  }

  return {
    errorCode: null,
    ok: true,
    setCookie: response.headers.get("set-cookie"),
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams);
  const redirectUrl = new URL(next, requestUrl.origin);
  const response = NextResponse.redirect(redirectUrl);
  const cookieStore = await cookies();

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", requestUrl.origin)
    );
  }

  let env: ReturnType<typeof getSupabaseEnv>;
  try {
    env = getSupabaseEnv();
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=supabase_config", requestUrl.origin)
    );
  }

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(
      new URL("/login?error=exchange", requestUrl.origin)
    );
  }

  const providerRefreshToken = data.session.provider_refresh_token;
  if (!providerRefreshToken) {
    return NextResponse.redirect(
      new URL("/login?error=gmail_token", requestUrl.origin)
    );
  }

  const sync = await syncGmailSession({
    accessToken: data.session.access_token,
    providerRefreshToken,
  });

  if (!sync.ok) {
    return NextResponse.redirect(
      new URL(`/login?error=${sync.errorCode}`, requestUrl.origin)
    );
  }

  if (sync.setCookie) {
    response.headers.append("set-cookie", sync.setCookie);
  }

  return response;
}
