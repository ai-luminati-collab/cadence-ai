import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  serverExternalPackages: ['openai', '@anthropic-ai/sdk'],
  maxDuration: 300,
};

export default nextConfig;
