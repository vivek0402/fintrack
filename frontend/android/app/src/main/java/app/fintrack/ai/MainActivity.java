package app.fintrack.ai;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FinTrackNativePlugin.class);
        applyHideInRecents(this);
        super.onCreate(savedInstanceState);

        // Cold start from a widget: redirect the WebView directly to the
        // target page BEFORE React loads, so the user never sees the home
        // dashboard. Works because we're still on the same origin and
        // Capacitor injects its bridge scripts on any page from that domain.
        if (savedInstanceState == null) {
            String targetPath = extractTargetPath(getIntent());
            if (targetPath != null) {
                WebView wv = getBridge().getWebView();
                if (wv != null) {
                    String base = appBaseUrl(getBridge());
                    wv.post(() -> wv.loadUrl(base + targetPath));
                }
                // launchMode="singleTask" means Android can persist this exact
                // Intent as the task's identity and redeliver it to a future
                // onCreate after the process is killed and the task is
                // restored (e.g. backgrounded, reaped for memory, reopened
                // later) — getIntent() would keep returning OPEN_ADD=true
                // forever, reopening Add Transaction on every subsequent cold
                // start regardless of what the user actually tapped. Clear the
                // one-time extras once consumed so a future onCreate reading
                // this same persisted Intent sees a plain launch.
                consumeOneTimeExtras(getIntent());
            }
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // App already running — WebView and bridge are ready, fire immediately.
        String event = extractEvent(intent);
        if (event != null) {
            evalOnBridge("window.dispatchEvent(new CustomEvent('" + event + "'))");
            // setIntent(intent) just made this the Activity's persisted Intent
            // going forward, so it needs the same one-time-extra cleanup as
            // the onCreate path above, for the same reason.
            consumeOneTimeExtras(intent);
        }
    }

    // App lock's "Hide in recent apps": FLAG_SECURE from the very first frame
    // of a cold start, before the WebView (and so the JS that owns the
    // setting) even exists. FinTrackNativePlugin.setSecureFlag keeps the
    // stored value in step whenever the user changes it; logout clears it.
    // QuickAddActivity (the widgets' add sheet) applies it too.
    static void applyHideInRecents(Activity activity) {
        boolean hide = activity.getSharedPreferences(FinTrackNativePlugin.LOCK_PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(FinTrackNativePlugin.KEY_HIDE_RECENTS, false);
        if (!hide) return;
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.setRecentsScreenshotEnabled(false);
        }
    }

    // Strips the one-time navigation extras after they've been acted on, so
    // launchMode="singleTask" can't replay the same "open Add Transaction" /
    // "open a screen" action on a later, unrelated app launch.
    private void consumeOneTimeExtras(Intent intent) {
        if (intent == null) return;
        intent.removeExtra("OPEN_ADD");
        intent.removeExtra("OPEN_QUICK_ADD");
        intent.removeExtra("OPEN_SCREEN");
    }

    // The origin the WebView is serving (capacitor.config.ts server.url, which
    // CAP_SERVER_URL can point at a local build), so a cold-start deep link
    // stays on the same site. Falls back to the prod URL baked into the build.
    static String appBaseUrl(Bridge bridge) {
        String url = bridge != null ? bridge.getServerUrl() : null;
        if (url == null || url.isEmpty()) url = BuildConfig.APP_URL;
        return url.replaceAll("/+$", "");
    }

    // The widgets' "+" now opens QuickAddActivity (the Add Transaction form
    // over the home screen). OPEN_ADD is also its fallback when that sheet
    // can't load. OPEN_QUICK_ADD (the natural-language quick-add sheet) still
    // works for any launcher that kept a PendingIntent from older widgets.
    private String extractTargetPath(Intent intent) {
        if (intent == null) return null;
        if (intent.getBooleanExtra("OPEN_QUICK_ADD", false)) return "/transactions?quickAdd=1";
        if (intent.getBooleanExtra("OPEN_ADD", false)) return "/transactions?add=true";
        String screen = intent.getStringExtra("OPEN_SCREEN");
        if ("budgets".equals(screen)) return "/budgets";
        if ("dashboard".equals(screen)) return "/dashboard";
        return null;
    }

    private String extractEvent(Intent intent) {
        if (intent == null) return null;
        if (intent.getBooleanExtra("OPEN_QUICK_ADD", false)) return "fintrack:openQuickAdd";
        if (intent.getBooleanExtra("OPEN_ADD", false)) return "fintrack:openAdd";
        String screen = intent.getStringExtra("OPEN_SCREEN");
        if ("budgets".equals(screen)) return "fintrack:openBudgets";
        if ("dashboard".equals(screen)) return "fintrack:openDashboard";
        return null;
    }

    private void evalOnBridge(String js) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(js, null)
            );
        }
    }
}
