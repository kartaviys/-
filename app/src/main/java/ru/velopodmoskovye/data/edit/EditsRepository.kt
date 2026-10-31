package ru.velopodmoskovye.data.edit

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import ru.velopodmoskovye.domain.edit.StopMove
import ru.velopodmoskovye.domain.edit.StopOrder
import ru.velopodmoskovye.domain.edit.UserPlace
import ru.velopodmoskovye.domain.edit.UserEdits
import ru.velopodmoskovye.domain.edit.UserStop
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/** Свои правки точек — в файле user_edits.json во внутренней памяти приложения. */
@Singleton
class EditsRepository @Inject constructor(@ApplicationContext private val context: Context) {
    private val file get() = File(context.filesDir, "user_edits.json")
    private val mutex = Mutex()
    private val _edits = MutableStateFlow(load())
    val edits: StateFlow<UserEdits> = _edits.asStateFlow()

    private fun load(): UserEdits = runCatching { json.decodeFromString<UserEdits>(file.readText()) }.getOrDefault(UserEdits())

    private suspend fun update(change: (UserEdits) -> UserEdits) = mutex.withLock {
        val next = change(_edits.value)
        withContext(Dispatchers.IO) {
            val tmp = File(context.filesDir, "user_edits.json.tmp")
            tmp.writeText(json.encodeToString(next))
            tmp.renameTo(file)
        }
        _edits.value = next
    }

    suspend fun move(m: StopMove) = update { it.withMove(m) }
    suspend fun resetMove(destinationId: String, stopId: String) = update { it.withoutMove(destinationId, stopId) }
    suspend fun add(s: UserStop) = update { it.withAdded(s) }
    suspend fun removeAdded(destinationId: String, id: String) = update { it.withoutAdded(destinationId, id).withoutMove(destinationId, id) }
    suspend fun setOrder(o: StopOrder) = update { it.withOrder(o) }
    suspend fun resetOrder(destinationId: String) = update { it.withoutOrder(destinationId) }
    suspend fun addPlace(p: UserPlace) = update { it.withPlace(p) }
    suspend fun removePlace(id: String) = update { it.withoutPlace(id) }
    suspend fun clear() = update { UserEdits() }

    /** Выгрузка для «Поделиться»: по ней правки можно перенести в общий контент. */
    fun exportJson(): String = pretty.encodeToString(_edits.value)

    companion object {
        private val json = Json { ignoreUnknownKeys = true }
        private val pretty = Json { prettyPrint = true }
    }
}
