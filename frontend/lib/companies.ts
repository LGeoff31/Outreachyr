export type CompanyOption = {
  /** Backend mapping key (lowercase, matches COMPANY_EMAIL_HOST). */
  key: string;
  label: string;
  logo?: string;
};

/** Keep in sync with backend/mapping.py keys. */
export const COMPANY_OPTIONS: CompanyOption[] = [
  { key: "amazon", label: "Amazon", logo: "/logos/amazon.png" },
  { key: "roblox", label: "Roblox", logo: "/logos/roblox.png" },
  { key: "nvidia", label: "Nvidia", logo: "/logos/nvidia.png" },
  { key: "citadel", label: "Citadel", logo: "/logos/citadel.png" },
  { key: "janestreet", label: "Jane Street", logo: "/logos/jane-street.png" },
  { key: "capital one", label: "Capital One", logo: "/logos/capital_one.png" },
  { key: "cockroach", label: "Cockroach Labs", logo: "/logos/cockroach.png" },
  { key: "databricks", label: "Databricks", logo: "/logos/databricks.png" },
  { key: "gemini", label: "Gemini", logo: "/logos/gemini.png" },
  { key: "notion", label: "Notion", logo: "/logos/notion.png" },
  { key: "palantir", label: "Palantir", logo: "/logos/palantir.png" },
  { key: "point72", label: "Point72", logo: "/logos/point72.png" },
  { key: "shopify", label: "Shopify", logo: "/logos/shopify.png" },
];

export function normalizeCompanyKey(value: string): string {
  return value.trim().toLowerCase();
}

export function companyOptionForValue(value: string): CompanyOption | undefined {
  const key = normalizeCompanyKey(value);
  if (!key) return undefined;
  return COMPANY_OPTIONS.find((option) => option.key === key);
}

export function isKnownCompany(value: string): boolean {
  return companyOptionForValue(value) !== undefined;
}
