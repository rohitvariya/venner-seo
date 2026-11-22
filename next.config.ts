import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photo uploads (up to 10 photos x 10 MB) go through server actions.
    serverActions: { bodySizeLimit: "110mb" },
  },
};

export default nextConfig;
