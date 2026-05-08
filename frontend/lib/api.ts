export async function fetchCompanyKeys(): Promise<string[]> {
  const res = await fetch("/api/companies", { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { companies?: string[] };
  return data.companies ?? [];
}
