import { registerPlugin } from '@capacitor/core';

export interface WidgetData {
  spent_today: number;
  budget_remaining: number;
  currency: string;
  month_spent: number;
  month_budget: number;
}

export interface FinTrackNativePlugin {
  saveToken(options: { token: string }): Promise<void>;
  clearToken(): Promise<void>;
  updateWidget(options: WidgetData): Promise<void>;
}

// Web implementation is a no-op — plugin only runs on Android
export const FinTrackNative = registerPlugin<FinTrackNativePlugin>('FinTrackNative', {
  web: {
    saveToken: async () => {},
    clearToken: async () => {},
    updateWidget: async () => {},
  },
});
