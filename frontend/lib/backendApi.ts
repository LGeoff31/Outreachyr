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

  const backendPort = process.env.BACKEND_PORT?.trim();
  if (!backendPort) {
    throw new Error("Set OUTREACH_API_URL or BACKEND_PORT for backend API access.");
  }

  return `http://127.0.0.1:${backendPort}`;
}
