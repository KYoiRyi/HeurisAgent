import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Local-only development origins. The custom server also binds to 127.0.0.1.
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  // Rewrite /v1/* → /api/v1/* so OpenAI clients can point directly at this server
  async rewrites() {
    return [
      { source: '/v1/chat/completions', destination: '/api/v1/chat/completions' },
      { source: '/v1/models', destination: '/api/v1/models' },
      { source: '/v1/health', destination: '/api/v1/health' },
    ];
  },
};

export default nextConfig;
