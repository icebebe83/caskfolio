import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: configDir,
  images: {
    unoptimized: true,
  },
  experimental: {
    devtoolSegmentExplorer: false,
  },
};

export default nextConfig;
