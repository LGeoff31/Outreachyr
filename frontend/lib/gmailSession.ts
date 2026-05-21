import { readApiResponse, type ApiErrorBody } from "@/lib/apiError";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type GmailSessionSyncResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code?: string;
      error: string;
      detail?: string;
      raw: string;
    };

export type GmailAuthStatus = {
  authenticated: boolean;
  oauth_required?: boolean;
  email?: string | null;
  code?: string;
  error?: string;
};

export async function fetchGmailAuthStatus(): Promise<GmailAuthStatus> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    const { data, text } = await readApiResponse(res);
    if (!res.ok) {
      return {
        authenticated: false,
        error: data?.error ?? text ?? res.statusText,
        code: data?.code,
      };
    }
    const auth = data as {
      authenticated?: boolean;
      oauth_required?: boolean;
      email?: string | null;
    } | null;
    return {
      authenticated: Boolean(auth?.authenticated),
      oauth_required: auth?.oauth_required,
      email: auth?.email ?? null,
    };
  } catch (e) {
    return {
      authenticated: false,
      error: e instanceof Error ? e.message : "Could not reach /api/auth/me",
    };
  }
}

/** Ensure the backend has a Gmail send session for the signed-in user. */
export async function syncGmailSendSession(): Promise<GmailSessionSyncResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      status: 0,
      code: "supabase_not_configured",
      error: "Supabase is not configured in the frontend.",
      raw: "",
    };
  }

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      ok: false,
      status: 401,
      code: "supabase_not_signed_in",
      error: "You are not signed in to Outreachyr.",
      raw: "",
    };
  }

  if (!session.provider_refresh_token) {
    return {
      ok: false,
      status: 401,
      code: "gmail_token_missing",
      error:
        "Google did not return Gmail offline access. Revoke Outreachyr in your Google Account permissions, then sign in again.",
      raw: "",
    };
  }

  try {
    const res = await fetch("/api/auth/google/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: session.access_token,
        provider_refresh_token: session.provider_refresh_token,
      }),
    });
    const { data, text } = await readApiResponse(res);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: data?.code,
        error: data?.error ?? text ?? res.statusText,
        detail: data?.detail,
        raw: text,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      code: "network_error",
      error: e instanceof Error ? e.message : "Could not reach the backend.",
      raw: "",
    };
  }
}

export async function diagnoseGmailSendFailure(input: {
  sendStatus: number;
  sendData: ApiErrorBody | null;
  sendText: string;
}): Promise<string> {
  const sync = await syncGmailSendSession();
  const auth = await fetchGmailAuthStatus();

  const parts: string[] = [];
  parts.push(`Send failed · HTTP ${input.sendStatus}`);
  if (input.sendData?.code) parts.push(`send_code=${input.sendData.code}`);
  if (input.sendData?.detail) parts.push(input.sendData.detail);

  if (!sync.ok) {
    parts.push(
      `Session sync failed · HTTP ${sync.status || "—"}${sync.code ? ` · sync_code=${sync.code}` : ""} · ${sync.error}`
    );
  } else {
    parts.push("Session sync succeeded");
  }

  if (auth.error) {
    parts.push(`auth/me error: ${auth.error}`);
  } else {
    parts.push(
      auth.authenticated
        ? `Gmail session connected${auth.email ? ` (${auth.email})` : ""}`
        : "Gmail session not connected"
    );
  }

  if (input.sendData?.code === "gmail_session_not_found") {
    parts.push(
      "The server did not recognize your Gmail session cookie (common after a production deploy)."
    );
  }

  if (!input.sendData && input.sendText) {
    parts.push(input.sendText.replace(/\s+/g, " ").trim().slice(0, 180));
  }

  return parts.join(" · ");
}
