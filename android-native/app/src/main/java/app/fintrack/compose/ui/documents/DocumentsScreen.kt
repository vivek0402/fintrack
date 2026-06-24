package app.fintrack.compose.ui.documents

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items as lazyRowItems
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.hilt.navigation.compose.hiltViewModel
import app.fintrack.compose.data.api.DOCUMENT_ALLOWED_EXTENSIONS
import app.fintrack.compose.data.api.DOCUMENT_TYPES
import app.fintrack.compose.data.api.DocumentDto
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

private val DOCUMENT_TYPE_ICONS: Map<String, ImageVector> = mapOf(
    "form_16" to Icons.Filled.WorkspacePremium,
    "itr_copy" to Icons.Filled.Description,
    "salary_slip" to Icons.Filled.Receipt,
    "bank_statement" to Icons.Filled.AccountBalance,
    "insurance_policy" to Icons.Filled.Shield,
    "investment_proof" to Icons.Filled.TrendingUp,
    "advance_tax_challan" to Icons.Filled.ReceiptLong,
    "rent_receipt" to Icons.Filled.Home,
    "other" to Icons.Filled.InsertDriveFile,
)

private fun typeLabel(type: String) = DOCUMENT_TYPES.find { it.first == type }?.second ?: type

private fun formatFileSize(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "${(bytes / 1024.0).roundToInt()} KB"
    else -> "%.1f MB".format(bytes / (1024.0 * 1024.0))
}

