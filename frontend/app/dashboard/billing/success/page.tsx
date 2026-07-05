import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

export default async function LegacyBillingSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionId = params.session_id?.trim();
  const query = sessionId
    ? `?session_id=${encodeURIComponent(sessionId)}`
    : "";
  redirect(`/billing/success${query}`);
}
