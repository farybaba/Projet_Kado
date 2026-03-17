import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Service Worker PWA — stratégies de cache selon CLAUDE.md
  // next-pwa est configuré séparément via withPWA
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'ngrok-skip-browser-warning', value: 'true' }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api-proxy/:path*',
        destination: 'http://localhost:3001/api/v1/:path*',
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'kado.sn' },
      { protocol: 'https', hostname: '*.kado.sn' },
    ],
  },
};

export default nextConfig;
