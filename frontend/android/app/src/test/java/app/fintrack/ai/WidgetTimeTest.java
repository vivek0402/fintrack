package app.fintrack.ai;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.TimeZone;

import org.junit.Test;

public class WidgetTimeTest {

    private static final long MIN = 60_000L;
    private static final long HOUR = 60 * MIN;
    private static final TimeZone IST = TimeZone.getTimeZone("Asia/Kolkata");
    // 2026-09-27 04:02:00 UTC = 9:32 am IST
    private static final long AT_0932_IST = 1790481720000L;

    @Test
    public void freshUntilTwoHours() {
        assertFalse(WidgetTime.isStale(AT_0932_IST, AT_0932_IST + 2 * HOUR));
        assertTrue(WidgetTime.isStale(AT_0932_IST, AT_0932_IST + 2 * HOUR + 1));
    }

    @Test
    public void neverLoadedIsStale() {
        assertTrue(WidgetTime.isStale(0, AT_0932_IST));
        assertEquals("", WidgetTime.stamp(0, AT_0932_IST, IST));
        assertEquals("Not updated yet", WidgetTime.updatedLabel(0, AT_0932_IST, IST));
    }

    @Test
    public void relativeAgo() {
        assertEquals("just now", WidgetTime.relativeAgo(AT_0932_IST, AT_0932_IST + 30_000));
        assertEquals("5m ago", WidgetTime.relativeAgo(AT_0932_IST, AT_0932_IST + 5 * MIN));
        assertEquals("3h ago", WidgetTime.relativeAgo(AT_0932_IST, AT_0932_IST + 3 * HOUR + 20 * MIN));
        assertEquals("2d ago", WidgetTime.relativeAgo(AT_0932_IST, AT_0932_IST + 49 * HOUR));
        // Clock moved backwards: never "-5m ago".
        assertEquals("just now", WidgetTime.relativeAgo(AT_0932_IST, AT_0932_IST - 5 * MIN));
    }

    @Test
    public void clockTimeIsLowercase12Hour() {
        assertEquals("9:32 am", WidgetTime.clockTime(AT_0932_IST, IST));
        assertEquals("9:32 pm", WidgetTime.clockTime(AT_0932_IST + 12 * HOUR, IST));
    }

    @Test
    public void stampSwitchesToRelativeWhenStale() {
        assertEquals("9:32 am", WidgetTime.stamp(AT_0932_IST, AT_0932_IST + HOUR, IST));
        assertEquals("Updated 9:32 am", WidgetTime.updatedLabel(AT_0932_IST, AT_0932_IST + HOUR, IST));
        assertEquals("3h ago", WidgetTime.stamp(AT_0932_IST, AT_0932_IST + 3 * HOUR, IST));
        assertEquals("Updated 3h ago", WidgetTime.updatedLabel(AT_0932_IST, AT_0932_IST + 3 * HOUR, IST));
    }

    @Test
    public void barPercentClamps() {
        assertEquals(0, WidgetTime.barPercent(0));
        assertEquals(0, WidgetTime.barPercent(-5));
        assertEquals(0, WidgetTime.barPercent(Double.NaN));
        assertEquals(1, WidgetTime.barPercent(0.2));
        assertEquals(42, WidgetTime.barPercent(42.4));
        assertEquals(100, WidgetTime.barPercent(180));
    }
}
