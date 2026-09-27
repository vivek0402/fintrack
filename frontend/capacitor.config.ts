import type { CapacitorConfig } from '@capacitor/cli';

// The WebView loads the deployed site. For local testing, point it elsewhere
// at sync time, e.g. `CAP_SERVER_URL=http://10.0.2.2:3000 npx cap sync android`
// (10.0.2.2 is the host machine as seen from the Android emulator). Cleartext
// HTTP is allowed only when that override is itself http://.
const serverUrl = process.env.CAP_SERVER_URL?.trim() || 'https://fintrack-omega-neon.vercel.app';

const config: CapacitorConfig = {
  appId: 'app.fintrack.ai',
  appName: 'FinTrack',
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://')
  }
};

export default config;
