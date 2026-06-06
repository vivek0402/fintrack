import { FinTrackNative, WidgetData } from '@/plugins/FinTrackNativePlugin';

export function updateWidgetData(data: WidgetData): void {
    if (typeof window === 'undefined') return;
    try {
        FinTrackNative.updateWidget(data).catch(() => {});
    } catch {}
}
