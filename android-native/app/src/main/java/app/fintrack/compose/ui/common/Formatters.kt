package app.fintrack.compose.ui.common

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToLong

private val inrGroupingFormat: NumberFormat =
    NumberFormat.getNumberInstance(Locale.Builder().setLanguage("en").setRegion("IN").build())

/** Mirrors the web app's fmt(): '₹' + Math.round(n).toLocaleString('en-IN'). */
fun formatInr(amount: Double): String = "₹" + inrGroupingFormat.format(amount.roundToLong())

fun formatInr(amount: String?): String = formatInr(amount?.toDoubleOrNull() ?: 0.0)
