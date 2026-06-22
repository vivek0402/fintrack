package app.fintrack.compose.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.ui.graphics.vector.ImageVector

object Routes {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val FORGOT_PASSWORD = "forgot_password"
    const val ONBOARDING = "onboarding"
    const val DASHBOARD = "dashboard"
    const val TRANSACTIONS = "transactions"
    const val AI_ADVISOR = "ai_advisor"
    const val ANALYTICS = "analytics"
    const val MORE = "more"
    const val BUDGETS = "budgets"
    const val ACCOUNTS = "accounts"
    const val GOALS = "goals"
    const val NET_WORTH = "net_worth"
    const val INVESTMENTS = "investments"
    const val CASH_FLOW = "cash_flow"
    const val HEALTH_SCORE = "health_score"
    const val RECURRING = "recurring"
    const val PROFILE = "profile"
    const val FIRE_CALCULATOR = "fire_calculator"
    const val SAVINGS_PLAN = "savings_plan"
    const val SCENARIOS = "scenarios"
    const val REGRET_CHECK = "regret_check"
    const val DEBT_INTELLIGENCE = "debt_intelligence"
    const val TAX = "tax"
    const val GROUPS = "groups"
    const val DOCUMENTS = "documents"
}

data class BottomNavItem(val route: String, val label: String, val icon: ImageVector)

/** Mirrors frontend/components/layout/BottomNav.tsx's mainTabs + More button exactly. */
val bottomNavItems = listOf(
    BottomNavItem(Routes.DASHBOARD, "Home", Icons.Filled.Home),
    BottomNavItem(Routes.TRANSACTIONS, "Money", Icons.Filled.SwapHoriz),
    BottomNavItem(Routes.AI_ADVISOR, "AI Chat", Icons.Filled.SmartToy),
    BottomNavItem(Routes.ANALYTICS, "Insights", Icons.Filled.PieChart),
    BottomNavItem(Routes.MORE, "More", Icons.Filled.MoreHoriz),
)
