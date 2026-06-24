package app.fintrack.compose.ui.transactions

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.RecurringDto
import app.fintrack.compose.data.api.TransactionDto
import app.fintrack.compose.ui.analytics.heatmapCellColor
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

private val MONTH_DAY_LABELS = listOf("S", "M", "T", "W", "T", "F", "S")

data class CalendarDayData(
    val date: LocalDate,
    val income: Double,
    val expense: Double,
    val hasRecurringIncome: Boolean,
    val hasRecurringExpense: Boolean,
    val projectedExpense: Double,
    val transactions: List<TransactionDto>,
    val recurringDue: List<RecurringDto>,
)

private fun recurringOccursOn(item: RecurringDto, date: LocalDate): Boolean {
    if (!item.is_active) return false
    val dayOfMonth = item.day_of_month
    return when (item.frequency) {
        "daily" -> true
        "weekly" -> dayOfMonth != null && dayOfMonth == date.dayOfWeek.value % 7
        "monthly" -> dayOfMonth != null &&
            (dayOfMonth == date.dayOfMonth || (dayOfMonth > date.lengthOfMonth() && date.dayOfMonth == date.lengthOfMonth()))
        else -> runCatching { LocalDate.parse(item.next_due_date.take(10)) }.getOrNull() == date
    }
}

fun buildCalendarDays(year: Int, month: Int, transactions: List<TransactionDto>, recurring: List<RecurringDto>): List<CalendarDayData> {
    val yearMonth = YearMonth.of(year, month)
    val today = LocalDate.now()
    val isCurrentMonth = yearMonth == YearMonth.from(today)

    val txByDate = transactions.groupBy { runCatching { LocalDate.parse(it.date.take(10)) }.getOrNull() }

    val expensesSoFar = if (isCurrentMonth) {
        transactions
            .filter { it.type == "expense" }
            .mapNotNull { tx -> runCatching { LocalDate.parse(tx.date.take(10)) }.getOrNull()?.let { it to tx } }
            .filter { (date, _) -> !date.isAfter(today) }
            .sumOf { (_, tx) -> tx.amount.toDoubleOrNull() ?: 0.0 }
    } else 0.0
    val dailyRate = if (isCurrentMonth && today.dayOfMonth > 0) expensesSoFar / today.dayOfMonth else 0.0

    return (1..yearMonth.lengthOfMonth()).map { day ->
        val date = LocalDate.of(year, month, day)
        val dayTxs = txByDate[date].orEmpty()
        val dueToday = recurring.filter { recurringOccursOn(it, date) }
        CalendarDayData(
            date = date,
            income = dayTxs.filter { it.type == "income" }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 },
            expense = dayTxs.filter { it.type == "expense" }.sumOf { it.amount.toDoubleOrNull() ?: 0.0 },
            hasRecurringIncome = dueToday.any { it.type == "income" },
            hasRecurringExpense = dueToday.any { it.type == "expense" },
            projectedExpense = if (isCurrentMonth && date.isAfter(today)) dailyRate else 0.0,
            transactions = dayTxs,
            recurringDue = dueToday,
        )
    }
}

@Composable
fun TransactionsCalendarView(
    year: Int,
    month: Int,
    transactions: List<TransactionDto>,
    recurring: List<RecurringDto>,
    onPreviousMonth: () -> Unit,
    onNextMonth: () -> Unit,
) {
    val days = remember(year, month, transactions, recurring) { buildCalendarDays(year, month, transactions, recurring) }
    val maxExpense = remember(days) { days.maxOfOrNull { it.expense }?.takeIf { it > 0 } ?: 1.0 }
    val leadingBlanks = remember(year, month) { LocalDate.of(year, month, 1).dayOfWeek.value % 7 }
    var selectedDay by remember { mutableStateOf<CalendarDayData?>(null) }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space2),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onPreviousMonth) { Icon(Icons.Filled.ChevronLeft, contentDescription = "Previous month") }
            Text(
                YearMonth.of(year, month).month.getDisplayName(TextStyle.FULL, Locale.getDefault()) + " $year",
                style = MaterialTheme.typography.titleMedium,
            )
            IconButton(onClick = onNextMonth) { Icon(Icons.Filled.ChevronRight, contentDescription = "Next month") }
        }

        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space4)) {
            MONTH_DAY_LABELS.forEach { label ->
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Spacer(Modifier.height(FinTrackSpacing.space2))

        LazyVerticalGrid(
            columns = GridCells.Fixed(7),
            modifier = Modifier.fillMaxWidth().padding(horizontal = FinTrackSpacing.space3),
        ) {
            items(leadingBlanks) { Box(Modifier.aspectRatio(1f)) }
            items(days) { day ->
                CalendarDayCell(day = day, maxExpense = maxExpense, onClick = { selectedDay = day })
            }
        }
    }

    selectedDay?.let { day ->
        DayDetailSheet(day = day, onDismiss = { selectedDay = null })
    }
}

