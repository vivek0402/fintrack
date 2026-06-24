package app.fintrack.compose.ui.investments

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.fintrack.compose.data.api.CamsHoldingDto
import app.fintrack.compose.ui.common.formatInr
import app.fintrack.compose.ui.theme.FinTrackColors
import app.fintrack.compose.ui.theme.FinTrackSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CamsImportSheet(
    state: CamsImportState,
    onDismiss: () -> Unit,
    onFilePicked: (android.net.Uri) -> Unit,
    onParse: () -> Unit,
    onRemoveHolding: (Int) -> Unit,
    onConfirm: () -> Unit,
    onReset: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val pickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(onFilePicked)
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, contentWindowInsets = { WindowInsets.systemBars }) {
        Column(modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space5)) {
            when (state.step) {
                CamsImportStep.Upload -> CamsUploadStep(
                    state = state,
                    onPick = { pickerLauncher.launch(arrayOf("application/pdf")) },
                    onParse = onParse,
                )
                CamsImportStep.Parsing -> CamsParsingStep()
                CamsImportStep.Review -> CamsReviewStep(
                    state = state,
                    onRemoveHolding = onRemoveHolding,
                    onCancel = onDismiss,
                    onConfirm = onConfirm,
                )
                CamsImportStep.Success -> CamsSuccessStep(state = state, onDone = onDismiss, onImportAgain = onReset)
            }
        }
    }
}

@Composable
private fun CamsUploadStep(state: CamsImportState, onPick: () -> Unit, onParse: () -> Unit) {
    Text("Import CAMS Statement", style = MaterialTheme.typography.titleLarge)
    Spacer(Modifier.height(FinTrackSpacing.space4))

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space6),
        ) {
            Icon(Icons.Filled.UploadFile, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(FinTrackSpacing.space2))
            Text(
                state.pickedFileName.ifBlank { "Tap to choose your CAMS CAS PDF" },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(FinTrackSpacing.space3))
            TextButton(onClick = onPick) { Text(if (state.pickedFileName.isBlank()) "Browse" else "Choose a different file") }
        }
    }

    Spacer(Modifier.height(FinTrackSpacing.space3))
    Text(
        "A CAMS CAS (Consolidated Account Statement) lists all your mutual fund holdings in one PDF. Get yours free at camsonline.com — request a CAS by PAN or email.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    state.error?.let {
        Spacer(Modifier.height(FinTrackSpacing.space3))
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }

    Spacer(Modifier.height(FinTrackSpacing.space5))
    Button(onClick = onParse, enabled = state.pickedUri != null, modifier = Modifier.fillMaxWidth()) {
        Text("Parse Statement")
    }
    Spacer(Modifier.height(FinTrackSpacing.space3))
}

@Composable
private fun CamsParsingStep() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space8),
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(FinTrackSpacing.space3))
        Text("Reading your CAMS statement…", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun CamsReviewStep(state: CamsImportState, onRemoveHolding: (Int) -> Unit, onCancel: () -> Unit, onConfirm: () -> Unit) {
    Text("Review Holdings", style = MaterialTheme.typography.titleLarge)
    Spacer(Modifier.height(FinTrackSpacing.space2))
    Text(
        "Found ${state.holdings.size} holding${if (state.holdings.size != 1) "s" else ""}. Review before importing to your portfolio.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Spacer(Modifier.height(FinTrackSpacing.space3))

    state.error?.let {
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(FinTrackSpacing.space2))
    }

    if (state.holdings.isEmpty()) {
        Text("No holdings found in this statement.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        LazyColumn(modifier = Modifier.fillMaxWidth().height(360.dp)) {
            items(state.holdings.size) { index ->
                CamsHoldingRow(holding = state.holdings[index], onRemove = { onRemoveHolding(index) })
                Spacer(Modifier.height(FinTrackSpacing.space2))
            }
        }
    }

    Spacer(Modifier.height(FinTrackSpacing.space4))
    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
        TextButton(onClick = onCancel) { Text("Cancel") }
        Button(onClick = onConfirm, enabled = !state.isBusy && state.holdings.isNotEmpty()) {
            if (state.isBusy) {
                CircularProgressIndicator(modifier = Modifier.padding(2.dp), color = MaterialTheme.colorScheme.onPrimary)
            } else {
                Text("Import ${state.holdings.size} holding${if (state.holdings.size != 1) "s" else ""}")
            }
        }
    }
    Spacer(Modifier.height(FinTrackSpacing.space3))
}

@Composable
private fun CamsHoldingRow(holding: CamsHoldingDto, onRemove: () -> Unit) {
    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(FinTrackSpacing.space3)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(holding.scheme_name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(FinTrackSpacing.space1))
                Text(
                    "Folio: ${holding.folio_number ?: "—"} · Units: ${"%.3f".format(holding.units)} · NAV: ${formatInr(holding.nav)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onRemove) {
                Icon(Icons.Filled.Delete, contentDescription = "Remove", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun CamsSuccessStep(state: CamsImportState, onDone: () -> Unit, onImportAgain: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(vertical = FinTrackSpacing.space6)) {
        Text("Portfolio updated", style = MaterialTheme.typography.titleLarge, color = FinTrackColors.Dark.colorInc)
        Spacer(Modifier.height(FinTrackSpacing.space2))
        Text(
            "${state.createdCount} fund${if (state.createdCount != 1) "s" else ""} added, ${state.updatedCount} updated.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(FinTrackSpacing.space5))
        Row(horizontalArrangement = Arrangement.spacedBy(FinTrackSpacing.space2)) {
            Button(onClick = onDone) { Text("View portfolio") }
            TextButton(onClick = onImportAgain) { Text("Import again") }
        }
    }
}
