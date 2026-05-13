import { createClient } from "@/lib/supabase/client";

export type EmailTemplateRow = {
  id: string;
  owner_id: string;
  name: string;
  subject: string;
  body_text: string;
  created_at: string;
  updated_at: string;
};

export async function templateApiAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not signed in");
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function fetchEmailTemplateRows(): Promise<{
  rows: EmailTemplateRow[];
  error: Error | null;
}> {
  try {
    const res = await fetch("/api/templates", {
      headers: await templateApiAuthHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        rows: [],
        error: new Error(text || `${res.status} ${res.statusText}`),
      };
    }
    const data = (await res.json()) as { rows: EmailTemplateRow[] };
    return { rows: data.rows ?? [], error: null };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function createEmailTemplate(input: {
  name: string;
  subject: string;
  body_text: string;
}): Promise<{ row: EmailTemplateRow | null; error: Error | null }> {
  try {
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: {
        ...(await templateApiAuthHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text();
      return { row: null, error: new Error(text || res.statusText) };
    }
    const data = (await res.json()) as { row: EmailTemplateRow };
    return { row: data.row ?? null, error: null };
  } catch (e) {
    return {
      row: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function updateEmailTemplate(
  id: string,
  input: { name?: string; subject?: string; body_text?: string }
): Promise<{ row: EmailTemplateRow | null; error: Error | null }> {
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        ...(await templateApiAuthHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text();
      return { row: null, error: new Error(text || res.statusText) };
    }
    const data = (await res.json()) as { row: EmailTemplateRow };
    return { row: data.row ?? null, error: null };
  } catch (e) {
    return {
      row: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function deleteEmailTemplate(
  id: string
): Promise<{ error: Error | null }> {
  try {
    const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: await templateApiAuthHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: new Error(text || res.statusText) };
    }
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
