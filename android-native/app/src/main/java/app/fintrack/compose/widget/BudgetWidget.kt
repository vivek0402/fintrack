package app.fintrack.compose.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.fintrack.compose.MainActivity
import app.fintrack.compose.data.api.BudgetDto
import app.fintrack.compose.data.budgets.BudgetsRepository
import app.fintrack.compose.ui.common.formatInr
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.time.LocalDate

@EntryPoint
@InstallIn(SingletonComponent::class)
interface BudgetWidgetEntryPoint {
    fun budgetsRepository(): BudgetsRepository
}

private val WidgetBg = Color(0xFF0A0A0A)
private val WidgetSurface = Color(0xFF1A1A1A)
private val WidgetExp = Color(0xFFDC2626)
private val WidgetWarn = Color(0xFFD97706)
private val WidgetInc = Color(0xFF16A34A)
private val WidgetTextPrimary = Color(0xFFFFFFFF)
private val WidgetTextSecondary = Color(0xFFA0A0A0)

class BudgetWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repository = EntryPointAccessors
            .fromApplication(context, BudgetWidgetEntryPoint::class.java)
            .budgetsRepository()
        val now = LocalDate.now()
        val budgets = runCatching { repository.getAll(now.monthValue, now.year) }.getOrDefault(emptyList())

        provideContent {
            BudgetWidgetContent(budgets)
        }
    }
}

@Composable
private fun BudgetWidgetContent(budgets: List<BudgetDto>) {
    val topBudgets = budgets.sortedByDescending { budgetRatio(it) }.take(4)

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(WidgetBg)
            .cornerRadius(20.dp)
            .padding(16.dp)
            .clickable(actionStartActivity<MainActivity>()),
    ) {
        Text(
            "This Month's Budgets",
            style = TextStyle(color = ColorProvider(WidgetTextPrimary), fontWeight = FontWeight.Bold, fontSize = 14.sp),
        )
        Spacer(modifier = GlanceModifier.height(10.dp))

        if (topBudgets.isEmpty()) {
            Text(
                "No budgets set for this month.",
                style = TextStyle(color = ColorProvider(WidgetTextSecondary), fontSize = 12.sp),
            )
        } else {
            topBudgets.forEachIndexed { index, budget ->
                BudgetWidgetRow(budget)
                if (index != topBudgets.lastIndex) {
                    Spacer(modifier = GlanceModifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun BudgetWidgetRow(budget: BudgetDto) {
    val ratio = budgetRatio(budget)
    val progress = ratio.toFloat().coerceIn(0f, 1f)
    val color = when {
        ratio >= 1.0 -> WidgetExp
        ratio >= 0.8 -> WidgetWarn
        else -> WidgetInc
    }

    Column(modifier = GlanceModifier.fillMaxWidth()) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Vertical.CenterVertically) {
            Text(
                budget.category_name ?: "Uncategorized",
                style = TextStyle(color = ColorProvider(WidgetTextPrimary), fontSize = 12.sp),
                modifier = GlanceModifier.defaultWeight(),
            )
            Text(
                "${formatInr(budget.spent)} / ${formatInr(budget.amount)}",
                style = TextStyle(color = ColorProvider(WidgetTextSecondary), fontSize = 11.sp),
            )
        }
        Spacer(modifier = GlanceModifier.height(4.dp))
        LinearProgressIndicator(
            modifier = GlanceModifier.fillMaxWidth().height(6.dp),
            progress = progress,
            color = ColorProvider(color),
            backgroundColor = ColorProvider(WidgetSurface),
        )
    }
}

private fun budgetRatio(budget: BudgetDto): Double {
    val spent = budget.spent.toDoubleOrNull() ?: 0.0
    val amount = budget.amount.toDoubleOrNull()?.takeIf { it > 0 } ?: return 0.0
    return spent / amount
}
