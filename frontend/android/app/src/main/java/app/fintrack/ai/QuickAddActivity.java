package app.fintrack.ai;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;

/**
 * The widgets' "+": the manual Add Transaction form as a bottom sheet over the
 * home screen, without bringing the full app forward.
 *
 * A second Capacitor WebView on the same origin as MainActivity (so the same
 * localStorage: auth token, app-lock settings), loading /widget-add/, a page
 * that renders only TransactionModal on a transparent background. The window
 * is translucent and dims the launcher behind it; the page draws no scrim of
 * its own. Saving, cancelling, tapping the dimmed area or Back all end in
 * FinTrackNative.closeQuickAdd(), which finishes this activity.
 *
 * Manifest: its own task (taskAffinity=""), excluded from recents, and
 * finished as soon as it stops (noHistory + onStop below), so it never
 * lingers in the background and every "+" tap is a fresh sheet. The app
 * lock is waived for exactly /widget-add in this WebView (user's choice),
 * recognised by UA_MARKER; anything that leaves the sheet opens MainActivity,
 * which applies its normal lock.
 */
public class QuickAddActivity extends BridgeActivity {

    static final String SHEET_PATH = "/widget-add/";
    private static final String TAG = "FinTrackQuickAdd";
    private static final float DIM_AMOUNT = 0.6f;
    static final String UA_MARKER = "FinTrackQuickAdd/1";

    private boolean leaving = false;
    private boolean sheetShown = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FinTrackNativePlugin.class);
        MainActivity.applyHideInRecents(this);
        // PushNotificationsPlugin keeps one static Bridge to deliver pushes
        // to, and every Bridge that loads the plugin overwrites it. Keep it
        // pointing at MainActivity's (or nothing): this short-lived sheet must
        // not take pushes away from the app.
        Bridge pushBridge = PushNotificationsPlugin.staticBridge;
        super.onCreate(savedInstanceState);
        PushNotificationsPlugin.staticBridge = pushBridge;

        // Dim the launcher behind the translucent window (the theme asks for
        // it too; set here so it holds for a non-floating window as well).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        getWindow().setDimAmount(DIM_AMOUNT);

        Bridge bridge = getBridge();
        WebView wv = bridge != null ? bridge.getWebView() : null;
        if (wv == null) {
            openMainApp(true);
            return;
        }
        wv.setBackgroundColor(Color.TRANSPARENT);
        // Identifies this WebView to the web app as the add sheet's, the one
        // place the app lock is waived (lib/appLock.ts QUICK_ADD_UA_MARKER).
        // Set natively and only here: web content can't add it, and
        // MainActivity's WebView never has it.
        WebSettings settings = wv.getSettings();
        settings.setUserAgentString(settings.getUserAgentString() + " " + UA_MARKER);
        bridge.setWebViewClient(new SheetWebViewClient(bridge));
        // Same mechanism as MainActivity's widget cold start: replace the
        // initial server.url load with the sheet page before anything paints.
        String url = MainActivity.appBaseUrl(bridge) + SHEET_PATH;
        wv.post(() -> wv.loadUrl(url));
    }

    // BridgeActivity.onCreate forces the app's opaque AppTheme.NoActionBar
    // before inflating its layout. Keep the translucent theme instead, so the
    // window background stays transparent and the launcher shows through.
    @Override
    public void setTheme(int resid) {
        super.setTheme(R.style.AppTheme_QuickAdd);
    }

    @Override
    public void onStop() {
        super.onStop();
        // Belt and braces for noHistory (which Android skips while the screen
        // is going to sleep): never leave the form, or a passed lock screen,
        // sitting in the background to be resumed later.
        if (!isFinishing() && !isChangingConfigurations()) finish();
    }

    @Override
    public void finish() {
        super.finish();
        overridePendingTransition(0, android.R.anim.fade_out);
    }

    /** FinTrackNative.closeQuickAdd(): saved, cancelled, dimmed area or Back. */
    void close(boolean refreshWidgets) {
        if (leaving) return;
        leaving = true;
        // The page's own debounced refresh dies with its WebView, so ask here.
        if (refreshWidgets) WidgetRefresh.refreshNow(getApplicationContext());
        finish();
    }

    /**
     * Hand over to the full app and close the sheet: logged out, "Forgot PIN",
     * a navigation away from the sheet, or (openAdd) the sheet page failed to
     * load, e.g. an older web deploy without /widget-add/ — the full app's
     * Add Transaction form instead of a blank screen.
     */
    void openMainApp(boolean openAdd) {
        if (leaving) return;
        leaving = true;
        Intent i = new Intent(this, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (openAdd) i.putExtra("OPEN_ADD", true);
        try {
            startActivity(i);
        } catch (Exception e) {
            Logger.error(TAG, "Could not open the app", e);
        }
        finish();
    }

    private static boolean isSheetUrl(Uri uri) {
        String path = uri != null ? uri.getPath() : null;
        return path != null && (path.equals("/widget-add") || path.startsWith("/widget-add/"));
    }

    private final class SheetWebViewClient extends BridgeWebViewClient {

        SheetWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (request.isForMainFrame() && isSheetUrl(request.getUrl())) {
                Logger.warn(TAG, "Sheet failed to load (" + error.getErrorCode() + "), opening the app");
                openMainApp(true);
            }
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            super.onReceivedHttpError(view, request, response);
            if (request.isForMainFrame() && isSheetUrl(request.getUrl()) && response.getStatusCode() >= 400) {
                Logger.warn(TAG, "Sheet returned HTTP " + response.getStatusCode() + ", opening the app");
                openMainApp(true);
            }
        }

        // Anything that navigates this WebView off the sheet (a 401 sending
        // it to /login, a link) belongs in the full app, not in a transparent
        // window over the home screen. Also catches client-side route changes.
        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            super.doUpdateVisitedHistory(view, url, isReload);
            Uri uri = Uri.parse(url);
            if (isSheetUrl(uri)) {
                sheetShown = true;
            } else if (sheetShown) {
                openMainApp(false);
            }
        }
    }
}
