import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // Required for Docker
  // Testy e2e budują w osobnym katalogu, żeby nie kolidować z działającym `next dev` (blokada .next/dev/lock).
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
