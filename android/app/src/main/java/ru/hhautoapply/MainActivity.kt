package ru.hhautoapply

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.work.WorkInfo
import androidx.work.WorkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.File

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var logView: TextView
    private lateinit var logScroll: ScrollView
    private var pickLang = "ru"

    private val pickPdf = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) importResume(uri, pickLang)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        RunWorker.ensureChannel(this)
        if (Build.VERSION.SDK_INT >= 33) {
            registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
                .launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val box = vbox()
        status = label("", 13f)
        box.addView(status)
        box.addView(header("Настройка"))
        box.addView(row(
            button("Настройки") { startActivity(Intent(this, SettingsActivity::class.java)) },
            button("Войти через API hh") { openWeb(WebActivity.MODE_OAUTH) },
        ))
        box.addView(row(
            button("Войти на hh.ru (для тестов)") { openWeb(WebActivity.MODE_LOGIN) },
            button("Мои резюме на hh") { chooseResumes() },
        ))
        box.addView(button("Источники вакансий: вкл/выкл и инструкции") { startActivity(Intent(this, SourcesActivity::class.java)) })
        box.addView(row(
            button("PDF резюме RU") { pickLang = "ru"; pickPdf.launch(arrayOf("application/pdf")) },
            button("PDF резюме EN") { pickLang = "en"; pickPdf.launch(arrayOf("application/pdf")) },
        ))
        box.addView(header("Запуск"))
        box.addView(row(
            button("Пробный прогон") { RunWorker.runNow(this, dry = true) },
            button("Откликнуться") { confirmLive() },
        ))
        box.addView(row(
            button("Анкеты") { openWeb(WebActivity.MODE_FORMS) },
            button("Журнал") { showJournal() },
            button("Стоп") { RunWorker.stop(this) },
        ))
        box.addView(header("Лог"))
        logView = TextView(this).apply { textSize = 12f; setTextIsSelectable(true) }
        box.addView(logView)
        logScroll = ScrollView(this).apply { addView(box) }
        setContentView(logScroll)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                while (true) {
                    refresh()
                    delay(1500)
                }
            }
        }
    }

    private data class Snapshot(val log: String, val pending: Int, val today: Int, val running: Boolean)

    private suspend fun refresh() {
        val (log, pending, today, running) = withContext(Dispatchers.IO) {
            val infos = WorkManager.getInstance(this@MainActivity).getWorkInfosForUniqueWork(RunWorker.ONE_SHOT).get()
            val db = Db(this@MainActivity)
            Snapshot(
                RunLog.read(this@MainActivity),
                db.pendingBrowser().size,
                db.appliedToday(),
                infos.any { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED },
            )
        }
        val hhOk = HhApi(this).isAuthorized
        status.text = buildString {
            append(if (hhOk) "✅ API hh подключено" else "❌ API hh не подключено").append("\n")
            append(if (Prefs.get(this@MainActivity, "ru_resume_id").isNotBlank()) "✅ Резюме выбрано" else "❌ Резюме hh не выбрано").append("\n")
            append(if (Prefs.get(this@MainActivity, "ru_resume_text").isNotBlank()) "✅ Текст резюме RU загружен" else "❌ Текст резюме RU пуст").append("\n")
            append(if (Prefs.get(this@MainActivity, "en_resume_text").isNotBlank()) "✅ Текст резюме EN загружен" else "— Текст резюме EN пуст").append("\n")
            append("Откликов сегодня: $today · Анкет ждут: $pending")
            if (running) append("\n⏳ Идёт запуск…")
        }
        if (running) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (logView.text.toString() != log) logView.text = log
    }

    private fun openWeb(mode: String) = startActivity(Intent(this, WebActivity::class.java).putExtra(WebActivity.EXTRA_MODE, mode))

    private fun confirmLive() {
        AlertDialog.Builder(this)
            .setTitle("Откликнуться по-настоящему?")
            .setMessage("Отклики уйдут работодателям. Сначала лучше сделать пробный прогон и посмотреть письма.")
            .setPositiveButton("Да") { _, _ -> RunWorker.runNow(this, dry = false) }
            .setNegativeButton("Отмена", null)
            .show()
    }

    private fun chooseResumes() {
        lifecycleScope.launch {
            val items: JSONArray = try {
                withContext(Dispatchers.IO) { HhApi(this@MainActivity).myResumes() }
            } catch (e: Exception) {
                toast("Ошибка: ${e.message}"); return@launch
            }
            if (items.length() == 0) { toast("На hh.ru нет резюме"); return@launch }
            val ids = (0 until items.length()).map { items.getJSONObject(it).getString("id") }
            val titles = (0 until items.length()).map { items.getJSONObject(it).optString("title") }.toTypedArray()
            pick("Резюме для РУССКИХ вакансий", titles) { i ->
                Prefs.set(this@MainActivity, "ru_resume_id", ids[i]); Prefs.set(this@MainActivity, "ru_title", titles[i])
                pick("Резюме для АНГЛИЙСКИХ вакансий", titles) { j ->
                    Prefs.set(this@MainActivity, "en_resume_id", ids[j]); Prefs.set(this@MainActivity, "en_title", titles[j])
                    toast("Сохранено")
                }
            }
        }
    }

    private fun pick(title: String, items: Array<String>, onPick: (Int) -> Unit) {
        AlertDialog.Builder(this).setTitle(title).setItems(items) { _, i -> onPick(i) }.show()
    }

    private fun importResume(uri: Uri, lang: String) {
        lifecycleScope.launch {
            toast("Читаю резюме…")
            try {
                val text = withContext(Dispatchers.IO) {
                    val bytes = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                    File(filesDir, "resume_$lang.pdf").writeBytes(bytes)
                    val claude = Llm(this@MainActivity) {}.claude
                        ?: throw LlmException("Для чтения PDF нужен ключ Claude. Либо вставьте текст резюме в настройках вручную.")
                    claude.extractPdfText(bytes)
                }
                Prefs.set(this@MainActivity, "${lang}_resume_text", text)
                toast("Резюме ${lang.uppercase()} загружено (${text.length} символов)")
            } catch (e: Exception) {
                toast("Ошибка: ${e.message}")
            }
        }
    }

    private fun showJournal() {
        lifecycleScope.launch {
            val all = withContext(Dispatchers.IO) { Db(this@MainActivity).list() }
            if (all.isEmpty()) { toast("Журнал пуст"); return@launch }
            // Фильтры журнала со счётчиками
            val filters = listOf<Pair<String, (Application) -> Boolean>>(
                "Все" to { _ -> true },
                "Отправленные" to { a -> a.status == "applied" },
                "Пробные (письма без отправки)" to { a -> a.status == "dry_run" },
                "Ждут анкету" to { a -> a.status == "needs_browser" },
                "Пропущенные и ошибки" to { a -> a.status in setOf("manual", "skipped", "failed") },
            )
            val labels = filters.map { (name, f) -> "$name — ${all.count(f)}" }.toTypedArray()
            pick("Журнал откликов", labels) { fi ->
                val apps = all.filter(filters[fi].second)
                if (apps.isEmpty()) { toast("Здесь пусто"); return@pick }
                val names = apps.map {
                    "${Db.STATUS_RU[it.status] ?: it.status} · ${Sources.byKey(it.channel)?.name ?: Db.CHANNEL_RU[it.channel] ?: it.channel}\n${it.title} — ${it.employer}\n${it.createdAt}"
                }.toTypedArray()
                pick(filters[fi].first, names) { i -> showApplication(apps[i]) }
            }
        }
    }

    private fun showApplication(a: Application) {
        val lang = if (a.language == "en") "английский" else "русский"
        AlertDialog.Builder(this)
            .setTitle(a.title)
            .setMessage(
                "${a.employer}\n${Db.STATUS_RU[a.status] ?: a.status} · ${Db.CHANNEL_RU[a.channel] ?: Sources.byKey(a.channel)?.name ?: a.channel}\n" +
                    "Язык: $lang · ${a.createdAt}\n\n${a.letter.ifBlank { "(письма нет)" }}",
            )
            .setPositiveButton("Открыть вакансию") { _, _ -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(a.url))) }
            .setNeutralButton("Копировать письмо") { _, _ ->
                getSystemService(android.content.ClipboardManager::class.java)
                    .setPrimaryClip(android.content.ClipData.newPlainText("letter", a.letter))
                toast("Письмо скопировано")
            }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
