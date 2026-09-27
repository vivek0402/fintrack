package app.fintrack.ai;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * When the widgets refresh. Triggers:
 *  - every 30 minutes (WorkManager periodic work, needs a network);
 *  - on demand: app start, after a transaction is added/edited/deleted
 *    (FinTrackNativePlugin.refreshWidgets), the wide widget's footer tap,
 *    and the system's onUpdate (widget placed, reboot, app updated).
 * Nothing is scheduled while no FinTrack widget is on the home screen.
 */
final class WidgetRefresh {

    private static final String PERIODIC_WORK = "fintrack_widget_periodic";
    private static final String ONE_SHOT_WORK = "fintrack_widget_now";
    static final long PERIOD_MINUTES = 30;

    private WidgetRefresh() {}

    static final Class<?>[] PROVIDERS = {
        FinTrackSmallWidget.class,
        FinTrackWideWidget.class,
        FinTrackQuickAddWidget.class,
    };

    static boolean hasAnyWidgets(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return false;
        for (Class<?> cls : PROVIDERS) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, cls));
            if (ids != null && ids.length > 0) return true;
        }
        return false;
    }

    private static Constraints networkConstraint() {
        return new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
    }

    /** Idempotent: KEEP leaves an already-scheduled period alone. */
    static void schedulePeriodic(Context ctx) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            WidgetRefreshWorker.class, PERIOD_MINUTES, TimeUnit.MINUTES)
            .setConstraints(networkConstraint())
            .build();
        WorkManager.getInstance(ctx.getApplicationContext())
            .enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    /** Refresh as soon as there's a network. Coalesces bursts (REPLACE). */
    static void refreshNow(Context ctx) {
        if (!hasAnyWidgets(ctx)) return;
        schedulePeriodic(ctx);
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WidgetRefreshWorker.class)
            .setConstraints(networkConstraint())
            .build();
        WorkManager.getInstance(ctx.getApplicationContext())
            .enqueueUniqueWork(ONE_SHOT_WORK, ExistingWorkPolicy.REPLACE, request);
    }

    /** Last widget removed: stop polling. */
    static void cancelIfNoWidgets(Context ctx) {
        if (hasAnyWidgets(ctx)) return;
        WorkManager wm = WorkManager.getInstance(ctx.getApplicationContext());
        wm.cancelUniqueWork(PERIODIC_WORK);
        wm.cancelUniqueWork(ONE_SHOT_WORK);
    }
}
