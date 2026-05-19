package app.fintrack.ai;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FinTrackNativePlugin.class);
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        if (intent.getBooleanExtra("OPEN_ADD", false)) {
            evalOnBridge("window.dispatchEvent(new CustomEvent('fintrack:openAdd'))");
        }

        String screen = intent.getStringExtra("OPEN_SCREEN");
        if ("budgets".equals(screen)) {
            evalOnBridge("window.dispatchEvent(new CustomEvent('fintrack:openBudgets'))");
        }
    }

    private void evalOnBridge(String js) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(js, null)
            );
        }
    }
}
