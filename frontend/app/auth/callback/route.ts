import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { serverBackendBaseUrl } from "@/lib/backendApi";
import { loginErrorUrl, POST_LOGIN_COOKIE, resolvePostLoginPath } from "@/lib/safeNextPath";
import {
  getSupabaseEnv,
  supabaseServerFetchOptions,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function syncGmailSession({
  accessToken,
  providerRefreshToken,
  requestOrigin,
}: {
  accessToken: string;
  providerRefreshToken: string;
  requestOrigin: string;
}) {
  const response = await fetch(
    `${serverBackendBaseUrl(requestOrigin)}/api/auth/google/session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        provider_refresh_token: providerRefreshToken,
      }),
    }
  );
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
  const cookieStore = await cookies();
  const next = resolvePostLoginPath(
    cookieStore.get(POST_LOGIN_COOKIE)?.value,
    requestUrl.searchParams.get("next")
  );
  const redirectUrl = new URL(next, requestUrl.origin);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(POST_LOGIN_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });

  if (!code) {
    return NextResponse.redirect(
      loginErrorUrl(requestUrl.origin, "missing_code", next)
    );
  }

  let env: ReturnType<typeof getSupabaseEnv>;
  try {
    env = getSupabaseEnv();
  } catch {
    return NextResponse.redirect(
      loginErrorUrl(requestUrl.origin, "supabase_config", next)
    );
  }

  const supabase = createServerClient(env.publicUrl, env.key, {
    ...supabaseServerFetchOptions(env),
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
      loginErrorUrl(requestUrl.origin, "exchange", next)
    );
  }

  const providerRefreshToken = data.session.provider_refresh_token;
  if (!providerRefreshToken) {
    return NextResponse.redirect(
      loginErrorUrl(requestUrl.origin, "gmail_token", next)
    );
  }

  const sync = await syncGmailSession({
    accessToken: data.session.access_token,
    providerRefreshToken,
    requestOrigin: requestUrl.origin,
  });

  if (!sync.ok) {
    return NextResponse.redirect(
      loginErrorUrl(requestUrl.origin, sync.errorCode ?? "gmail_session", next)
    );
  }

  if (sync.setCookie) {
    response.headers.append("set-cookie", sync.setCookie);
  }

  return response;
}
