import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'undo';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;       // ms, default 3500
    undoLabel?: string;
    onUndo?: () => void;
}

interface ToastStore {
    toasts: Toast[];
    show: (toast: Omit<Toast, 'id'>) => string;
    dismiss: (id: string) => void;
    clear: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
    toasts: [],

    show: (toast) => {
        const id = Math.random().toString(36).slice(2);
        set(s => ({ toasts: [...s.toasts, { ...toast, id }] }));

        const duration = toast.duration ?? (toast.type === 'undo' ? 4000 : 3500);
        setTimeout(() => get().dismiss(id), duration);

        return id;
    },

    dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

    clear: () => set({ toasts: [] }),
}));

// Convenience helpers — call these anywhere without hooks
export const toast = {
    success: (message: string, duration?: number) =>
        useToastStore.getState().show({ message, type: 'success', duration }),
    error: (message: string, duration?: number) =>
        useToastStore.getState().show({ message, type: 'error', duration }),
    info: (message: string, duration?: number) =>
        useToastStore.getState().show({ message, type: 'info', duration }),
    undo: (message: string, onUndo: () => void, undoLabel = 'Undo') =>
        useToastStore.getState().show({ message, type: 'undo', onUndo, undoLabel, duration: 4000 }),
};
