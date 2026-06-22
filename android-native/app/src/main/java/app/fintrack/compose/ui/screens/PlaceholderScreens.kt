package app.fintrack.compose.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Percent
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.SentimentVeryDissatisfied
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

private data class MoreItem(val label: String, val icon: ImageVector, val onClick: () -> Unit)

/** Mirrors frontend/components/layout/BottomNav.tsx's moreGroups — grouped 2-column grid. */
@Composable
fun MoreScreen(
    onNavigateToBudgets: () -> Unit,
    onNavigateToAccounts: () -> Unit,
    onNavigateToGoals: () -> Unit,
    onNavigateToNetWorth: () -> Unit,
    onNavigateToInvestments: () -> Unit,
    onNavigateToCashFlow: () -> Unit,
    onNavigateToHealthScore: () -> Unit,
    onNavigateToRecurring: () -> Unit,
    onNavigateToFireCalculator: () -> Unit,
    onNavigateToSavingsPlan: () -> Unit,
    onNavigateToScenarios: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToRegretCheck: () -> Unit,
    onNavigateToDebtIntelligence: () -> Unit,
    onNavigateToTax: () -> Unit,
    onNavigateToGroups: () -> Unit,
    onNavigateToDocuments: () -> Unit,
) {
    val items = listOf(
        MoreItem("Budgets", Icons.Filled.PieChart, onNavigateToBudgets),
        MoreItem("Accounts", Icons.Filled.Wallet, onNavigateToAccounts),
        MoreItem("Goals", Icons.Filled.Favorite, onNavigateToGoals),
        MoreItem("Net Worth", Icons.Filled.AccountBalance, onNavigateToNetWorth),
        MoreItem("Investments", Icons.Filled.ShowChart, onNavigateToInvestments),
        MoreItem("Cash Flow", Icons.Filled.TrendingUp, onNavigateToCashFlow),
        MoreItem("Health Score", Icons.Filled.Favorite, onNavigateToHealthScore),
        MoreItem("Recurring", Icons.Filled.Autorenew, onNavigateToRecurring),
        MoreItem("FIRE Calculator", Icons.Filled.WbSunny, onNavigateToFireCalculator),
        MoreItem("Savings Plan", Icons.Filled.Savings, onNavigateToSavingsPlan),
        MoreItem("Scenarios", Icons.Filled.Bolt, onNavigateToScenarios),
        MoreItem("Debt Intelligence", Icons.Filled.Gavel, onNavigateToDebtIntelligence),
        MoreItem("Tax", Icons.Filled.Percent, onNavigateToTax),
        MoreItem("Groups", Icons.Filled.Groups, onNavigateToGroups),
        MoreItem("Documents", Icons.Filled.Archive, onNavigateToDocuments),
        MoreItem("Regret Check", Icons.Filled.SentimentVeryDissatisfied, onNavigateToRegretCheck),
        MoreItem("Profile", Icons.Filled.Person, onNavigateToProfile),
    )

    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(FinTrackSpacing.space4),
        horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3),
        verticalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3),
        modifier = Modifier.fillMaxSize(),
    ) {
        items(items) { item ->
            MoreGridTile(item)
        }
    }
}

@Composable
private fun MoreGridTile(item: MoreItem) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        onClick = item.onClick,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space5)) {
            Icon(item.icon, contentDescription = null, tint = FinTrackColors.Dark.accent)
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Text(item.label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
