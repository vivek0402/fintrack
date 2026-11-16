/** Splits billing cycles into the open one(s) and past statements, keeping the incoming order. */
export function splitCycles<T extends { is_current?: boolean }>(cycles: T[]): { current: T[]; past: T[] } {
    return {
        current: cycles.filter(c => c.is_current),
        past: cycles.filter(c => !c.is_current),
    };
}
