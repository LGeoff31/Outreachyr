export type ApiErrorBody = {
  ok?: boolean;
  error?: string;
  code?: string;
  detail?: string;
  auth_required?: boolean;
};

export async function readApiResponse(res: Response): Promise<{
  data: ApiErrorBody | null;
  text: string;
}> {
  const text = await res.text();
  if (!text) return { data: null, text: "" };
  try {
    return { data: JSON.parse(text) as ApiErrorBody, text };
  } catch {
    return { data: null, text };
  }
}

export function apiErrorMessage(
  data: ApiErrorBody | null,
  text: string,
  fallback: string
): string {
  return data?.error?.trim() || text.trim() || fallback;
}

/** Next.js rewrite failed before the FastAPI handler returned JSON (backend down, reset, etc.). */
export function isBackendProxyFailure(
  status: number,
  data: ApiErrorBody | null,
  text: string
): boolean {
  if (data?.ok === false && (data.error || data.code)) return false;
  if (status < 500) return false;
  const normalized = text.toLowerCase();
  return (
    !data ||
    normalized.includes("internal server error") ||
    normalized.includes("bad gateway") ||
    normalized.includes("service unavailable")
  );
}

export function backendUnreachableMessage(): string {
  return (
    "The outreach server did not respond. If you are running locally, start the backend " +
    "in a separate terminal: cd backend && uv run python3 app.py"
  );
}

export function recruiterSearchFailedMessage(company: string): string {
  const name = company.trim();
  if (name) {
    return (
      `We couldn't find recruiter emails for ${name}. ` +
      "Google may not have returned matching results — try the full company name, " +
      "then fetch again."
    );
  }
  return (
    "We couldn't find recruiter emails for that company. " +
    "Try the full company name, then fetch again."
  );
}

export function recruiterSearchUnavailableMessage(): string {
  return (
    "We couldn't reach the recruiter search service. " +
    "Please try again in a moment."
  );
}

export function formatApiDiagnostics(input: {
  status: number;
  data: ApiErrorBody | null;
  text: string;
  context?: string;
}): string {
  const parts: string[] = [];
  if (input.context) parts.push(input.context);
  parts.push(`HTTP ${input.status}`);
  if (input.data?.code) parts.push(`code=${input.data.code}`);
  if (input.data?.detail) parts.push(input.data.detail);
  if (!input.data?.error && input.text && input.text.length < 240) {
    parts.push(input.text.replace(/\s+/g, " ").trim());
  }
  return parts.join(" · ");
}
