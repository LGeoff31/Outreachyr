import { createClient } from "@/lib/supabase/client";

export function bearerAuthHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Supabase bearer credentials for owner-scoped backend APIs. */
export async function apiAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not signed in");
  }
  return bearerAuthHeaders(session.access_token);
}
