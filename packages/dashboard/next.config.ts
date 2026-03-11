import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@rangeguard/common', '@rangeguard/db', '@rangeguard/security'],
  serverExternalPackages: ['better-sqlite3'],
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    if (isServer) {
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'better-sqlite3',
      ];
    }
    return config;
  },
};

export default nextConfig;
