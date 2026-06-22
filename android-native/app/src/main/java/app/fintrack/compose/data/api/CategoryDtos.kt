package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val icon: String? = null,
    val color: String? = null,
    val is_default: Boolean = false,
)

@Serializable
data class CategoriesResponse(val categories: List<CategoryDto>)

@Serializable
data class CreateCategoryRequest(val name: String, val icon: String? = null, val color: String? = null)

@Serializable
data class CategoryResponse(val category: CategoryDto)
