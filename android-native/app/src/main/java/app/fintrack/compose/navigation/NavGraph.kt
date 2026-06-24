package app.fintrack.compose.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.fintrack.compose.ui.accounts.AccountsScreen
import app.fintrack.compose.ui.advisor.AdvisorScreen
import app.fintrack.compose.ui.analytics.AnalyticsScreen
import app.fintrack.compose.ui.auth.ForgotPasswordScreen
import app.fintrack.compose.ui.auth.LoginScreen
import app.fintrack.compose.ui.auth.RegisterScreen
import app.fintrack.compose.ui.budgets.BudgetsScreen
import app.fintrack.compose.ui.cashflow.CashFlowScreen
import app.fintrack.compose.ui.dashboard.DashboardScreen
import app.fintrack.compose.ui.debt.DebtScreen
import app.fintrack.compose.ui.documents.DocumentsScreen
import app.fintrack.compose.ui.fire.FireCalculatorScreen
import app.fintrack.compose.ui.goals.GoalsScreen
import app.fintrack.compose.ui.groups.GroupsScreen
import app.fintrack.compose.ui.healthscore.HealthScoreScreen
import app.fintrack.compose.ui.investments.InvestmentsScreen
import app.fintrack.compose.ui.networth.NetWorthScreen
import app.fintrack.compose.ui.onboarding.OnboardingScreen
import app.fintrack.compose.ui.profile.ProfileScreen
import app.fintrack.compose.ui.recurring.RecurringScreen
import app.fintrack.compose.ui.regret.RegretScreen
import app.fintrack.compose.ui.savingsplan.SavingsPlanScreen
import app.fintrack.compose.ui.scenarios.ScenariosScreen
import app.fintrack.compose.ui.tax.TaxScreen
import app.fintrack.compose.ui.screens.MoreScreen
import app.fintrack.compose.ui.transactions.TransactionsScreen

private val noBottomBarRoutes = setOf(Routes.LOGIN, Routes.REGISTER, Routes.FORGOT_PASSWORD, Routes.ONBOARDING)

@Composable
fun FinTrackNavGraph() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            if (currentRoute != null && currentRoute !in noBottomBarRoutes) {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        val selected = navBackStackEntry?.destination
                            ?.hierarchy?.any { it.route == item.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(item.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { Text(item.label) },
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Routes.LOGIN,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Routes.LOGIN) {
                LoginScreen(
                    onLoginSuccess = { needsOnboarding ->
                        val destination = if (needsOnboarding) Routes.ONBOARDING else Routes.DASHBOARD
                        navController.navigate(destination) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                    onNavigateToRegister = { navController.navigate(Routes.REGISTER) },
                    onNavigateToForgotPassword = { navController.navigate(Routes.FORGOT_PASSWORD) },
                )
            }
            composable(Routes.REGISTER) {
                RegisterScreen(
                    onVerifySuccess = { needsOnboarding ->
                        val destination = if (needsOnboarding) Routes.ONBOARDING else Routes.DASHBOARD
                        navController.navigate(destination) {
                            popUpTo(Routes.LOGIN) { inclusive = true }
                        }
                    },
                    onNavigateToLogin = { navController.popBackStack() },
                )
            }
            composable(Routes.FORGOT_PASSWORD) {
                ForgotPasswordScreen(onNavigateToLogin = { navController.popBackStack() })
            }
            composable(Routes.ONBOARDING) {
                OnboardingScreen(
                    onFinished = {
                        navController.navigate(Routes.DASHBOARD) {
                            popUpTo(Routes.ONBOARDING) { inclusive = true }
                        }
                    },
                )
            }
            composable(Routes.DASHBOARD) { DashboardScreen() }
            composable(Routes.TRANSACTIONS) { TransactionsScreen() }
            composable(Routes.AI_ADVISOR) { AdvisorScreen() }
            composable(Routes.ANALYTICS) { AnalyticsScreen() }
            composable(Routes.MORE) {
                MoreScreen(
                    onNavigateToBudgets = { navController.navigate(Routes.BUDGETS) },
                    onNavigateToAccounts = { navController.navigate(Routes.ACCOUNTS) },
                    onNavigateToGoals = { navController.navigate(Routes.GOALS) },
                    onNavigateToNetWorth = { navController.navigate(Routes.NET_WORTH) },
                    onNavigateToInvestments = { navController.navigate(Routes.INVESTMENTS) },
                    onNavigateToCashFlow = { navController.navigate(Routes.CASH_FLOW) },
                    onNavigateToHealthScore = { navController.navigate(Routes.HEALTH_SCORE) },
                    onNavigateToRecurring = { navController.navigate(Routes.RECURRING) },
                    onNavigateToFireCalculator = { navController.navigate(Routes.FIRE_CALCULATOR) },
                    onNavigateToSavingsPlan = { navController.navigate(Routes.SAVINGS_PLAN) },
                    onNavigateToScenarios = { navController.navigate(Routes.SCENARIOS) },
                    onNavigateToProfile = { navController.navigate(Routes.PROFILE) },
                    onNavigateToRegretCheck = { navController.navigate(Routes.REGRET_CHECK) },
                    onNavigateToDebtIntelligence = { navController.navigate(Routes.DEBT_INTELLIGENCE) },
                    onNavigateToTax = { navController.navigate(Routes.TAX) },
                    onNavigateToGroups = { navController.navigate(Routes.GROUPS) },
                    onNavigateToDocuments = { navController.navigate(Routes.DOCUMENTS) },
                )
            }
            composable(Routes.BUDGETS) { BudgetsScreen() }
            composable(Routes.ACCOUNTS) { AccountsScreen() }
            composable(Routes.GOALS) { GoalsScreen() }
            composable(Routes.NET_WORTH) { NetWorthScreen() }
            composable(Routes.INVESTMENTS) { InvestmentsScreen() }
            composable(Routes.CASH_FLOW) { CashFlowScreen() }
            composable(Routes.HEALTH_SCORE) { HealthScoreScreen() }
            composable(Routes.RECURRING) { RecurringScreen() }
            composable(Routes.FIRE_CALCULATOR) { FireCalculatorScreen() }
            composable(Routes.SAVINGS_PLAN) { SavingsPlanScreen() }
            composable(Routes.SCENARIOS) { ScenariosScreen() }
            composable(Routes.REGRET_CHECK) { RegretScreen() }
            composable(Routes.DEBT_INTELLIGENCE) { DebtScreen() }
            composable(Routes.TAX) { TaxScreen() }
            composable(Routes.GROUPS) { GroupsScreen() }
            composable(Routes.DOCUMENTS) { DocumentsScreen() }
            composable(Routes.PROFILE) {
                ProfileScreen(
                    onLoggedOut = {
                        navController.navigate(Routes.LOGIN) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    onNavigateToTax = { navController.navigate(Routes.TAX) },
                )
            }
        }
    }
}
