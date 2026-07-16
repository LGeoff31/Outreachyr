import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { exchangeIdentityCode } from "@/lib/auth";
import { loginErrorUrl, POST_LOGIN_COOKIE, resolvePostLoginPath } from "@/lib/safeNextPath";
import {
  getSupabaseEnv,
  supabaseServerFetchOptions,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

  const { session, error } = await exchangeIdentityCode(supabase.auth, code);
  if (error || !session) {
    return NextResponse.redirect(
      loginErrorUrl(requestUrl.origin, "exchange", next)
    );
  }

  return response;
}
