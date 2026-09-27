package app.fintrack.ai;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Draws all three widgets from the cached summary (WidgetStore). Never hits
 * the network, so it's safe to call from onUpdate and after every refresh.
 *
 * States: signed out (no widget token) -> "Open FinTrack to set up";
 * signed in but nothing loaded yet -> dashes; otherwise the cached numbers
 * with the time of the last successful update ("3h ago" once over 2h old).
 */
final class WidgetRenderer {

    private static final String TAG = "FinTrackWidget";
    private static final String DASH = "—";

    // Intent extras MainActivity understands. Taps never bypass the app lock:
    // they just open the app, and AppLockGate locks on cold start / resume.
    static final String EXTRA_OPEN_QUICK_ADD = "OPEN_QUICK_ADD";
    static final String EXTRA_OPEN_SCREEN = "OPEN_SCREEN";

    private static final int RC_QUICK_ADD = 7101;
    private static final int RC_DASHBOARD = 7102;
    private static final int RC_BUDGETS = 7103;
    private static final int RC_REFRESH = 7104;

    private WidgetRenderer() {}

    /** Everything a widget needs, parsed once per redraw. */
    static final class Model {
        boolean signedIn;
        boolean loaded;
        long lastSuccessMs;
        String today = DASH;
        String monthSpent = DASH;
        String monthBudgetTotal = "";
        double monthBudgetTotalValue;
        String budgetLeft = "";
        String budgetOver = "";
        boolean budgetIsOver;
        double budgetUsedPct;
        String budgetLevel = "none";
        String monthLabel;
        Budget[] budgets = new Budget[0];
    }

    static final class Budget {
        String name;
        String remaining;
        String over;
        boolean isOver;
        double usedPct;
        String level;
    }

    static Model loadModel(Context ctx) {
        Model m = new Model();
        m.signedIn = WidgetStore.getToken(ctx) != null;
        m.monthLabel = new SimpleDateFormat("MMMM", Locale.ENGLISH).format(new Date());
        if (!m.signedIn) return m;

        String json = WidgetStore.getSummaryJson(ctx);
        if (json == null) return m;
        try {
            JSONObject s = new JSONObject(json);
            JSONObject d = s.optJSONObject("display");
            if (d == null) d = new JSONObject();
            m.today = d.optString("today_spent", DASH);
            m.monthSpent = d.optString("month_spent", DASH);
            m.monthBudgetTotal = d.optString("month_budget_total", "");
            m.monthBudgetTotalValue = s.optDouble("month_budget_total", 0);
            m.budgetLeft = d.optString("budget_left", "");
            m.budgetOver = d.optString("budget_over", "");
            m.budgetIsOver = s.optDouble("budget_over", 0) > 0;
            m.budgetUsedPct = s.optDouble("budget_used_pct", 0);
            m.budgetLevel = s.optString("budget_level", "none");
            String label = s.optString("month_label", "");
            if (!label.isEmpty()) m.monthLabel = label;

            JSONArray arr = s.optJSONArray("budgets");
            int n = arr == null ? 0 : Math.min(arr.length(), 3);
            m.budgets = new Budget[n];
            for (int i = 0; i < n; i++) {
                JSONObject b = arr.getJSONObject(i);
                JSONObject bd = b.optJSONObject("display");
                if (bd == null) bd = new JSONObject();
                Budget out = new Budget();
                out.name = b.optString("name", "");
                out.remaining = bd.optString("remaining", "");
                out.over = bd.optString("over", "");
                out.isOver = b.optBoolean("is_over", false);
                out.usedPct = b.optDouble("used_pct", 0);
                out.level = b.optString("level", "ok");
                m.budgets[i] = out;
            }
            m.lastSuccessMs = WidgetStore.getLastSuccess(ctx);
            m.loaded = true;
        } catch (Exception e) {
            Log.w(TAG, "Cached widget summary unreadable", e);
        }
        return m;
    }

