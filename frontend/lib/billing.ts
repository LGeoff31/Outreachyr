import { resumeApiAuthHeaders } from "@/lib/supabase/userResumes";

export type BillingStatus = {
  billing_enabled: boolean;
  unlocked: boolean;
  sent_count: number;
  can_send: boolean;
  free_remaining: number | null;
  price_label: string;
};

export async function fetchBillingStatus(): Promise<BillingStatus | null> {
  try {
    const res = await fetch("/api/billing/status", {
      headers: await resumeApiAuthHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as BillingStatus;
  } catch {
    return null;
  }
}

export async function startCampaignUnlockCheckout(): Promise<void> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: {
      ...(await resumeApiAuthHeaders()),
      "Content-Type": "application/json",
    },
  });
  const data = (await res.json()) as { url?: string; detail?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.detail ?? "Could not start checkout.");
  }
  window.location.href = data.url;
}

export async function confirmCheckoutSession(
  sessionId: string
): Promise<BillingStatus | null> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    try {
      Object.assign(headers, await resumeApiAuthHeaders());
    } catch {
      /* Stripe return may land before Supabase session is restored */
    }

    const res = await fetch("/api/billing/confirm", {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!res.ok) return null;
    return (await res.json()) as BillingStatus;
  } catch {
    return null;
  }
}
