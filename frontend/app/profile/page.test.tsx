import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProfilePage from './page';
import { notificationsAPI, profileAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';

// Covers only the notification toggles' load/save behaviour.

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/store/authStore', () => ({
    useAuthStore: () => ({
        user: { id: 'u1', currency: 'INR' },
        isLoading: false,
        loadFromStorage: vi.fn(),
        setAuth: vi.fn(),
        token: 't',
        logout: vi.fn(),
    }),
}));

vi.mock('@/store/toastStore', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/api', () => ({
    profileAPI: { get: vi.fn(), update: vi.fn(), changePassword: vi.fn() },
    aiAPI: { clearCache: vi.fn() },
    transactionsAPI: { getAll: vi.fn() },
    notificationsAPI: { getPrefs: vi.fn(), updatePrefs: vi.fn() },
}));

const ALL_ON = { budgetAlerts: true, billReminders: true, goalAlerts: true, weeklySummary: true };
const getPrefs = vi.mocked(notificationsAPI.getPrefs);
const updatePrefs = vi.mocked(notificationsAPI.updatePrefs);

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

// The switch in the row whose label is `label`.
function switchFor(label: string): HTMLElement {
    const row = screen.getByText(label).closest('div')!.parentElement!;
    return row.querySelector('[role="switch"]') as HTMLElement;
}

describe('ProfilePage notification toggles', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(profileAPI.get).mockResolvedValue({
            data: { profile: { full_name: 'A', email: 'a@x.com', currency: 'INR' } },
        } as never);
    });

    it('PUTs only the toggled key', async () => {
        getPrefs.mockResolvedValue({ data: { prefs: ALL_ON, stored: true } } as never);
        updatePrefs.mockResolvedValue({ data: {} } as never);
        render(<ProfilePage />);
        await waitFor(() => expect(getPrefs).toHaveBeenCalled());

        fireEvent.click(switchFor('Goal milestone alerts'));

        expect(updatePrefs).toHaveBeenCalledWith({ goalAlerts: false });
        expect(switchFor('Goal milestone alerts')).toHaveAttribute('aria-checked', 'false');
    });

    it('a failed save reverts only its own key', async () => {
        getPrefs.mockResolvedValue({ data: { prefs: ALL_ON, stored: true } } as never);
        const goalSave = deferred<unknown>();
        updatePrefs.mockImplementation(((body: Record<string, boolean>) =>
            'goalAlerts' in body ? goalSave.promise : Promise.resolve({ data: {} })) as never);
        render(<ProfilePage />);
        await waitFor(() => expect(getPrefs).toHaveBeenCalled());

        fireEvent.click(switchFor('Goal milestone alerts'));
        fireEvent.click(switchFor('Bill due reminders'));
        goalSave.reject(new Error('500'));

        await waitFor(() => expect(switchFor('Goal milestone alerts')).toHaveAttribute('aria-checked', 'true'));
        expect(switchFor('Bill due reminders')).toHaveAttribute('aria-checked', 'false');
        expect(JSON.parse(localStorage.getItem('fintrack-notif-prefs')!)).toEqual({ ...ALL_ON, billReminders: false });
    });

    it('a failed save does not clobber a newer toggle of the same key', async () => {
        getPrefs.mockResolvedValue({ data: { prefs: ALL_ON, stored: true } } as never);
        const first = deferred<unknown>();
        updatePrefs
            .mockImplementationOnce((() => first.promise) as never)
            .mockResolvedValue({ data: {} } as never);
        render(<ProfilePage />);
        await waitFor(() => expect(getPrefs).toHaveBeenCalled());

        fireEvent.click(switchFor('Goal milestone alerts')); // -> off (will fail)
        fireEvent.click(switchFor('Goal milestone alerts')); // -> on
        fireEvent.click(switchFor('Goal milestone alerts')); // -> off (succeeds)
        first.reject(new Error('500'));
        await waitFor(() => expect(toast.error).toHaveBeenCalled());

        expect(switchFor('Goal milestone alerts')).toHaveAttribute('aria-checked', 'false');
    });

    it('the initial load does not overwrite a toggle made while it was in flight', async () => {
        const load = deferred<unknown>();
        getPrefs.mockReturnValue(load.promise as never);
        updatePrefs.mockResolvedValue({ data: {} } as never);
        render(<ProfilePage />);

        fireEvent.click(switchFor('Goal milestone alerts')); // user turns goals off
        load.resolve({ data: { prefs: { ...ALL_ON, billReminders: false }, stored: true } });

        await waitFor(() => expect(switchFor('Bill due reminders')).toHaveAttribute('aria-checked', 'false'));
        expect(switchFor('Goal milestone alerts')).toHaveAttribute('aria-checked', 'false');
        expect(JSON.parse(localStorage.getItem('fintrack-notif-prefs')!)).toEqual({ ...ALL_ON, billReminders: false, goalAlerts: false });
    });
});
