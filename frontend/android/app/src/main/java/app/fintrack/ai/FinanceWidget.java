package app.fintrack.ai;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.DecimalFormat;

public class FinanceWidget extends AppWidgetProvider {

    private static final String PREFS_NAME = "fintrack_widget";
    private static final String KEY_DATA   = "fintrack_widget_data";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            renderWidget(context, appWidgetManager, id);
        }
    }

    static void triggerUpdate(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FinanceWidget.class));
        for (int id : ids) renderWidget(context, manager, id);
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_finance);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        // Tap the widget → open FinTrack
        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPI = PendingIntent.getActivity(
            context, 10, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_finance_root, openPI);

        try {
            String json = prefs.getString(KEY_DATA, null);
            if (json != null) {
                JSONObject data = new JSONObject(json);
                double spentToday   = data.optDouble("spent_today", 0);
                double budgetRemain = data.optDouble("budget_remaining", 0);
                double monthSpent   = data.optDouble("month_spent", 0);
                double monthBudget  = data.optDouble("month_budget", 0);
                String currency     = data.optString("currency", "INR");

                String prefix = "INR".equals(currency) ? "₹" : currency + " ";
                DecimalFormat df = new DecimalFormat("#,##0");

                views.setTextViewText(R.id.widget_finance_spent,
                    prefix + df.format(Math.round(spentToday)));
                views.setTextViewText(R.id.widget_finance_remaining,
                    prefix + df.format(Math.round(Math.max(0, budgetRemain))) + " left");
                views.setTextViewText(R.id.widget_finance_budget,
                    "of " + prefix + df.format(Math.round(monthBudget)));

                int progress = monthBudget > 0
                    ? (int) Math.min(100, (monthSpent / monthBudget) * 100)
                    : 0;
                views.setProgressBar(R.id.widget_finance_progress, 100, progress, false);
            }
        } catch (Exception ignored) {}

        manager.updateAppWidget(widgetId, views);
    }
}
