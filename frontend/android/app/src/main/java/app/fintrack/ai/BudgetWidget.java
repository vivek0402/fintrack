package app.fintrack.ai;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

public class BudgetWidget extends AppWidgetProvider {

    private static final String PREFS_NAME = "fintrack_widget";
    static final String ACTION_REFRESH = "app.fintrack.ai.BUDGET_WIDGET_REFRESH";
    static final String WORK_TAG = "budget_widget_refresh";

    @Override
    public void onEnabled(Context context) {
        schedulePeriodicRefresh(context);
    }

    @Override
    public void onDisabled(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_TAG);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        schedulePeriodicRefresh(context);
        for (int id : appWidgetIds) {
            renderWidget(context, appWidgetManager, id);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BudgetRefreshWorker.class)
                .setConstraints(constraints)
                .build();
            WorkManager.getInstance(context).enqueue(request);
        }
    }

    static void triggerUpdate(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BudgetWidget.class));
        for (int id : ids) renderWidget(context, manager, id);
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_budget);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String jwt = prefs.getString("jwt", null);

        if (jwt == null) {
            views.setViewVisibility(R.id.widget_budget_status, View.VISIBLE);
            views.setViewVisibility(R.id.widget_budget_content, View.GONE);
            manager.updateAppWidget(widgetId, views);
            return;
        }

        views.setViewVisibility(R.id.widget_budget_status, View.GONE);
        views.setViewVisibility(R.id.widget_budget_content, View.VISIBLE);

        String monthYear = new SimpleDateFormat("MMM yyyy", Locale.getDefault())
            .format(Calendar.getInstance().getTime());
        views.setTextViewText(R.id.widget_budget_month, monthYear);

        Intent refreshIntent = new Intent(context, BudgetWidget.class);
        refreshIntent.setAction(ACTION_REFRESH);
        refreshIntent.setPackage(context.getPackageName());
        PendingIntent refreshPI = PendingIntent.getBroadcast(
            context, 1, refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_budget_refresh, refreshPI);

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.putExtra("OPEN_SCREEN", "budgets");
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPI = PendingIntent.getActivity(
            context, 2, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_budget_root, openPI);

        try {
            String summaryStr = prefs.getString("summary_json", null);
            if (summaryStr != null) {
                JSONObject summary = new JSONObject(summaryStr);
                long income = Math.round(summary.optDouble("total_income", 0));
                long expenses = Math.round(summary.optDouble("total_expenses", 0));
                views.setTextViewText(R.id.widget_income, "₹" + income);
                views.setTextViewText(R.id.widget_expenses, "₹" + expenses);
            }
        } catch (Exception ignored) {}

        int[] nameIds     = { R.id.budget1_name,     R.id.budget2_name,     R.id.budget3_name };
        int[] progressIds = { R.id.budget1_progress, R.id.budget2_progress, R.id.budget3_progress };
        int[] amountIds   = { R.id.budget1_amount,   R.id.budget2_amount,   R.id.budget3_amount };

        try {
            String budgetsStr = prefs.getString("budgets_json", null);
            if (budgetsStr != null) {
                JSONObject root = new JSONObject(budgetsStr);
                JSONArray budgets = root.getJSONArray("budgets");

                for (int i = 0; i < 3; i++) {
                    if (i >= budgets.length()) {
                        views.setTextViewText(nameIds[i], "");
                        views.setProgressBar(progressIds[i], 100, 0, false);
                        views.setTextViewText(amountIds[i], "");
                        continue;
                    }
                    JSONObject b = budgets.getJSONObject(i);
                    String icon = b.optString("category_icon", "");
                    String name = b.optString("category_name", "Budget " + (i + 1));
                    double spent = b.optDouble("spent", 0);
                    double amount = b.optDouble("amount", 1);
                    int progress = (int) Math.min(100, (spent / amount) * 100);

                    views.setTextViewText(nameIds[i], icon + " " + name);
                    views.setProgressBar(progressIds[i], 100, progress, false);
                    views.setTextViewText(amountIds[i],
                        "₹" + Math.round(spent) + "/" + "₹" + Math.round(amount));
                }
            }
        } catch (Exception ignored) {}

        manager.updateAppWidget(widgetId, views);
    }

    private static void schedulePeriodicRefresh(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            BudgetRefreshWorker.class, 30, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_TAG,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        );
    }
}
