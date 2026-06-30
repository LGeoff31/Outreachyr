export const DEFAULT_POST_LOGIN_PATH = "/dashboard";

export const POST_LOGIN_COOKIE = "outreach_auth_next";
const POST_LOGIN_COOKIE_MAX_AGE_SEC = 60 * 10;

/** Only allow same-origin relative paths (blocks open redirects). */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = DEFAULT_POST_LOGIN_PATH
) {
  const next = (raw ?? "").trim() || fallback;
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Persist redirect target before OAuth — Supabase prod often drops query params on callback URL. */
export function setPostLoginRedirectClient(next: string) {
  if (typeof document === "undefined") return;
  const safe = safeNextPath(next);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${POST_LOGIN_COOKIE}=${encodeURIComponent(safe)}; Path=/; Max-Age=${POST_LOGIN_COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
}

export function clearPostLoginRedirectClient() {
  if (typeof document === "undefined") return;
  document.cookie = `${POST_LOGIN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readPostLoginRedirectCookie(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function resolvePostLoginPath(
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const raw = candidate?.trim();
    if (!raw) continue;
    const decoded = readPostLoginRedirectCookie(raw) ?? raw;
    const safe = safeNextPath(decoded, "");
    if (safe) return safe;
  }
  return DEFAULT_POST_LOGIN_PATH;
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
