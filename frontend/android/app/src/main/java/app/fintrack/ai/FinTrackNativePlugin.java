package app.fintrack.ai;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "FinTrackNative")
public class FinTrackNativePlugin extends Plugin {

    static final String PREFS_NAME = "fintrack_widget";
    static final String KEY_JWT = "jwt";

    @PluginMethod
    public void saveToken(PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.reject("token is required");
            return;
        }
        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JWT, token)
            .apply();

        // Re-render immediately so the widget drops "Sign in to FinTrack"
        // right away (shows empty data until the fetch completes).
        BudgetWidget.triggerUpdate(getContext());
        // Kick off a background fetch so real data appears shortly after.
        BudgetWidget.triggerImmediateFetch(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_JWT)
            .remove("budgets_json")
            .remove("summary_json")
            .remove("last_updated")
            .apply();

        // Trigger widget update to show "Sign in" state
        BudgetWidget.triggerUpdate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void updateWidget(PluginCall call) {
        try {
            JSONObject data = new JSONObject();
            data.put("spent_today",       call.getDouble("spent_today", 0.0));
            data.put("budget_remaining",  call.getDouble("budget_remaining", 0.0));
            data.put("currency",          call.getString("currency") != null ? call.getString("currency") : "INR");
            data.put("month_spent",       call.getDouble("month_spent", 0.0));
            data.put("month_budget",      call.getDouble("month_budget", 0.0));

            getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("fintrack_widget_data", data.toString())
                .apply();

            FinanceWidget.triggerUpdate(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to update widget: " + e.getMessage());
        }
    }
}
