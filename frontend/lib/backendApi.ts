/** Server-side backend base URL (OAuth callback, etc.). */
export function serverBackendBaseUrl(requestOrigin?: string): string {
  const configured = process.env.OUTREACH_API_URL?.replace(/\/$/, "");
  if (configured) return configured;

  if (requestOrigin) {
    const origin = new URL(requestOrigin).origin;
    if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      return `${origin}/_/backend`;
    }
  }

  return "http://127.0.0.1:5050";
}
