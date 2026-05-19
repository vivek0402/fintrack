package app.fintrack.ai;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private String pendingEvent = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FinTrackNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Store intent action — do NOT evalOnBridge here, WebView isn't ready
        pendingEvent = extractEvent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        if (pendingEvent != null) {
            final String event = pendingEvent;
            pendingEvent = null;
            // Set a global before the event so CapacitorBridge can pick it up even if
        // React hasn't registered the listener yet (slow device / hydration lag).
        // 600ms delay gives the WebView time to finish loading on cold start.
            getBridge().getWebView().postDelayed(
                () -> evalOnBridge(
                    "window.__fintrackPending='" + event + "';" +
                    "window.dispatchEvent(new CustomEvent('" + event + "'))"),
                600
            );
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // App is already running — WebView is loaded, fire immediately
        String event = extractEvent(intent);
        if (event != null) evalOnBridge(
            "window.__fintrackPending='" + event + "';" +
            "window.dispatchEvent(new CustomEvent('" + event + "'))");
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
