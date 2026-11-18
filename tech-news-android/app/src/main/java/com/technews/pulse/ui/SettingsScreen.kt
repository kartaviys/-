package com.technews.pulse.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.technews.pulse.data.AppSettings
import com.technews.pulse.data.SettingsStore

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    settings: AppSettings,
    onChange: ((AppSettings) -> AppSettings) -> Unit,
    onClearCache: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var strict by remember(settings.strictness) { mutableFloatStateOf(settings.strictness.toFloat()) }
    var allow by remember(settings.allowWords) { mutableStateOf(settings.allowWords.joinToString(", ")) }
    var block by remember(settings.blockWords) { mutableStateOf(settings.blockWords.joinToString(", ")) }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Section("Фильтр хайпа")
        Text("Строгость: ${strict.toInt()} — ${strictLabel(strict.toInt())}", style = MaterialTheme.typography.bodyLarge)
        Slider(
            value = strict,
            onValueChange = { strict = it },
            onValueChangeFinished = { onChange { s -> s.copy(strictness = strict.toInt()) } },
            valueRange = 0f..10f,
            steps = 9,
        )
        Hint(
            "Каждая статья получает оценку: плюсы за технические признаки (статьи, бенчмарки, архитектуры, " +
                "обучение, инференс, код, железо), минусы за «CEO заявил», страшилки, бизнес, политику и драмы. " +
                "Показываются статьи с оценкой не ниже порога. Нажмите «⋮ → Почему показано?» на карточке, чтобы увидеть разбор."
        )
        SwitchRow("Показывать отсеянные (полупрозрачными)", settings.showHidden) { v -> onChange { it.copy(showHidden = v) } }

        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = allow, onValueChange = { allow = it },
            label = { Text("Мои интересные слова (+4)") },
            placeholder = { Text("например: Rust, RAG, робототехника") },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = block, onValueChange = { block = it },
            label = { Text("Стоп-слова (−8)") },
            placeholder = { Text("например: crypto, NFT, гороскоп") },
            modifier = Modifier.fillMaxWidth(),
        )
        Button(onClick = {
            onChange { it.copy(allowWords = SettingsStore.splitWords(allow), blockWords = SettingsStore.splitWords(block)) }
        }) { Text("Сохранить слова") }

        HorizontalDivider(Modifier.padding(vertical = 12.dp))
        Section("Фоновое обновление")
        SwitchRow("Обновлять в фоне", settings.backgroundRefresh) { v -> onChange { it.copy(backgroundRefresh = v) } }
        if (settings.backgroundRefresh) {
            Text("Интервал", style = MaterialTheme.typography.bodyMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(1, 3, 6, 12, 24).forEach { h ->
                    FilterChip(
                        selected = settings.refreshHours == h,
                        onClick = { onChange { it.copy(refreshHours = h) } },
                        label = { Text("$h ч") },
                    )
                }
            }
            SwitchRow("Уведомлять о новых технических статьях", settings.notify) { v -> onChange { it.copy(notify = v) } }
        }

        HorizontalDivider(Modifier.padding(vertical = 12.dp))
        Section("Хранение")
        Text("Хранить статьи", style = MaterialTheme.typography.bodyMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(3, 7, 14, 30).forEach { d ->
                FilterChip(
                    selected = settings.maxAgeDays == d,
                    onClick = { onChange { it.copy(maxAgeDays = d) } },
                    label = { Text("$d дн.") },
                )
            }
        }
        Hint("Избранное хранится всегда.")
        OutlinedButton(onClick = onClearCache) { Text("Очистить кэш и загрузить заново") }
    }
}

private fun strictLabel(v: Int) = when {
    v <= 0 -> "всё, кроме явного хайпа"
    v <= 2 -> "мягко"
    v <= 4 -> "сбалансированно"
    v <= 7 -> "строго"
    else -> "только глубоко технические"
}

@Composable
private fun Section(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun SwitchRow(text: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text(text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChecked)
    }
}
