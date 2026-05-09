import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export const GOOGLE_OAUTH_SCOPES =
  "openid email profile https://www.googleapis.com/auth/gmail.send";

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
