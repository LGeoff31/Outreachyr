import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  DEFAULT_POST_LOGIN_PATH,
  loginPathWithNext,
  safeNextPath,
} from "@/lib/safeNextPath";

export const GOOGLE_OAUTH_SCOPES =
  "openid email profile";

export { DEFAULT_POST_LOGIN_PATH, loginPathWithNext, safeNextPath };

type IdentityCodeExchangeResult<TSession, TError> = {
  data: { session: TSession | null };
  error: TError | null;
};

/** Complete only the Supabase app-login exchange; mailbox consent is separate. */
export async function exchangeIdentityCode<TSession, TError>(
  auth: {
    exchangeCodeForSession: (
      code: string
    ) => Promise<IdentityCodeExchangeResult<TSession, TError>>;
  },
  code: string
): Promise<{ session: TSession | null; error: TError | null }> {
  const { data, error } = await auth.exchangeCodeForSession(code);
  return { session: data.session, error };
}

export function loginErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "access_denied") return "Google sign-in was canceled.";
  if (code === "invalid_state") return "Login session expired. Try again.";
  if (code === "missing_code") {
    return "Google did not return a login code. Try again.";
  }
  if (code === "supabase_config") {
    return "Supabase Auth is not configured. Check the root .env.";
  }
  if (code === "exchange") {
    return "Could not finish Google sign-in. Try again.";
  }
  return "Something went wrong with Google sign-in.";
}

export async function signOutEverywhere() {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    await supabase.auth.signOut();
  }
}
