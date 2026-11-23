import type { NextConfig } from "next";

// On small/busy servers the lint + type-check step of `next build` can run out of memory.
// The deploy script sets SKIP_BUILD_CHECKS=1 (checks run before every push instead).
const skipChecks = process.env.SKIP_BUILD_CHECKS === "1";

const nextConfig: NextConfig = {
  experimental: {
    // Photo uploads (up to 10 photos x 10 MB) go through server actions.
    serverActions: { bodySizeLimit: "110mb" },
  },
  eslint: { ignoreDuringBuilds: skipChecks },
  typescript: { ignoreBuildErrors: skipChecks },
};

export default nextConfig;
