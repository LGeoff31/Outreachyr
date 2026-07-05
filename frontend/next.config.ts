import type { NextConfig } from "next";
import path from "path";

function apiBaseUrl() {
  const configured = process.env.OUTREACH_API_URL?.replace(/\/$/, "");
  if (configured) return configured;
  // Prefer the stable production domain over the ephemeral deployment URL.
  const productionHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, "").replace(
      /\/$/,
      ""
    ) || null;
  if (process.env.VERCEL_ENV === "production" && productionHost) {
    return `https://${productionHost}/_/backend`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/_/backend`;
  }
  return "http://127.0.0.1:5050";
}

const isLocalBackend =
  !process.env.OUTREACH_API_URL?.trim() && !process.env.VERCEL;

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  ...(isLocalBackend
    ? {
        experimental: {
          // SerpAPI recruiter discovery can exceed the default 30s dev proxy limit.
          proxyTimeout: 180_000,
        },
      }
    : {}),
  async rewrites() {
    const api = apiBaseUrl();
    return [
      {
        source: "/api/:path*",
        destination: `${api}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
