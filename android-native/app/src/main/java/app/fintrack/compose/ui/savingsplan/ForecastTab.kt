package app.fintrack.compose.ui.savingsplan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.ForecastCalendarDataDto
import app.fintrack.compose.data.api.ForecastCategoryDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.LocalDate

private val WEEKDAY_HEADERS = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

@Composable
fun ForecastTab(viewModel: ForecastViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) {
        if (!state.isGenerated) viewModel.generate()
    }

    LazyColumn(contentPadding = PaddingValues(FinTrackSpacing.space4)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Spending Forecast", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Projected month-end spend based on your pace", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (state.isGenerated && !state.isLoading) {
                    TextButton(onClick = { viewModel.generate(force = true) }) { Text("Regenerate") }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))
        }

        when {
            state.isLoading -> item {
                Box(Modifier.fillMaxWidth().padding(FinTrackSpacing.space6), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text("Generating your forecast…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            state.error != null -> item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6)) {
                    Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = FinTrackSpacing.space3))
                    OutlinedButton(onClick = { viewModel.generate() }) { Text("Try again") }
                }
            }
            !state.isGenerated -> item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6)) {
                    Button(onClick = { viewModel.generate() }) { Text("Generate Forecast") }
                }
            }
            state.data?.insufficientData == true -> item {
                Text(
                    "We need at least 7 days of transaction history to forecast your spending. Keep logging transactions and check back soon.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(FinTrackSpacing.space4),
                )
            }
            state.data != null -> {
                val data = state.data!!
                item { ForecastStatTiles(data) }
                item {
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                    ForecastCalendarGrid(data)
                    Spacer(Modifier.height(FinTrackSpacing.space4))
                }
                if (data.categories.isNotEmpty()) {
                    item {
                        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
                                Text("Category Breakdown", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(FinTrackSpacing.space3))
                                data.categories.forEach { cat -> ForecastCategoryRow(cat) }
                            }
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space4))
                    }
                }
                if (data.insight.isNotBlank()) {
                    item {
                        Surface(shape = RoundedCornerShape(16.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.08f), modifier = Modifier.fillMaxWidth()) {
                            Text(data.insight, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(FinTrackSpacing.space4))
                        }
                        Spacer(Modifier.height(FinTrackSpacing.space4))
                    }
                }
            }
        }
    }
}

@Composable
private fun ForecastStatTiles(data: ForecastCalendarDataDto) {
    Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2), modifier = Modifier.fillMaxWidth()) {
        ForecastStatTile("Forecasted Total", formatInr(data.totalForecast), FinTrackColors.Dark.accent, Modifier.weight(1f))
        ForecastStatTile("Spent So Far", formatInr(data.currentMonthSpent), FinTrackColors.Dark.colorExp, Modifier.weight(1f))
        ForecastStatTile("Daily Average", formatInr(data.avgDaily), FinTrackColors.Dark.colorWarn, Modifier.weight(1f))
    }
}

@Composable
private fun ForecastStatTile(label: String, value: String, color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Surface(shape = RoundedCornerShape(12.dp), color = color.copy(alpha = 0.10f), modifier = modifier) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space3)) {
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
private fun ForecastCalendarGrid(data: ForecastCalendarDataDto) {
    val today = LocalDate.now()
    val firstOfMonth = today.withDayOfMonth(1)
    val leadingBlanks = firstOfMonth.dayOfWeek.value % 7 // Mon=1..Sun=7 -> Sun=0 offset to match Sun-first header
    val byDay = data.calendarDays.associateBy { it.day }

    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Text("This Month", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                WEEKDAY_HEADERS.forEach { d ->
                    Text(d, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            LazyVerticalGrid(
                columns = GridCells.Fixed(7),
                modifier = Modifier.fillMaxWidth().height(((leadingBlanks + data.daysInMonth + 6) / 7 * 52).dp),
                userScrollEnabled = false,
            ) {
                items(leadingBlanks) { Box(Modifier.aspectRatio(1f)) }
                items(data.daysInMonth) { index ->
                    val day = index + 1
                    val cell = byDay[day]
                    CalendarDayCell(day, cell)
                }
            }
        }
    }
}

@Composable
private fun CalendarDayCell(day: Int, cell: app.fintrack.compose.data.api.ForecastCalendarDayDto?) {
    val isToday = cell?.isToday == true
    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .padding(2.dp),
        contentAlignment = Alignment.TopStart,
    ) {
        Surface(
            shape = RoundedCornerShape(6.dp),
            color = if (isToday) FinTrackColors.Dark.accent.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(modifier = Modifier.padding(3.dp)) {
                Text(
                    "$day",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (cell?.isFuture == true) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f) else MaterialTheme.colorScheme.onSurface,
                )
                val amount = cell?.actual ?: cell?.projected
                if (amount != null && amount > 0) {
                    Text(
                        formatInr(amount),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (cell?.isFuture == true) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f) else FinTrackColors.Dark.colorExp,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun ForecastCategoryRow(cat: ForecastCategoryDto) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space2)) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(cat.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            // Mirrors the backend's actual response field (`avgMonthly`) — web's UI references a `cat.projected`
            // field the backend never sends, a latent bug; using the real field instead of reproducing it.
            Text(formatInr(cat.avgMonthly), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(FinTrackSpacing.space1))
        LinearProgressIndicator(
            progress = { (cat.percentOfTotal / 100f).coerceIn(0f, 1f) },
            color = runCatching { androidx.compose.ui.graphics.Color(android.graphics.Color.parseColor(cat.color)) }.getOrDefault(FinTrackColors.Dark.accent),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(FinTrackSpacing.space1))
        Text("${formatInr(cat.spentSoFar)} spent so far this month", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
