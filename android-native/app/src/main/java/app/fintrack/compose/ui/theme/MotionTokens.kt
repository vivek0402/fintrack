package app.fintrack.compose.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing

/**
 * Mirrors DESIGN.md's Motion section. CubicBezierEasing's 4 control points are
 * defined identically to CSS's cubic-bezier(), so these are exact translations,
 * not approximations.
 */
object FinTrackEasing {
    /** fast start, smooth settle — entrances */
    val enter: Easing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)

    /** quick exit */
    val exit: Easing = CubicBezierEasing(0.4f, 0f, 1f, 1f)

    /** balanced move */
    val move: Easing = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
}

/** Duration buckets in ms, per DESIGN.md. */
object FinTrackDuration {
    const val MICRO = 75      // hover states, focus rings (50-100ms)
    const val SHORT = 200     // button presses, toggles (150-250ms)
    const val MEDIUM = 320    // panel transitions, modal open (250-400ms)
    const val LONG = 550      // chart mount animations, page transitions (400-700ms)
}
