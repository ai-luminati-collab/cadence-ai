import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase server action body size for base64 image uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Vercel Pro: allow AI-heavy server actions up to 5 minutes
  serverExternalPackages: ['openai', '@anthropic-ai/sdk'],
};

export default nextConfig;
