import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  DEFAULT_POST_LOGIN_PATH,
  loginPathWithNext,
  safeNextPath,
} from "@/lib/safeNextPath";

export const GOOGLE_OAUTH_SCOPES =
  "openid email profile https://www.googleapis.com/auth/gmail.send";

export { DEFAULT_POST_LOGIN_PATH, loginPathWithNext, safeNextPath };

export async function signOutEverywhere() {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
}
