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