@Composable
private fun CalendarDayCell(day: CalendarDayData, maxExpense: Double, onClick: () -> Unit) {
    val surfaceColor = MaterialTheme.colorScheme.surfaceVariant
    val expColor = FinTrackColors.Dark.colorExp
    val cellColor = heatmapCellColor(day.expense, maxExpense, surfaceColor, expColor)
    val isToday = day.date == LocalDate.now()

    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .padding(2.dp)
            .clickable(onClick = onClick)
            .background(cellColor, RoundedCornerShape(8.dp))
            .then(
                if (isToday) Modifier.border(BorderStroke(1.dp, MaterialTheme.colorScheme.primary), RoundedCornerShape(8.dp))
                else Modifier,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                day.date.dayOfMonth.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                if (day.income > 0) Box(Modifier.size(4.dp).background(FinTrackColors.Dark.colorInc, CircleShape))
                if (day.expense > 0) Box(Modifier.size(4.dp).background(FinTrackColors.Dark.colorExp, CircleShape))
                if (day.hasRecurringIncome) Box(Modifier.size(4.dp).background(FinTrackColors.Dark.accent, CircleShape))
                if (day.hasRecurringExpense) Box(Modifier.size(4.dp).background(FinTrackColors.Dark.colorWarn, CircleShape))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DayDetailSheet(day: CalendarDayData, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            Text(
                day.date.format(java.time.format.DateTimeFormatter.ofPattern("EEEE, MMM d")),
                style = MaterialTheme.typography.titleLarge,
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space4)) {
                if (day.income > 0) Text("+${formatInr(day.income)}", color = FinTrackColors.Dark.colorInc, style = MaterialTheme.typography.bodyMedium)
                if (day.expense > 0) Text("−${formatInr(day.expense)}", color = FinTrackColors.Dark.colorExp, style = MaterialTheme.typography.bodyMedium)
            }
            if (day.projectedExpense > 0) {
                Spacer(Modifier.height(FinTrackSpacing.space2))
                Surface(shape = RoundedCornerShape(8.dp), color = FinTrackColors.Dark.colorWarn.copy(alpha = 0.10f)) {
                    Text(
                        "Projected spend: ${formatInr(day.projectedExpense)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = FinTrackColors.Dark.colorWarn,
                        modifier = Modifier.padding(FinTrackSpacing.space2),
                    )
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))

            if (day.transactions.isEmpty() && day.recurringDue.isEmpty()) {
                Text("No transactions on this day", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            }

            if (day.transactions.isNotEmpty()) {
                Text("Transactions", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                day.transactions.forEach { tx ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(tx.description, style = MaterialTheme.typography.bodyMedium)
                            tx.category_name?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                        Text(
                            (if (tx.type == "income") "+" else "−") + formatInr(tx.amount),
                            color = if (tx.type == "income") FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorExp,
                        )
                    }
                    HorizontalDivider()
                }
            }

            if (day.recurringDue.isNotEmpty()) {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text("Scheduled", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(FinTrackSpacing.space2))
                day.recurringDue.forEach { item ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space1)) {
                        Text(item.description, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Text(
                            formatInr(item.amount),
                            color = if (item.type == "income") FinTrackColors.Dark.colorInc else FinTrackColors.Dark.colorWarn,
                        )
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
