import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Service Worker PWA — stratégies de cache selon CLAUDE.md
  // next-pwa est configuré séparément via withPWA
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000', 'kado-gamma.vercel.app'] },
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
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
