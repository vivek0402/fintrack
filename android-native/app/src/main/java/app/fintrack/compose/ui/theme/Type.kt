package app.fintrack.compose.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * TODO (Phase 0 follow-up, before shipping Phase 1): wire the real fonts.
 *
 * - DM Mono is OFL-licensed (Google Fonts) — safe to bundle directly as
 *   res/font/dm_mono_*.ttf, or wire via the Compose downloadable-fonts API
 *   (androidx.compose.ui.text.googlefonts.GoogleFont) once the standard
 *   Google Play Services font-certificate array resource is added. Not done
 *   here because it requires either a binary font file or a long
 *   certificate-hash resource neither of which should be guessed at.
 * - Cabinet Grotesk / Satoshi are Fontshare-exclusive, NOT on Google Fonts.
 *   DESIGN.md's "Font licensing" risk note (see plan) flagged that Fontshare's
 *   embed-in-app license needs verifying before bundling these — do that
 *   before replacing the placeholders below.
 *
 * Until then, these fall back to system font families in the same category
 * (monospace / sans-serif) so every screen still reads from this single
 * file rather than hardcoding a font name inline — exactly per DESIGN.md's
 * "always use the font tokens, never hardcode font names" rule.
 */
object FinTrackFonts {
    val display: FontFamily = FontFamily.SansSerif   // → Cabinet Grotesk, pending license check
    val body: FontFamily = FontFamily.SansSerif       // → Satoshi, pending license check
    val mono: FontFamily = FontFamily.Monospace       // → DM Mono, pending font-file wiring
}

/** Mirrors DESIGN.md's type scale. Hero/display numbers always use [FinTrackFonts.mono]. */
object FinTrackTextStyles {
    val xs = TextStyle(fontFamily = FinTrackFonts.body, fontSize = 11.sp, lineHeight = 15.sp)
    val sm = TextStyle(fontFamily = FinTrackFonts.body, fontSize = 12.sp, lineHeight = 18.sp)
    val base = TextStyle(fontFamily = FinTrackFonts.body, fontSize = 14.sp, lineHeight = 22.sp)
    val md = TextStyle(fontFamily = FinTrackFonts.body, fontSize = 15.sp, lineHeight = 25.sp)
    val lg = TextStyle(fontFamily = FinTrackFonts.display, fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold)
    val xl = TextStyle(fontFamily = FinTrackFonts.display, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold)
    val xxl = TextStyle(fontFamily = FinTrackFonts.display, fontSize = 40.sp, lineHeight = 44.sp, fontWeight = FontWeight.ExtraBold)
    val hero = TextStyle(fontFamily = FinTrackFonts.mono, fontSize = 52.sp, lineHeight = 52.sp, fontWeight = FontWeight.Medium)
}

val FinTrackTypography = Typography(
    displayLarge = FinTrackTextStyles.hero,
    headlineLarge = FinTrackTextStyles.xxl,
    headlineMedium = FinTrackTextStyles.xl,
    headlineSmall = FinTrackTextStyles.lg,
    bodyLarge = FinTrackTextStyles.md,
    bodyMedium = FinTrackTextStyles.base,
    bodySmall = FinTrackTextStyles.sm,
    labelSmall = FinTrackTextStyles.xs,
)
