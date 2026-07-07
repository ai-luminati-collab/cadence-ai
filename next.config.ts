import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  serverExternalPackages: ['openai', '@anthropic-ai/sdk'],
  // Knowledge-base markdown is read with fs at runtime; without explicit
  // tracing Vercel won't bundle it into serverless functions and every
  // AI prompt silently loses its knowledge injection.
  outputFileTracingIncludes: {
    '/**': [
      './src/knowledge-base/**/*.md',
      './src/core/knowledge/**/*.md',
      './src/lib/**/*.md',
    ],
  },
};

export default nextConfig;
