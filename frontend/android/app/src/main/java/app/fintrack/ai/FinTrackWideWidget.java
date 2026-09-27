package app.fintrack.ai;

import android.content.Context;
import android.content.Intent;

/**
 * B) Wide 4x2: today + month-to-date spend and the three tightest budgets.
 * Its footer ("Updated 9:32 am · tap to refresh") triggers a refresh.
 */
public class FinTrackWideWidget extends FinTrackWidgetProvider {

    static final String ACTION_REFRESH = "app.fintrack.ai.widget.REFRESH";

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            WidgetRefresh.refreshNow(context);
        }
    }
}
