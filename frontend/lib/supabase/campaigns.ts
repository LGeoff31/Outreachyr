import { resumeApiAuthHeaders } from "@/lib/supabase/userResumes";

export type CampaignApiRow = {
  id: string;
  company: string;
  subject: string;
  body_preview: string;
  status: string;
  recipient_count: number;
  resume_attached: boolean;
  created_at: string | null;
  updated_at: string | null;
  sent_at: string | null;
};

export type CampaignDetailResponse = {
  id: string;
  company: string;
  subject: string;
  body_text: string;
  status: string;
  resume_storage_path: string | null;
  recipients: Array<{ email: string; greeting_name: string }>;
};

export async function fetchCampaignRows(): Promise<{
  rows: CampaignApiRow[];
  error: Error | null;
}> {
  try {
    const res = await fetch("/api/campaigns", {
      headers: await resumeApiAuthHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        rows: [],
        error: new Error(text || `${res.status} ${res.statusText}`),
      };
    }
    const data = (await res.json()) as { rows: CampaignApiRow[] };
    return { rows: data.rows ?? [], error: null };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function fetchCampaignDetail(
  id: string
): Promise<{ data: CampaignDetailResponse | null; error: Error | null }> {
  try {
    const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, {
      headers: await resumeApiAuthHeaders(),
    });
    if (res.status === 404) {
      return { data: null, error: new Error("Campaign not found") };
    }
    if (!res.ok) {
      const text = await res.text();
      return {
        data: null,
        error: new Error(text || `${res.status} ${res.statusText}`),
      };
    }
    const data = (await res.json()) as CampaignDetailResponse;
    return { data, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
