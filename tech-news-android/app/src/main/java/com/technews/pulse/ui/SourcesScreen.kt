package com.technews.pulse.ui

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.technews.pulse.data.Category
import com.technews.pulse.data.Source
import com.technews.pulse.data.SourceStatus

@Composable
fun SourcesScreen(
    sources: List<Source>,
    status: Map<String, SourceStatus>,
    onToggle: (String, Boolean) -> Unit,
    onAdd: (String, String, Category) -> Unit,
    onRemove: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var adding by remember { mutableStateOf(false) }
    Box(modifier.fillMaxSize()) {
        LazyColumn(contentPadding = PaddingValues(bottom = 96.dp)) {
            item {
                Text(
                    "Включено: ${sources.count { it.enabled }} из ${sources.size}. Агрегаторы (HN, Reddit, Хабр) " +
                        "проходят через фильтр хайпа; потоки arXiv по умолчанию выключены — они очень объёмные.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }
            Category.entries.forEach { cat ->
                val list = sources.filter { it.category == cat }
                if (list.isNotEmpty()) {
                    item(key = "h_" + cat.name) {
                        Text(
                            cat.title,
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
                        )
                    }
                    items(list, key = { it.id }) { s ->
                        SourceRow(s, status[s.id], onToggle, onRemove)
                        HorizontalDivider(Modifier.padding(start = 16.dp))
                    }
                }
            }
        }
        ExtendedFloatingActionButton(
            onClick = { adding = true },
            icon = { Icon(Icons.Filled.Add, null) },
            text = { Text("RSS-лента") },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        )
    }
    if (adding) AddSourceDialog(onDismiss = { adding = false }, onAdd = { n, u, c -> onAdd(n, u, c); adding = false })
}

@Composable
private fun SourceRow(
    s: Source,
    st: SourceStatus?,
    onToggle: (String, Boolean) -> Unit,
    onRemove: (String) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 6.dp, bottom = 6.dp)) {
        Column(Modifier.weight(1f)) {
            Text(s.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val line = when {
                st == null -> s.url.substringAfter("://").substringBefore('?')
                st.ok -> "✓ ${st.count} шт. · " + DateUtils.getRelativeTimeSpanString(st.time)
                else -> "✗ ${st.error}"
            }
            Text(
                line,
                style = MaterialTheme.typography.bodySmall,
                color = if (st != null && !st.ok) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (s.custom) {
            IconButton(onClick = { onRemove(s.id) }) { Icon(Icons.Filled.Delete, "Удалить") }
        }
        Switch(checked = s.enabled, onCheckedChange = { onToggle(s.id, it) })
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun AddSourceDialog(onDismiss: () -> Unit, onAdd: (String, String, Category) -> Unit) {
    var name by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("https://") }
    var cat by remember { mutableStateOf(Category.TECH) }
    val valid = url.startsWith("http") && url.length > 12
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Новый источник") },
        text = {
            Column {
                OutlinedTextField(value = url, onValueChange = { url = it.trim() }, label = { Text("Адрес RSS / Atom") }, singleLine = true)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Название (необязательно)") }, singleLine = true)
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Category.entries.forEach { c ->
                        FilterChip(selected = cat == c, onClick = { cat = c }, label = { Text(c.title) })
                    }
                }
            }
        },
        confirmButton = { TextButton(enabled = valid, onClick = { onAdd(name, url, cat) }) { Text("Добавить") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
    )
}
