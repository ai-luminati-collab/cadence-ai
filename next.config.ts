import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase server action body size for base64 image uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Increase timeout for AI-heavy server actions  
  serverExternalPackages: ['openai'],
};

export default nextConfig;
