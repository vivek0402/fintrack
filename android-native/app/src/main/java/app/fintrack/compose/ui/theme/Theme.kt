package app.fintrack.compose.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val DarkScheme = darkColorScheme(
    background = FinTrackColors.Dark.bgBase,
    surface = FinTrackColors.Dark.bgSurface1,
    surfaceVariant = FinTrackColors.Dark.bgSurface2,
    onBackground = FinTrackColors.Dark.textPrimary,
    onSurface = FinTrackColors.Dark.textPrimary,
    onSurfaceVariant = FinTrackColors.Dark.textSecondary,
    primary = FinTrackColors.Dark.accent,
    onPrimary = FinTrackColors.Dark.textPrimary,
    primaryContainer = FinTrackColors.Dark.accentSubtle,
    error = FinTrackColors.Dark.colorExp,
    errorContainer = FinTrackColors.Dark.colorExpSubtle,
    outline = FinTrackColors.Dark.borderSubtle,
    outlineVariant = FinTrackColors.Dark.borderVisible,
)

private val LightScheme = lightColorScheme(
    background = FinTrackColors.Light.bgBase,
    surface = FinTrackColors.Light.bgSurface1,
    surfaceVariant = FinTrackColors.Light.bgSurface2,
    onBackground = FinTrackColors.Light.textPrimary,
    onSurface = FinTrackColors.Light.textPrimary,
    onSurfaceVariant = FinTrackColors.Light.textSecondary,
    primary = FinTrackColors.Light.accent,
    onPrimary = FinTrackColors.Light.textInverse,
    error = FinTrackColors.Light.colorExp,
    outline = FinTrackColors.Light.borderSubtle,
    outlineVariant = FinTrackColors.Light.borderVisible,
)

/**
 * Root theme — every screen should be wrapped in this once, at the NavHost
 * level (see MainActivity.kt), never re-applied per-screen.
 */
@Composable
fun FinTrackTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkScheme else LightScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = FinTrackTypography,
        shapes = FinTrackShapes,
        content = content,
    )
}
