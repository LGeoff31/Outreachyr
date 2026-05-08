import type { NextConfig } from "next";
import path from "path";

const api =
  process.env.OUTREACH_API_URL ?? "http://127.0.0.1:5050";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${api}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
