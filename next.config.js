/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  eslint: {
    // Warning: This allows production builds to successfully complete even with ESLint errors
    ignoreDuringBuilds: true,
  },
  
  // Tell Next.js to externalize firebase-admin and other Node.js specific packages
  serverExternalPackages: [
    'firebase-admin',
    'firebase-admin/app',
    'firebase-admin/auth',
    'firebase-admin/firestore',
    'firebase-admin/storage',
    'google-auth-library'
  ],
  
  // Configure webpack to handle Node.js polyfills
  webpack: (config, { isServer }) => {
    // If it's not the server, add fallbacks for Node.js modules that Firebase depends on
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
        child_process: false,
        http2: false,
        util: false,
        buffer: false,
        events: false,
        dns: false,
        url: false,
      };
    }
    
    // This line resolves the node: scheme imports
    config.resolve.alias = {
      ...config.resolve.alias,
      'node:http2': false,
      'node:stream': false,
      'node:util': false,
      'node:events': false,
      'node:process': false,
    };
    
    return config;
  },
};

module.exports = nextConfig;