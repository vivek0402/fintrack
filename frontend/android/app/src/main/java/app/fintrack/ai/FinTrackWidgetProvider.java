package app.fintrack.ai;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/**
 * Shared behaviour for the three FinTrack widgets. Rendering is always from
 * the local cache (instant, works offline and right after a reboot); the
 * network refresh runs separately in WidgetRefreshWorker.
 */
abstract class FinTrackWidgetProvider extends AppWidgetProvider {

    /** onUpdate fires on placement, reboot and app update; don't refetch more often than this. */
    private static final long MIN_REFRESH_GAP_MS = 5 * 60 * 1000;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        WidgetRenderer.update(context, manager, getClass(), appWidgetIds);
        WidgetRefresh.schedulePeriodic(context);
        long lastAttempt = WidgetStore.getLastAttempt(context);
        if (System.currentTimeMillis() - lastAttempt > MIN_REFRESH_GAP_MS) {
            WidgetRefresh.refreshNow(context);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        WidgetRenderer.update(context, manager, getClass(), new int[] { appWidgetId });
    }

    @Override
    public void onEnabled(Context context) {
        WidgetRefresh.schedulePeriodic(context);
    }

    @Override
    public void onDisabled(Context context) {
        WidgetRefresh.cancelIfNoWidgets(context);
    }
}
