import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type SupabaseEnv = {
  key: string;
  publicUrl: string;
  serverUrl: string;
};

export function getSupabaseEnv() {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverUrl = process.env.SUPABASE_SERVER_URL || publicUrl;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!publicUrl || !serverUrl || !key) {
    throw new Error("Supabase server environment variables are missing.");
  }

  return { key, publicUrl, serverUrl };
}

function rewriteSupabaseUrl(
  url: string,
  publicOrigin: string,
  serverOrigin: string
) {
  const requestUrl = new URL(url);
  if (requestUrl.origin !== publicOrigin) return url;

  const targetUrl = new URL(serverOrigin);
  requestUrl.protocol = targetUrl.protocol;
  requestUrl.host = targetUrl.host;
  return requestUrl.toString();
}

function rewriteSupabaseFetchInput(
  input: Parameters<typeof fetch>[0],
  publicOrigin: string,
  serverOrigin: string
) {
  if (typeof input === "string") {
    return rewriteSupabaseUrl(input, publicOrigin, serverOrigin);
  }

  if (input instanceof URL) {
    return new URL(rewriteSupabaseUrl(input.toString(), publicOrigin, serverOrigin));
  }

  return input;
}

export function supabaseServerFetchOptions(env: SupabaseEnv) {
  const publicOrigin = new URL(env.publicUrl).origin;
  const serverOrigin = new URL(env.serverUrl).origin;

  return {
    global: {
      // Keep createServerClient on the public URL so Supabase auth cookie names
      // match the browser client, but send server network calls to Docker's host.
      fetch(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
        return globalThis.fetch(
          rewriteSupabaseFetchInput(input, publicOrigin, serverOrigin),
          init
        );
      },
    },
  };
}

export async function createClient() {
  const env = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(env.publicUrl, env.key, {
    ...supabaseServerFetchOptions(env),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
