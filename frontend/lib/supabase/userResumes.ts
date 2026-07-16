import { apiAuthHeaders } from "@/lib/authHeaders";

export const USER_RESUMES_BUCKET = "resumes";

export type UserResumeProfile = {
  parse_status: "pending" | "ready" | "failed";
  parse_error: string | null;
  primary_school_name: string | null;
  primary_school_normalized: string | null;
  primary_major: string | null;
  grad_year: number | null;
  skills: string[];
  education: unknown[];
  experience: unknown[];
  projects: unknown[];
  links: unknown[];
  user_confirmed_at: string | null;
};

export type UserResumeProfilePatch = {
  primary_school_name: string | null;
  primary_major: string | null;
  grad_year: number | null;
  skills: string[];
  education: Record<string, unknown>[];
  experience: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  links: string[];
};

export type UserResumeRow = {
  id: string;
  owner_id: string;
  resume_storage_path: string;
  display_name: string;
  file_type: string;
  byte_size: number | null;
  focus: string;
  used_in_campaigns: number;
  is_default: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  profile?: UserResumeProfile;
};

/** Bearer headers for `/api/user-resumes/*` (exported for preview download). */
export async function resumeApiAuthHeaders(): Promise<Record<string, string>> {
  return apiAuthHeaders();
}

export async function fetchUserResumeRows(): Promise<{
  rows: UserResumeRow[];
  error: Error | null;
}> {
  try {
    const res = await fetch("/api/user-resumes", {
      headers: await resumeApiAuthHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        rows: [],
        error: new Error(text || `${res.status} ${res.statusText}`),
      };
    }
    const data = (await res.json()) as { rows: UserResumeRow[] };
    return { rows: data.rows ?? [], error: null };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function uploadUserResumePdf(
  file: File
): Promise<{ row: UserResumeRow | null; error: Error | null }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/user-resumes", {
      method: "POST",
      headers: await resumeApiAuthHeaders(),
      body: fd,
    });
    if (!res.ok) {
      const text = await res.text();
      return { row: null, error: new Error(text || res.statusText) };
    }
    const data = (await res.json()) as { row: UserResumeRow };
    return { row: data.row ?? null, error: null };
  } catch (e) {
    return {
      row: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function setUserResumeAsDefault(
  resumeId: string
): Promise<{ error: Error | null }> {
  try {
    const res = await fetch("/api/user-resumes/set-default", {
      method: "POST",
      headers: {
        ...(await resumeApiAuthHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resume_id: resumeId }),
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

export async function updateUserResumeFocus(
  resumeId: string,
  focus: string
): Promise<{ row: UserResumeRow | null; error: Error | null }> {
  try {
    const res = await fetch(
      `/api/user-resumes/${encodeURIComponent(resumeId)}`,
      {
        method: "PATCH",
        headers: {
          ...(await resumeApiAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ focus }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return { row: null, error: new Error(text || res.statusText) };
    }
    const data = (await res.json()) as { row: UserResumeRow };
    return { row: data.row ?? null, error: null };
  } catch (e) {
    return {
      row: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function updateUserResumeProfile(
  resumeId: string,
  profile: UserResumeProfilePatch
): Promise<{ row: UserResumeRow | null; error: Error | null }> {
  try {
    const res = await fetch(
      `/api/user-resumes/${encodeURIComponent(resumeId)}`,
      {
        method: "PATCH",
        headers: {
          ...(await resumeApiAuthHeaders()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profile }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return { row: null, error: new Error(text || res.statusText) };
    }
    const data = (await res.json()) as { row: UserResumeRow };
    return { row: data.row ?? null, error: null };
  } catch (e) {
    return {
      row: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function retryUserResumeProfileParse(
  resumeId: string
): Promise<{ row: UserResumeRow | null; error: Error | null }> {
  try {
    const res = await fetch(
      `/api/user-resumes/${encodeURIComponent(resumeId)}/profile/retry`,
      {
        method: "POST",
        headers: await resumeApiAuthHeaders(),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return { row: null, error: new Error(text || res.statusText) };
    }
    const data = (await res.json()) as { row: UserResumeRow };
    return { row: data.row ?? null, error: null };
  } catch (e) {
    return {
      row: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

export async function deleteUserResume(
  resumeId: string
): Promise<{ error: Error | null }> {
  try {
    const res = await fetch(`/api/user-resumes/${encodeURIComponent(resumeId)}`, {
      method: "DELETE",
      headers: await resumeApiAuthHeaders(),
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

export async function createResumeSignedUrl(
  storagePath: string
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const res = await fetch("/api/user-resumes/signed-url", {
      method: "POST",
      headers: {
        ...(await resumeApiAuthHeaders()),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ storage_path: storagePath }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { url: null, error: new Error(text || res.statusText) };
    }
    const data = (await res.json()) as { signed_url: string };
    if (!data.signed_url) {
      return { url: null, error: new Error("No signed URL returned") };
    }
    return { url: data.signed_url, error: null };
  } catch (e) {
    return {
      url: null,
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}
