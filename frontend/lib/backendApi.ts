/** Server-side backend base URL (OAuth callback, etc.). */
export function serverBackendBaseUrl(requestOrigin?: string): string {
  const configured = process.env.OUTREACH_API_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (requestOrigin) {
    const origin = new URL(requestOrigin).origin;
    const hostname = new URL(origin).hostname;
    const isLocalHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "::";

    if (!isLocalHost) {
      return `${origin}/_/backend`;
    }
  }

  return "http://127.0.0.1:5050";
}
