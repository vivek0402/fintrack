import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: false,
  workboxOptions: {
    disableDevLogs: true,
    // Without these, a new service worker installs but stays in "waiting"
    // until every open instance of the app fully closes -- which an
    // installed PWA / the Android WebView almost never does, so deploys
    // could sit invisible indefinitely. skipWaiting activates the new
    // worker immediately; clientsClaim lets it take control of already-open
    // pages right away instead of only on the next full navigation.
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /\/api\/(transactions|budgets|goals)/,
        handler: 'NetworkFirst' as const,
        options: {
          cacheName: 'fintrack-api-cache',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  turbopack: {},
  images: {
    unoptimized: true,
  },
};

export default withPWA(nextConfig);