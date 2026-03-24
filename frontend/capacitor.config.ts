import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.fintrack.ai',
  appName: 'FinTrack',
  webDir: 'out',
  server: {
    url: 'https://fintrack-omega-neon.vercel.app',
    cleartext: false
  }
};

export default config;
