import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships native binaries. Leaving it external lets the platform pick the
  // matching @img/sharp-* build instead of bundling the wrong one.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