    // ── Entry points ────────────────────────────────────────────────────────

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        if (mgr == null) return;
        Model m = null;
        for (Class<?> cls : WidgetRefresh.PROVIDERS) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, cls));
            if (ids == null || ids.length == 0) continue;
            if (m == null) m = loadModel(ctx);
            update(ctx, mgr, cls, ids, m);
        }
    }

    static void update(Context ctx, AppWidgetManager mgr, Class<?> provider, int[] ids) {
        if (ids == null || ids.length == 0) return;
        update(ctx, mgr, provider, ids, loadModel(ctx));
    }

    private static void update(Context ctx, AppWidgetManager mgr, Class<?> provider, int[] ids, Model m) {
        RemoteViews views;
        if (provider == FinTrackSmallWidget.class) views = buildSmall(ctx, m);
        else if (provider == FinTrackWideWidget.class) views = buildWide(ctx, m);
        else views = buildQuickAdd(ctx, m);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    // ── A) Small 2x2 ────────────────────────────────────────────────────────

    private static RemoteViews buildSmall(Context ctx, Model m) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_small);
        v.setOnClickPendingIntent(R.id.widget_root, openScreen(ctx, "dashboard", RC_DASHBOARD));
        v.setOnClickPendingIntent(R.id.widget_plus, quickAdd(ctx));
        showSignedOut(v, !m.signedIn);
        if (!m.signedIn) return v;

        v.setTextViewText(R.id.widget_today_amount, m.today);
        if (!m.loaded) {
            v.setTextViewText(R.id.widget_budget_label, ctx.getString(R.string.widget_budget_left));
            v.setTextViewText(R.id.widget_budget_amount, DASH);
            setBar(v, R.id.widget_bar_ok, R.id.widget_bar_warn, R.id.widget_bar_over, "ok", 0);
            v.setTextViewText(R.id.widget_stamp, ctx.getString(R.string.widget_updating));
            return v;
        }

        if (m.monthBudgetTotalValue > 0) {
            v.setTextViewText(R.id.widget_budget_label, ctx.getString(
                m.budgetIsOver ? R.string.widget_budget_over : R.string.widget_budget_left));
            v.setTextViewText(R.id.widget_budget_amount, m.budgetIsOver ? m.budgetOver : m.budgetLeft);
            v.setTextColor(R.id.widget_budget_amount, color(ctx,
                m.budgetIsOver ? R.color.widget_over : R.color.widget_text));
            v.setViewVisibility(R.id.widget_bar, View.VISIBLE);
            setBar(v, R.id.widget_bar_ok, R.id.widget_bar_warn, R.id.widget_bar_over,
                m.budgetLevel, WidgetTime.barPercent(m.budgetUsedPct));
        } else {
            v.setTextViewText(R.id.widget_budget_label, ctx.getString(R.string.widget_no_budget));
            v.setTextViewText(R.id.widget_budget_amount, "");
            v.setViewVisibility(R.id.widget_bar, View.INVISIBLE);
        }
        v.setTextViewText(R.id.widget_stamp,
            WidgetTime.stamp(m.lastSuccessMs, System.currentTimeMillis(), TimeZone.getDefault()));
        return v;
    }

    // ── B) Wide 4x2 ─────────────────────────────────────────────────────────

    private static final int[][] ROWS = {
        { R.id.widget_row_1, R.id.widget_row_1_name, R.id.widget_row_1_amount,
          R.id.widget_row_1_bar_ok, R.id.widget_row_1_bar_warn, R.id.widget_row_1_bar_over },
        { R.id.widget_row_2, R.id.widget_row_2_name, R.id.widget_row_2_amount,
          R.id.widget_row_2_bar_ok, R.id.widget_row_2_bar_warn, R.id.widget_row_2_bar_over },
        { R.id.widget_row_3, R.id.widget_row_3_name, R.id.widget_row_3_amount,
          R.id.widget_row_3_bar_ok, R.id.widget_row_3_bar_warn, R.id.widget_row_3_bar_over },
    };

    private static RemoteViews buildWide(Context ctx, Model m) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_wide);
        v.setTextViewText(R.id.widget_header, "FinTrack · " + m.monthLabel);
        v.setOnClickPendingIntent(R.id.widget_root, openScreen(ctx, "dashboard", RC_DASHBOARD));
        v.setOnClickPendingIntent(R.id.widget_plus, quickAdd(ctx));
        showSignedOut(v, !m.signedIn);
        if (!m.signedIn) {
            v.setViewVisibility(R.id.widget_footer, View.INVISIBLE);
            return v;
        }

        v.setViewVisibility(R.id.widget_footer, View.VISIBLE);
        v.setOnClickPendingIntent(R.id.widget_footer, refresh(ctx));
        String footer = m.loaded
            ? WidgetTime.updatedLabel(m.lastSuccessMs, System.currentTimeMillis(), TimeZone.getDefault())
            : ctx.getString(R.string.widget_updating);
        v.setTextViewText(R.id.widget_footer, footer + " · " + ctx.getString(R.string.widget_tap_to_refresh));

        v.setTextViewText(R.id.widget_today_amount, m.today);
        v.setTextViewText(R.id.widget_month_amount, m.monthSpent);
        v.setTextViewText(R.id.widget_month_of, m.monthBudgetTotalValue > 0
            ? "of " + m.monthBudgetTotal
            : (m.loaded ? ctx.getString(R.string.widget_no_budget) : ""));

        PendingIntent budgets = openScreen(ctx, "budgets", RC_BUDGETS);
        for (int i = 0; i < ROWS.length; i++) {
            int[] r = ROWS[i];
            if (i >= m.budgets.length) {
                v.setViewVisibility(r[0], View.GONE);
                continue;
            }
            Budget b = m.budgets[i];
            v.setViewVisibility(r[0], View.VISIBLE);
            v.setOnClickPendingIntent(r[0], budgets);
            v.setTextViewText(r[1], b.name);
            v.setTextViewText(r[2], b.isOver ? b.over + " over" : b.remaining + " left");
            v.setTextColor(r[2], color(ctx, b.isOver ? R.color.widget_over : R.color.widget_label));
            setBar(v, r[3], r[4], r[5], b.level, WidgetTime.barPercent(b.usedPct));
        }
        v.setViewVisibility(R.id.widget_no_budgets,
            m.loaded && m.budgets.length == 0 ? View.VISIBLE : View.GONE);
        if (m.loaded && m.budgets.length == 0) {
            v.setOnClickPendingIntent(R.id.widget_no_budgets, budgets);
        }
        return v;
    }

    // ── C) Quick-add bar 4x1 ────────────────────────────────────────────────

    private static RemoteViews buildQuickAdd(Context ctx, Model m) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_quick_add);
        v.setOnClickPendingIntent(R.id.widget_root, openScreen(ctx, "dashboard", RC_DASHBOARD));
        v.setOnClickPendingIntent(R.id.widget_plus, quickAdd(ctx));
        v.setTextViewText(R.id.widget_subtitle, ctx.getString(
            m.signedIn ? R.string.widget_quick_add_hint : R.string.widget_signed_out));
        v.setViewVisibility(R.id.widget_today_col, m.signedIn ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.widget_today_amount, m.today);
        return v;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static void showSignedOut(RemoteViews v, boolean signedOut) {
        v.setViewVisibility(R.id.widget_signed_out, signedOut ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.widget_content, signedOut ? View.GONE : View.VISIBLE);
    }

    /** One ProgressBar per colour (RemoteViews can't tint a bar before API 31). */
    private static void setBar(RemoteViews v, int okId, int warnId, int overId, String level, int pct) {
        int shown = "over".equals(level) ? overId : "warn".equals(level) ? warnId : okId;
        for (int id : new int[] { okId, warnId, overId }) {
            v.setViewVisibility(id, id == shown ? View.VISIBLE : View.GONE);
        }
        v.setProgressBar(shown, 100, pct, false);
    }

    private static int color(Context ctx, int res) {
        return ctx.getResources().getColor(res, null);
    }

    private static PendingIntent activity(Context ctx, Intent intent, int requestCode) {
        intent.setClass(ctx, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // Distinct actions keep these PendingIntents from collapsing into one
    // (Intent equality ignores extras).
    private static PendingIntent quickAdd(Context ctx) {
        Intent i = new Intent("app.fintrack.ai.widget.QUICK_ADD");
        i.putExtra(EXTRA_OPEN_QUICK_ADD, true);
        return activity(ctx, i, RC_QUICK_ADD);
    }

    private static PendingIntent openScreen(Context ctx, String screen, int requestCode) {
        Intent i = new Intent("app.fintrack.ai.widget.OPEN_" + screen.toUpperCase(Locale.ROOT));
        i.putExtra(EXTRA_OPEN_SCREEN, screen);
        return activity(ctx, i, requestCode);
    }

    private static PendingIntent refresh(Context ctx) {
        Intent i = new Intent(ctx, FinTrackWideWidget.class);
        i.setAction(FinTrackWideWidget.ACTION_REFRESH);
        return PendingIntent.getBroadcast(ctx, RC_REFRESH, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
