'use client';

import { useEffect, useState, useCallback } from 'react';
import { categoriesAPI } from '@/lib/api';
import type { CategoryOption } from '@/components/categories/CategoryPickerDialog';

// Seven call sites used to fetch /api/categories independently, each holding
// its own copy. That meant creating a category in one picker left every other
// mounted picker stale until remount. This is a module-level cache plus a
// subscriber list so a create anywhere refreshes everywhere.
//
// Deliberately NOT part of lib/apiWithCache -- that layer is the offline
// IndexedDB fallback. This is an in-memory dedupe for a single session.

let cache: CategoryOption[] | null = null;
let inFlight: Promise<CategoryOption[]> | null = null;
const subscribers = new Set<(cats: CategoryOption[]) => void>();

function publish(cats: CategoryOption[]) {
    cache = cats;
    subscribers.forEach(fn => fn(cats));
}

function load(force = false): Promise<CategoryOption[]> {
    if (!force && cache) return Promise.resolve(cache);
    if (!force && inFlight) return inFlight;
    inFlight = categoriesAPI.getAll()
        .then(res => {
            const cats: CategoryOption[] = res.data?.categories || [];
            publish(cats);
            return cats;
        })
        .catch(() => cache ?? [])
        .finally(() => { inFlight = null; });
    return inFlight;
}

/** Drop the cache so the next mount refetches. Call after a sign-out or import. */
export function invalidateCategories() {
    cache = null;
}

export function useCategories() {
    const [categories, setCategories] = useState<CategoryOption[]>(cache ?? []);
    const [loading, setLoading] = useState(!cache);

    useEffect(() => {
        subscribers.add(setCategories);
        let alive = true;
        load().then(() => { if (alive) setLoading(false); });
        return () => { alive = false; subscribers.delete(setCategories); };
    }, []);

    const refresh = useCallback(() => load(true), []);

    // Optimistic local insert for a just-created category, so the picker can
    // select it without waiting for the round trip.
    const addLocal = useCallback((cat: CategoryOption) => {
        publish([...(cache ?? []), { usage_count: 0, last_used: null, ...cat }]);
    }, []);

    return { categories, loading, refresh, addLocal };
}
