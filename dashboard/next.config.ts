import type { NextConfig } from 'next'

const gateway = process.env.GATEWAY_URL ?? 'http://localhost:3002'

const nextConfig: NextConfig = {
  rewrites: async () => [
    { source: '/v1/:path*', destination: `${gateway}/v1/:path*` },
    { source: '/api/:path*', destination: `${gateway}/api/:path*` },
    { source: '/auth/:path*', destination: `${gateway}/auth/:path*` },
    { source: '/health', destination: `${gateway}/health` },
  ],
}

export default nextConfig
