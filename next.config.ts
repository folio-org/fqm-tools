import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, v8: false };
    return config;
  },
};

export default nextConfig;
