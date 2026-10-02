import { describe, it, expect, vi, beforeEach } from 'vitest';

const native = vi.hoisted(() => ({ value: true }));
const impact = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const notification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }));
vi.mock('@capacitor/haptics', () => ({
    Haptics: { impact, notification },
    ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM' },
    NotificationType: { Success: 'SUCCESS', Error: 'ERROR' },
}));

import { haptics } from './haptics';

beforeEach(() => { native.value = true; impact.mockClear(); notification.mockClear(); });

describe('haptics', () => {
    it('vibrates in the Android app', () => {
        haptics.threshold();
        haptics.success();
        expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' });
        expect(notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
    });

    it('does nothing in the browser', () => {
        native.value = false;
        haptics.delete();
        haptics.error();
        expect(impact).not.toHaveBeenCalled();
        expect(notification).not.toHaveBeenCalled();
    });

    it('never throws when the plugin is missing (an older APK)', async () => {
        impact.mockRejectedValueOnce(new Error('plugin not implemented'));
        expect(() => haptics.delete()).not.toThrow();
        await Promise.resolve();
    });
});
