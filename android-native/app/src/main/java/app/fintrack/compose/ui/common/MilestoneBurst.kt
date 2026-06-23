package app.fintrack.compose.ui.common

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import app.fintrack.compose.ui.theme.FinTrackColors
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

private val BURST_COLORS = listOf(
    FinTrackColors.Dark.colorInc,
    FinTrackColors.Dark.accent,
    Color(0xFF9B7EDE),
    Color(0xFFE8B339),
    FinTrackColors.Dark.colorExp,
)

private data class BurstParticle(val angleDeg: Float, val distance: Float, val color: Color, val size: Float)

/** Brief, restrained particle burst for milestone moments (goal reached). Auto-invokes onDone after the animation. */
@Composable
fun MilestoneBurst(onDone: () -> Unit) {
    val progress = remember { Animatable(0f) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    val particles = remember {
        List(14) { i ->
            val angle = (360f / 14) * i + (Random.nextFloat() * 18f - 9f)
            BurstParticle(
                angleDeg = angle,
                distance = 64f + Random.nextFloat() * 48f,
                color = BURST_COLORS[i % BURST_COLORS.size],
                size = 5f + Random.nextFloat() * 3f,
            )
        }
    }

    LaunchedEffect(Unit) {
        progress.animateTo(1f, animationSpec = tween(durationMillis = 620, easing = LinearOutSlowInEasing))
        onDone()
    }

    Canvas(modifier = Modifier.onSizeChanged { size = it }) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val t = progress.value
        val alpha = (1f - t).coerceIn(0f, 1f)
        particles.forEach { p ->
            val rad = p.angleDeg * (Math.PI / 180.0)
            val dx = (cos(rad) * p.distance * t).toFloat()
            val dy = (sin(rad) * p.distance * t).toFloat()
            drawCircle(color = p.color.copy(alpha = alpha), radius = p.size, center = center + Offset(dx, dy))
        }
    }
}
