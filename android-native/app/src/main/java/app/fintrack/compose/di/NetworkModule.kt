package app.fintrack.compose.di

import app.fintrack.compose.BuildConfig
import app.fintrack.compose.data.api.AccountsApiService
import app.fintrack.compose.data.api.AgentsApiService
import app.fintrack.compose.data.api.AiApiService
import app.fintrack.compose.data.api.AnalyticsApiService
import app.fintrack.compose.data.api.AuthApiService
import app.fintrack.compose.data.api.BudgetsApiService
import app.fintrack.compose.data.api.CamsImportApiService
import app.fintrack.compose.data.api.CategoriesApiService
import app.fintrack.compose.data.api.DebtApiService
import app.fintrack.compose.data.api.DocumentsApiService
import app.fintrack.compose.data.api.GoalsApiService
import app.fintrack.compose.data.api.GroupsApiService
import app.fintrack.compose.data.api.InvestmentsApiService
import app.fintrack.compose.data.api.LoansApiService
import app.fintrack.compose.data.api.MilestoneApiService
import app.fintrack.compose.data.api.NotificationsApiService
import app.fintrack.compose.data.api.OneTimeExpensesApiService
import app.fintrack.compose.data.api.OpportunitiesApiService
import app.fintrack.compose.data.api.PlanningApiService
import app.fintrack.compose.data.api.ProfileApiService
import app.fintrack.compose.data.api.RecurringApiService
import app.fintrack.compose.data.api.SplitsApiService
import app.fintrack.compose.data.api.TaxApiService
import app.fintrack.compose.data.api.TransactionsApiService
import app.fintrack.compose.data.auth.AuthInterceptor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.create
import retrofit2.converter.kotlinx.serialization.asConverterFactory

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(authInterceptor: AuthInterceptor): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BODY))
                }
            }
            .build()

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient, json: Json): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()

    @Provides
    @Singleton
    fun provideAuthApiService(retrofit: Retrofit): AuthApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideCategoriesApiService(retrofit: Retrofit): CategoriesApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideTransactionsApiService(retrofit: Retrofit): TransactionsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideBudgetsApiService(retrofit: Retrofit): BudgetsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideAnalyticsApiService(retrofit: Retrofit): AnalyticsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideNotificationsApiService(retrofit: Retrofit): NotificationsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideAccountsApiService(retrofit: Retrofit): AccountsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideGoalsApiService(retrofit: Retrofit): GoalsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideInvestmentsApiService(retrofit: Retrofit): InvestmentsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideRecurringApiService(retrofit: Retrofit): RecurringApiService = retrofit.create()

    @Provides
    @Singleton
    fun providePlanningApiService(retrofit: Retrofit): PlanningApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideAiApiService(retrofit: Retrofit): AiApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideProfileApiService(retrofit: Retrofit): ProfileApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideAgentsApiService(retrofit: Retrofit): AgentsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideDebtApiService(retrofit: Retrofit): DebtApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideLoansApiService(retrofit: Retrofit): LoansApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideMilestoneApiService(retrofit: Retrofit): MilestoneApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideTaxApiService(retrofit: Retrofit): TaxApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideGroupsApiService(retrofit: Retrofit): GroupsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideSplitsApiService(retrofit: Retrofit): SplitsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideOneTimeExpensesApiService(retrofit: Retrofit): OneTimeExpensesApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideDocumentsApiService(retrofit: Retrofit): DocumentsApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideOpportunitiesApiService(retrofit: Retrofit): OpportunitiesApiService = retrofit.create()

    @Provides
    @Singleton
    fun provideCamsImportApiService(retrofit: Retrofit): CamsImportApiService = retrofit.create()
}
