package app.fintrack.compose.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/** Mirrors DESIGN.md's --radius-* tokens. */
object FinTrackRadius {
    val sm = 6.dp
    val md = 10.dp
    val lg = 16.dp
    val xl = 24.dp
    val full = 999.dp // pills/avatars — clamped to half the shorter side by Compose automatically
}

val FinTrackShapes = Shapes(
    extraSmall = RoundedCornerShape(FinTrackRadius.sm),
    small = RoundedCornerShape(FinTrackRadius.md),
    medium = RoundedCornerShape(FinTrackRadius.lg),
    large = RoundedCornerShape(FinTrackRadius.xl),
    extraLarge = RoundedCornerShape(FinTrackRadius.full),
)

/** Mirrors DESIGN.md's --space-* tokens. */
object FinTrackSpacing {
    val space1 = 4.dp
    val space2 = 8.dp
    val space3 = 12.dp
    val space4 = 16.dp
    val space5 = 20.dp
    val space6 = 24.dp
    val space7 = 28.dp
    val space8 = 32.dp
    val space10 = 40.dp
    val space12 = 48.dp
    val space16 = 64.dp
}
