package app.fintrack.compose.data.categories

import app.fintrack.compose.data.api.CategoriesApiService
import app.fintrack.compose.data.api.CategoryDto
import app.fintrack.compose.data.api.CreateCategoryRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CategoriesRepository @Inject constructor(
    private val api: CategoriesApiService,
) {
    suspend fun getAll(): List<CategoryDto> = api.getAll().categories

    suspend fun create(name: String, icon: String?, color: String?): CategoryDto =
        api.create(CreateCategoryRequest(name, icon, color)).category

    suspend fun delete(id: String) = api.delete(id)
}
