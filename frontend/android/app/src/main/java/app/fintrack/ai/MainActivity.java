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
        }
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