private fun formatRelativeDate(isoDate: String?): String {
    if (isoDate.isNullOrBlank()) return ""
    val date = runCatching { LocalDate.parse(isoDate.take(10)) }.getOrNull() ?: return isoDate.take(10)
    val days = ChronoUnit.DAYS.between(date, LocalDate.now())
    return when {
        days <= 0 -> "Today"
        days == 1L -> "Yesterday"
        days < 30 -> "$days days ago"
        days < 365 -> "${days / 30} months ago"
        else -> "${days / 365} years ago"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocumentsScreen(viewModel: DocumentsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsState()
    var pendingDeleteId by remember { mutableStateOf<String?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                "Documents",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = FinTrackSpacing.space4, vertical = FinTrackSpacing.space3),
            )

            if (state.documents.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2),
                    contentPadding = PaddingValues(horizontal = FinTrackSpacing.space4),
                ) {
                    item {
                        FilterChip(selected = state.typeFilter == null, onClick = { viewModel.setTypeFilter(null) }, label = { Text("All") })
                    }
                    lazyRowItems(DOCUMENT_TYPES) { (value, label) ->
                        FilterChip(selected = state.typeFilter == value, onClick = { viewModel.setTypeFilter(value) }, label = { Text(label) })
                    }
                }
                Spacer(Modifier.height(FinTrackSpacing.space2))

                if (state.availableFinancialYears.isNotEmpty()) {
                    var fyMenuExpanded by remember { mutableStateOf(false) }
                    Box(modifier = Modifier.padding(horizontal = FinTrackSpacing.space4)) {
                        ExposedDropdownMenuBox(expanded = fyMenuExpanded, onExpandedChange = { fyMenuExpanded = it }) {
                            OutlinedTextField(
                                value = state.fyFilter ?: "All financial years",
                                onValueChange = {},
                                readOnly = true,
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = fyMenuExpanded) },
                                modifier = Modifier.menuAnchor(),
                            )
                            ExposedDropdownMenu(expanded = fyMenuExpanded, onDismissRequest = { fyMenuExpanded = false }) {
                                DropdownMenuItem(text = { Text("All financial years") }, onClick = { viewModel.setFyFilter(null); fyMenuExpanded = false })
                                state.availableFinancialYears.forEach { fy ->
                                    DropdownMenuItem(text = { Text(fy) }, onClick = { viewModel.setFyFilter(fy); fyMenuExpanded = false })
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(FinTrackSpacing.space2))
                }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                when {
                    state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                    state.error != null -> Text(
                        state.error.orEmpty(),
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6),
                    )
                    state.documents.isEmpty() -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6)) {
                        Icon(Icons.Filled.Archive, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(48.dp))
                        Spacer(Modifier.height(FinTrackSpacing.space3))
                        Text("No documents stored yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                        Text(
                            "Store Form 16, ITR copies, investment proofs, insurance policies and more.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    state.filtered.isEmpty() -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.align(Alignment.Center).padding(FinTrackSpacing.space6)) {
                        Text("No documents match these filters.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(FinTrackSpacing.space2))
                        TextButton(onClick = { viewModel.setTypeFilter(null); viewModel.setFyFilter(null) }) { Text("Clear filters") }
                    }
                    else -> LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(FinTrackSpacing.space4),
                        horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3),
                        verticalArrangement = Arrangement.spacedBy(FinTrackSpacing.space3),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(state.filtered, key = { it.id }) { document ->
                            DocumentCard(
                                document = document,
                                isDeleting = state.deletingId == document.id,
                                onDownload = { viewModel.download(document) },
                                onDelete = { pendingDeleteId = document.id },
                            )
                        }
                    }
                }
            }
        }

        FloatingActionButton(
            onClick = viewModel::openUploadSheet,
            modifier = Modifier.align(Alignment.BottomEnd).padding(FinTrackSpacing.space5),
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Upload document")
        }
    }

    if (state.showUploadSheet) {
        UploadFormSheet(state.uploadForm, viewModel)
    }

    pendingDeleteId?.let { id ->
        val document = state.documents.find { it.id == id }
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("Delete ${document?.name ?: "this document"}?") },
            text = { Text("This cannot be undone.") },
            confirmButton = { TextButton(onClick = { viewModel.delete(id); pendingDeleteId = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { pendingDeleteId = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun DocumentCard(document: DocumentDto, isDeleting: Boolean, onDownload: () -> Unit, onDelete: () -> Unit) {
    Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(FinTrackSpacing.space4)) {
            Surface(shape = RoundedCornerShape(12.dp), color = FinTrackColors.Dark.accent.copy(alpha = 0.12f)) {
                Icon(
                    DOCUMENT_TYPE_ICONS[document.type] ?: Icons.Filled.InsertDriveFile,
                    contentDescription = null,
                    tint = FinTrackColors.Dark.accent,
                    modifier = Modifier.padding(FinTrackSpacing.space2),
                )
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))
            Text(document.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2)
            Spacer(Modifier.height(FinTrackSpacing.space1))
            Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space1)) {
                Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                    Text(typeLabel(document.type), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = FinTrackSpacing.space2, vertical = FinTrackSpacing.space1))
                }
                document.financial_year?.let { fy ->
                    Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Text(fy, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = FinTrackSpacing.space2, vertical = FinTrackSpacing.space1))
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                "${formatFileSize(document.file_size_bytes)} · ${formatRelativeDate(document.created_at)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                IconButton(onClick = onDownload) { Icon(Icons.Filled.Download, contentDescription = "Download", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (isDeleting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp).padding(FinTrackSpacing.space2))
                } else {
                    IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UploadFormSheet(form: UploadFormState, viewModel: DocumentsViewModel) {
    val sheetState = rememberModalBottomSheetState()
    var typeMenuExpanded by remember { mutableStateOf(false) }
    var fyMenuExpanded by remember { mutableStateOf(false) }
    val fyChoices = remember { financialYearOptions() }

    val pickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { viewModel.onFilePicked(it) }
    }

    ModalBottomSheet(onDismissRequest = viewModel::closeUploadSheet, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 640.dp).padding(FinTrackSpacing.space5)) {
            Text("Upload Document", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedButton(
                onClick = {
                    pickerLauncher.launch(
                        arrayOf(
                            "application/pdf", "image/jpeg", "image/png",
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.UploadFile, contentDescription = null)
                Spacer(Modifier.width(FinTrackSpacing.space2))
                Text(form.pickedFileName.ifBlank { "Choose a file (${DOCUMENT_ALLOWED_EXTENSIONS.joinToString(", ")})" })
            }
            if (form.pickedFileSize > 0) {
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(formatFileSize(form.pickedFileSize), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(FinTrackSpacing.space4))

            OutlinedTextField(
                value = form.name,
                onValueChange = { v -> viewModel.updateUploadForm { it.copy(name = v) } },
                label = { Text("Document name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = typeMenuExpanded, onExpandedChange = { typeMenuExpanded = it }) {
                OutlinedTextField(
                    value = typeLabel(form.type),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Document type") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = typeMenuExpanded, onDismissRequest = { typeMenuExpanded = false }) {
                    DOCUMENT_TYPES.forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { viewModel.updateUploadForm { it.copy(type = value) }; typeMenuExpanded = false })
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            ExposedDropdownMenuBox(expanded = fyMenuExpanded, onExpandedChange = { fyMenuExpanded = it }) {
                OutlinedTextField(
                    value = form.financialYear.ifBlank { "Not applicable" },
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Financial year") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = fyMenuExpanded) },
                    modifier = Modifier.fillMaxWidth().menuAnchor(),
                )
                ExposedDropdownMenu(expanded = fyMenuExpanded, onDismissRequest = { fyMenuExpanded = false }) {
                    DropdownMenuItem(text = { Text("Not applicable") }, onClick = { viewModel.updateUploadForm { it.copy(financialYear = "") }; fyMenuExpanded = false })
                    fyChoices.forEach { fy ->
                        DropdownMenuItem(text = { Text(fy) }, onClick = { viewModel.updateUploadForm { it.copy(financialYear = fy) }; fyMenuExpanded = false })
                    }
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space3))

            OutlinedTextField(
                value = form.description,
                onValueChange = { v -> viewModel.updateUploadForm { it.copy(description = v) } },
                label = { Text("Description (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )

            form.error?.let {
                Spacer(Modifier.height(FinTrackSpacing.space3))
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(FinTrackSpacing.space5))
            Button(onClick = viewModel::upload, enabled = !form.isUploading, modifier = Modifier.fillMaxWidth()) {
                if (form.isUploading) {
                    CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Upload")
                }
            }
            Spacer(Modifier.height(FinTrackSpacing.space5))
        }
    }
}
