import type { NextConfig } from 'next';

const apiProxyUrl = process.env.API_PROXY_URL?.replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    if (!apiProxyUrl) return [];
    return [{ source: '/v1/:path*', destination: `${apiProxyUrl}/v1/:path*` }];
  }
};

export default nextConfig;
