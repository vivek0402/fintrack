import { registerPlugin } from '@capacitor/core';

export interface FinTrackNativePlugin {
  saveToken(options: { token: string }): Promise<void>;
  clearToken(): Promise<void>;
}

// Web implementation is a no-op — plugin only runs on Android
export const FinTrackNative = registerPlugin<FinTrackNativePlugin>('FinTrackNative', {
  web: {
    saveToken: async () => {},
    clearToken: async () => {},
  },
});
