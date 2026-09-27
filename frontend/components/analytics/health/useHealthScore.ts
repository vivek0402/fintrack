'use client';

import { useEffect, useState } from 'react';
import { analyticsAPI, budgetsAPI, goalsAPI, debtAPI } from '@/lib/api';
import { calculateHealthScore, monthlySeriesFromTrends, type HealthScoreResult } from '@/lib/healthScore';
import { recordHealthScore, changeSinceLastMonth } from '@/lib/healthHistory';
import { getCurrentMonthYear } from '@/lib/utils';

export interface HealthScoreState {
    result: HealthScoreResult | null;
    /** Change vs. last month's recorded reading; null when there is none. */
    change: { delta: number; monthLabel: string } | null;
    loading: boolean;
    error: boolean;
}

/**
 * Fetches everything calculateHealthScore needs for the current month and
 * records the reading in the per-device history. Same inputs the dashboard
 * widget feeds the engine, so both surfaces show the same number.
 */
export function useHealthScore(enabled: boolean): HealthScoreState {
    const [state, setState] = useState<HealthScoreState>({ result: null, change: null, loading: true, error: false });

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        const { month, year } = getCurrentMonthYear();
        Promise.all([
            analyticsAPI.summary({ month, year }),
            analyticsAPI.trends(),
            budgetsAPI.getAll({ month, year }),
            goalsAPI.getAll(),
            analyticsAPI.getInvestmentRatio().catch(() => ({ data: null })),
            debtAPI.getDti().catch(() => ({ data: null })),
            debtAPI.getCreditUtilization().catch(() => ({ data: null })),
        ]).then(([summaryRes, trendsRes, budgetsRes, goalsRes, investRes, dtiRes, cuRes]) => {
            if (cancelled) return;
            const summary = summaryRes.data?.summary;
            const result = calculateHealthScore({
                income:   Number(summary?.total_income   ?? 0),
                expenses: Number(summary?.total_expenses ?? 0),
                budgets:  budgetsRes.data?.budgets ?? [],
                goals:    goalsRes.data?.goals ?? [],
                ...monthlySeriesFromTrends(trendsRes.data?.trends ?? []),
                investedThisMonth: investRes.data?.invested_this_month ?? 0,
                dtiRatio:          dtiRes.data?.dti_ratio ?? 0,
                ccUtilizationPct:  cuRes.data?.aggregate?.overall_utilization_pct ?? 0,
            });
            const history = recordHealthScore(result.score);
            setState({ result, change: changeSinceLastMonth(history, result.score), loading: false, error: false });
        }).catch(err => {
            console.error('[HealthScore]', err);
            if (!cancelled) setState({ result: null, change: null, loading: false, error: true });
        });
        return () => { cancelled = true; };
    }, [enabled]);

    return state;
}
