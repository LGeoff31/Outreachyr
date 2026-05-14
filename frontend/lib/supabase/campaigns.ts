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
