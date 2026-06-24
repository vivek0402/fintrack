package app.fintrack.compose.ui.savingsplan

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

private val SAVINGS_PLAN_TABS = listOf("Savings Plan", "Forecast", "Milestones")

/** Web's `/savings-plan` page has no SIP calculator at all — that screen previously living here was actually FIRE's "SIP Optimizer" tab, mis-located. It now lives under [app.fintrack.compose.ui.fire.FireCalculatorScreen]. */
@Composable
fun SavingsPlanScreen() {
    var selectedTab by remember { mutableIntStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = selectedTab) {
            SAVINGS_PLAN_TABS.forEachIndexed { index, label ->
                Tab(selected = selectedTab == index, onClick = { selectedTab = index }, text = { Text(label) })
            }
        }
        Box(modifier = Modifier.fillMaxSize()) {
            when (selectedTab) {
                0 -> SavingsToolsTab()
                1 -> ForecastTab()
                else -> MilestonesTab()
            }
        }
    }
}
