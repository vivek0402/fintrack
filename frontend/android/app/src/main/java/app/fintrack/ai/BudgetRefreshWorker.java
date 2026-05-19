package app.fintrack.ai;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Calendar;

public class BudgetRefreshWorker extends Worker {

    private static final String PREFS_NAME = "fintrack_widget";

    public BudgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        String jwt = prefs.getString("jwt", null);
        if (jwt == null) return Result.success(); // Not logged in

        Calendar cal = Calendar.getInstance();
        int month = cal.get(Calendar.MONTH) + 1;
        int year = cal.get(Calendar.YEAR);
        String base = BuildConfig.API_BASE_URL;

        try {
            String budgetsJson = fetchJson(base + "api/budgets?month=" + month + "&year=" + year, jwt, prefs);
            String summaryJson = fetchJson(base + "api/analytics/summary?month=" + month + "&year=" + year, jwt, prefs);

            if (budgetsJson != null && summaryJson != null) {
                prefs.edit()
                    .putString("budgets_json", budgetsJson)
                    .putString("summary_json", summaryJson)
                    .putLong("last_updated", System.currentTimeMillis())
                    .apply();

                BudgetWidget.triggerUpdate(getApplicationContext());
            }

            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    private String fetchJson(String urlStr, String jwt, SharedPreferences prefs) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestProperty("Authorization", "Bearer " + jwt);
        conn.setRequestProperty("Accept", "application/json");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);

        int status = conn.getResponseCode();

        if (status == 401) {
            prefs.edit().remove("jwt").apply();
            return null;
        }

        if (status != 200) return null;

        StringBuilder sb = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        conn.disconnect();
        return sb.toString();
    }
}
