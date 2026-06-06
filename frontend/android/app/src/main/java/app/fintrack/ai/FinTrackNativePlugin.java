package app.fintrack.ai;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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

        call.resolve();
    }

    @PluginMethod
    public void getFCMToken(PluginCall call) {
        String token = getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString("fcm_token", null);
        JSObject ret = new JSObject();
        ret.put("token", token != null ? token : "");
        call.resolve(ret);
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

        call.resolve();
    }

}
