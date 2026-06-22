package app.fintrack.compose.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Transcribed verbatim from DESIGN.md's CSS variable tables. Never hardcode a
 * color literal outside this file — every screen reads from [FinTrackColors]
 * via the theme (see Theme.kt), mirroring the web app's "no hardcoded hex"
 * anti-pattern rule.
 */
object FinTrackColors {

    // ---- Dark theme (default, AMOLED) ----
    object Dark {
        val bgBase = Color(0xFF0A0A0A)
        val bgSurface1 = Color(0xFF111111)
        val bgSurface2 = Color(0xFF1A1A1A)
        val bgSurface3 = Color(0xFF222222)

        val borderSubtle = Color(0x0FFFFFFF)   // rgba(255,255,255,0.06)
        val borderVisible = Color(0x1FFFFFFF)  // rgba(255,255,255,0.12)

        val textPrimary = Color(0xFFF5F5F5)
        val textSecondary = Color(0xFFA0A0A0)
        val textMuted = Color(0xFF808080)
        val textInverse = Color(0xFF0A0A0A)

        val colorInc = Color(0xFF16A34A)
        val colorIncSubtle = Color(0x1F16A34A)
        val colorExp = Color(0xFFDC2626)
        val colorExpSubtle = Color(0x1FDC2626)
        val colorWarn = Color(0xFFD97706)
        val colorWarnSubtle = Color(0x1FD97706)
        val accent = Color(0xFF2563EB)
        val accentSubtle = Color(0x1F2563EB)
        val accentBorder = Color(0x402563EB)
        val colorInfo = Color(0xFF0891B2)
        val colorInfoSubtle = Color(0x1F0891B2)
    }

    // ---- Light theme ----
    object Light {
        val bgBase = Color(0xFFF8F8F8)
        val bgSurface1 = Color(0xFFFFFFFF)
        val bgSurface2 = Color(0xFFF3F3F3)
        val bgSurface3 = Color(0xFFE8E8E8)

        val borderSubtle = Color(0x0F000000)
        val borderVisible = Color(0x24000000)

        val textPrimary = Color(0xFF111111)
        val textSecondary = Color(0xFF555555)
        val textMuted = Color(0xFF707070)
        val textInverse = Color(0xFFFFFFFF)

        val colorInc = Color(0xFF16A34A)
        val colorExp = Color(0xFFDC2626)
        val colorWarn = Color(0xFFD97706)
        val accent = Color(0xFF2563EB)
        val colorInfo = Color(0xFF0891B2)
    }

    // ---- Chart category palette (--cat-0..7) — same in both themes ----
    val categoryPalette = listOf(
        Color(0xFF2563EB), Color(0xFF16A34A), Color(0xFFD97706), Color(0xFFDC2626),
        Color(0xFF7C3AED), Color(0xFF0891B2), Color(0xFFDB2777), Color(0xFF65A30D),
    )
}
