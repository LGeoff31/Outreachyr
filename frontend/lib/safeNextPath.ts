export const DEFAULT_POST_LOGIN_PATH = "/dashboard";

/** Only allow same-origin relative paths (blocks open redirects). */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = DEFAULT_POST_LOGIN_PATH
) {
  const next = (raw ?? "").trim() || fallback;
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function loginPathWithNext(next?: string | null) {
  const safe = safeNextPath(next);
  if (safe === DEFAULT_POST_LOGIN_PATH) return "/login";
  return `/login?next=${encodeURIComponent(safe)}`;
}

export function loginErrorUrl(origin: string, error: string, next?: string) {
  const params = new URLSearchParams({ error });
  const safeNext = safeNextPath(next);
  if (safeNext !== DEFAULT_POST_LOGIN_PATH) {
    params.set("next", safeNext);
  }
  return new URL(`/login?${params.toString()}`, origin);
}
