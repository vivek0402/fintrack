package app.fintrack.ai;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Pure time/staleness helpers for the home-screen widgets. No Android
 * dependencies, so it's covered by plain JVM unit tests (WidgetTimeTest).
 */
final class WidgetTime {

    /** After this long without a successful refresh, show "3h ago" instead of a clock time. */
    static final long STALE_AFTER_MS = 2L * 60 * 60 * 1000;

    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;
    private static final long DAY = 24 * HOUR;

    private WidgetTime() {}

    /** True when there has never been a success, or the last one is more than 2h old. */
    static boolean isStale(long lastSuccessMs, long nowMs) {
        return lastSuccessMs <= 0 || nowMs - lastSuccessMs > STALE_AFTER_MS;
    }

    /** "just now", "5m ago", "3h ago", "2d ago". A clock set backwards counts as "just now". */
    static String relativeAgo(long thenMs, long nowMs) {
        long delta = Math.max(0, nowMs - thenMs);
        if (delta < MINUTE) return "just now";
        if (delta < HOUR) return (delta / MINUTE) + "m ago";
        if (delta < DAY) return (delta / HOUR) + "h ago";
        return (delta / DAY) + "d ago";
    }

    /** "9:32 am" in the given zone. */
    static String clockTime(long ms, TimeZone zone) {
        SimpleDateFormat fmt = new SimpleDateFormat("h:mm a", Locale.ENGLISH);
        fmt.setTimeZone(zone);
        return fmt.format(new Date(ms)).toLowerCase(Locale.ENGLISH);
    }

    /**
     * The widget's timestamp: the clock time of the last successful update
     * while it's fresh ("9:32 am"), or how old it is once stale ("3h ago").
     * Empty when nothing has ever loaded.
     */
    static String stamp(long lastSuccessMs, long nowMs, TimeZone zone) {
        if (lastSuccessMs <= 0) return "";
        return isStale(lastSuccessMs, nowMs)
            ? relativeAgo(lastSuccessMs, nowMs)
            : clockTime(lastSuccessMs, zone);
    }

    /** "Updated 9:32 am" / "Updated 3h ago" / "Not updated yet". */
    static String updatedLabel(long lastSuccessMs, long nowMs, TimeZone zone) {
        if (lastSuccessMs <= 0) return "Not updated yet";
        return "Updated " + stamp(lastSuccessMs, nowMs, zone);
    }

    /** 0..100 for a ProgressBar; NaN and negatives become 0, overruns cap at 100. */
    static int barPercent(double usedPct) {
        if (Double.isNaN(usedPct) || usedPct <= 0) return 0;
        if (usedPct >= 100) return 100;
        // Anything spent shows at least a sliver.
        return Math.max(1, (int) Math.round(usedPct));
    }
}
