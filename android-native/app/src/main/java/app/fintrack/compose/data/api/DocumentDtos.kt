package app.fintrack.compose.data.api

import kotlinx.serialization.Serializable

val DOCUMENT_TYPES = listOf(
    "form_16" to "Form 16",
    "itr_copy" to "ITR Copy",
    "salary_slip" to "Salary Slip",
    "bank_statement" to "Bank Statement",
    "insurance_policy" to "Insurance Policy",
    "investment_proof" to "Investment Proof",
    "advance_tax_challan" to "Advance Tax Challan",
    "rent_receipt" to "Rent Receipt",
    "other" to "Other",
)

val DOCUMENT_ALLOWED_EXTENSIONS = listOf(".pdf", ".jpg", ".jpeg", ".png", ".xlsx")
const val DOCUMENT_MAX_FILE_SIZE_BYTES = 20L * 1024 * 1024

/** `file_size_bytes` is a plain INTEGER column (no NUMERIC/DECIMAL on this table) — a real JSON number. */
@Serializable
data class DocumentDto(
    val id: String,
    val user_id: String? = null,
    val name: String,
    val type: String,
    val financial_year: String? = null,
    val storage_path: String? = null,
    val file_name: String,
    val file_size_bytes: Long,
    val mime_type: String,
    val description: String? = null,
    val created_at: String? = null,
)

@Serializable
data class DocumentDownloadUrlResponse(
    val download_url: String,
    val expires_in_seconds: Int = 3600,
    val file_name: String,
    val mime_type: String,
)
