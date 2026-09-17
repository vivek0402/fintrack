package app.fintrack.ai;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FinTrackNativePlugin.class);
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
                    wv.post(() -> wv.loadUrl(BuildConfig.APP_URL + targetPath));
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

    // Strips the one-time navigation extras after they've been acted on, so
    // launchMode="singleTask" can't replay the same "open Add Transaction" /
    // "open a screen" action on a later, unrelated app launch.
    private void consumeOneTimeExtras(Intent intent) {
        if (intent == null) return;
        intent.removeExtra("OPEN_ADD");
        intent.removeExtra("OPEN_SCREEN");
    }

    private String extractTargetPath(Intent intent) {
        if (intent == null) return null;
        if (intent.getBooleanExtra("OPEN_ADD", false)) return "/transactions?add=true";
        String screen = intent.getStringExtra("OPEN_SCREEN");
        if ("budgets".equals(screen)) return "/budgets";
        return null;
    }

    private String extractEvent(Intent intent) {
        if (intent == null) return null;
        if (intent.getBooleanExtra("OPEN_ADD", false)) return "fintrack:openAdd";
        String screen = intent.getStringExtra("OPEN_SCREEN");
        if ("budgets".equals(screen)) return "fintrack:openBudgets";
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
