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
        Prefs.migrate(this)
        if (Build.VERSION.SDK_INT >= 33) {
            registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
                .launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val box = vbox()

        // ---------- 1. Нейросеть ----------
        box.addView(header("1. Ключ нейросети"))
        val keyField = android.widget.EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            hint = if (Prefs.get(this@MainActivity, "anthropic_key").isNotBlank() || Prefs.get(this@MainActivity, "deepseek_key").isNotBlank())
                "ключ уже сохранён ✅ (можно заменить)" else "Claude «sk-ant-…» или DeepSeek «sk-…»"
        }
        box.addView(keyField)
        box.addView(button("Сохранить ключ") {
            val key = keyField.text.toString().trim()
            when {
                key.isEmpty() -> toast("Вставьте ключ")
                key.startsWith("sk-ant-") -> { Prefs.set(this, "anthropic_key", key); toast("Ключ Claude сохранён ✅") }
                else -> { Prefs.set(this, "deepseek_key", key); toast("Ключ DeepSeek сохранён ✅") }
            }
            if (key.isNotEmpty()) { keyField.setText(""); keyField.hint = "ключ уже сохранён ✅ (можно заменить)" }
        })

        // ---------- 2. hh.ru ----------
        box.addView(header("2. hh.ru"))
        box.addView(row(
            button("Войти на hh.ru") { openLogin("https://hh.ru/account/login", "hh.ru") },
            button("🤖 Агент hh") { openAgent("hh") },
        ))

        // ---------- 3. Хабр Карьера ----------
        box.addView(header("3. Хабр Карьера"))
        box.addView(row(
            button("Войти на Хабр Карьеру") { openLogin("https://career.habr.com/", "Хабр Карьера (кнопка «Войти» вверху)") },
            button("🤖 Агент Хабр") { openAgent("habr") },
        ))

        // ---------- 4. ODS — просто сохраняем вакансии ----------
        box.addView(header("4. ODS — вакансии и контакты HR"))
        box.addView(row(
            button("Обновить вакансии ODS") { refreshOds() },
            button("📌 Сохранённые") { showSaved() },
        ))
        box.addView(row(
            button("Войти на ODS") { openLogin("https://ods.ai/", "ODS (кнопка «Войти» вверху)") },
            button("📇 Найти контакты HR") { enrichOds() },
        ))

        // ---------- 5. LinkedIn ----------
        box.addView(header("5. LinkedIn"))
        box.addView(row(
            button("Войти в LinkedIn") { openLogin("https://www.linkedin.com/login", "LinkedIn") },
            button("🤖 Агент LinkedIn") { openAgent("linkedin") },
        ))

        // ---------- 6. Все остальные агенты ----------
        box.addView(header("6. Ещё ${Sites.all.size} агентов"))
        box.addView(label("SuperJob, GeekJob, Работа.ру, GetMatch · Яндекс, Сбер, Т-Банк, Ozon, VK, Авито, МТС, Касперский · " +
            "США: Dice, Built In, Wellfound, Indeed, Glassdoor · ОАЭ: Bayt, Naukrigulf, GulfTalent, Indeed · Европа: StepStone, Relocate.me", 12f))
        box.addView(button("🌍 Все агенты") { startActivity(Intent(this, AgentsActivity::class.java)) })

        box.addView(row(
            button("Журнал") { showJournal() },
            button("💰 Расходы") {
                AlertDialog.Builder(this).setTitle("Расходы на нейросеть").setMessage(Usage.report(this))
                    .setPositiveButton("Закрыть", null).show()
            },
            button("⏱ Скорость") { showTiming() },
        ))
        box.addView(button("Настройки") { startActivity(Intent(this, SettingsActivity::class.java)) })
        status = label("", 13f)
        box.addView(status)

        // ---------- Дополнительно (свёрнуто) ----------
        val extra = vbox(0).apply { visibility = android.view.View.GONE }
        val toggle = button("▸ Дополнительно: другие площадки, API hh, PDF резюме, анкеты") {}
        toggle.setOnClickListener {
            val show = extra.visibility != android.view.View.VISIBLE
            extra.visibility = if (show) android.view.View.VISIBLE else android.view.View.GONE
            toggle.text = (if (show) "▾" else "▸") + " Дополнительно: другие площадки, API hh, PDF резюме, анкеты"
        }
        box.addView(toggle)
        box.addView(extra)
        extra.addView(button("Источники вакансий (Хабр, Telegram, удалёнка…): вкл/выкл и инструкции") {
            startActivity(Intent(this, SourcesActivity::class.java))
        })
        extra.addView(row(
            button("PDF резюме RU") { pickLang = "ru"; pickPdf.launch(arrayOf("application/pdf")) },
            button("PDF резюме EN") { pickLang = "en"; pickPdf.launch(arrayOf("application/pdf")) },
        ))
        extra.addView(label("Официальный API hh (если hh одобрит приложение):", 12f))
        extra.addView(row(
            button("Войти через API hh") { openWeb(WebActivity.MODE_OAUTH) },
            button("Мои резюме на hh") { chooseResumes() },
        ))
        extra.addView(row(
            button("Пробный прогон") { RunWorker.runNow(this, dry = true) },
            button("Откликнуться (всё)") { confirmLive() },
        ))
        extra.addView(row(
            button("Анкеты") { openWeb(WebActivity.MODE_FORMS) },
            button("Стоп всё") { RunWorker.stop(this); RunWorker.stopAgent(this) },
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
            val c = this@MainActivity
            val llmOk = Prefs.get(c, "anthropic_key").isNotBlank() || Prefs.get(c, "deepseek_key").isNotBlank() || Prefs.get(c, "custom_base_url").isNotBlank()
            append(if (llmOk) "✅ Ключ нейросети сохранён" else "❌ Нет ключа нейросети (шаг 1)").append("\n")
            append(if (hhOk) "✅ API hh подключено" else "ℹ hh работает через сайт — откликается «Агент»").append("\n")
            if (hhOk) append(if (Prefs.get(c, "ru_resume_id").isNotBlank()) "✅ Резюме для API выбрано\n" else "❌ Резюме для API не выбрано («Мои резюме на hh»)\n")
            append(if (Prefs.get(c, "ru_resume_text").isNotBlank()) "✅ Резюме RU есть" else "ℹ Резюме RU возьмёт агент из профиля hh")
            append(" · ")
            append(if (Prefs.get(c, "en_resume_text").isNotBlank()) "✅ EN есть" else "EN — из профиля hh, если есть").append("\n")
            append("Откликов сегодня: $today · Анкет ждут: $pending\n")
            append(Usage.shortLine(c))
            if (running || AgentEngine.running.value) append("\n⏳ Идёт запуск… ${AgentEngine.status.value}")
        }
        if (running) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (logView.text.toString() != log) logView.text = log
    }

    private fun openWeb(mode: String) = startActivity(Intent(this, WebActivity::class.java).putExtra(WebActivity.EXTRA_MODE, mode))

    private fun openLogin(url: String, site: String) = startActivity(Intent(this, WebActivity::class.java)
        .putExtra(WebActivity.EXTRA_MODE, WebActivity.MODE_LOGIN)
        .putExtra(WebActivity.EXTRA_URL, url)
        .putExtra(WebActivity.EXTRA_SOURCE, site))

    private fun refreshOds() {
        toast("Обновляю вакансии ODS…")
        lifecycleScope.launch {
            try {
                val r = withContext(Dispatchers.IO) { Ods.refresh(this@MainActivity) { RunLog.add(this@MainActivity, it) } }
                toast("ODS: новых вакансий ${r.added} (просмотрено постов ${r.seen}). Ищу контакты HR…")
                enrichOds()
            } catch (e: Exception) {
                toast("ODS: ошибка — ${e.message}")
            }
        }
    }

    /** Открывает страницы сохранённых вакансий на ods.ai и собирает контакты HR (нужен вход на ODS, если сайт попросит). */
    private fun enrichOds() {
        lifecycleScope.launch {
            try {
                val r = withContext(Dispatchers.IO) { Ods.enrichContacts(this@MainActivity) { RunLog.add(this@MainActivity, it) } }
                when {
                    r.busy -> toast("Сейчас работает агент — контакты ODS соберу, когда он закончит (нажмите «📇 Найти контакты HR» позже)")
                    r.needLogin -> AlertDialog.Builder(this@MainActivity)
                        .setTitle("Нужен вход на ODS")
                        .setMessage("Контакты HR на ods.ai видны только после входа. Нажмите «Войти», войдите своим аккаунтом ODS, затем снова «📇 Найти контакты HR».")
                        .setPositiveButton("Войти") { _, _ -> openLogin("https://ods.ai/", "ODS (кнопка «Войти» вверху)") }
                        .setNegativeButton("Позже", null).show()
                    r.checked == 0 -> toast("ODS: новых вакансий для поиска контактов нет")
                    else -> { toast("ODS: контакты HR найдены в ${r.withContacts} из ${r.checked} вакансий"); showSaved() }
                }
            } catch (e: Exception) {
                toast("ODS контакты: ошибка — ${e.message}")
            }
        }
    }

    private fun showSaved() {
        lifecycleScope.launch {
            val apps = withContext(Dispatchers.IO) { Db(this@MainActivity).list("status = 'saved'") }
            if (apps.isEmpty()) { toast("Сохранённых вакансий пока нет — нажмите «Обновить вакансии ODS»"); return@launch }
            val names = apps.map { (if (it.letter.startsWith("📇")) "📇 " else "") + "${it.title}\n${it.employer}" }.toTypedArray()
            pick("Сохранённые вакансии ODS (${apps.size})", names) { i -> showApplication(apps[i]) }
        }
    }

    private fun openAgent(target: String) = startActivity(Intent(this, AgentActivity::class.java)
        .putExtra(AgentActivity.EXTRA_TARGET, target)
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))

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
            val all = withContext(Dispatchers.IO) { Db(this@MainActivity).list("status != 'hidden'") }
            if (all.isEmpty()) { toast("Журнал пуст"); return@launch }
            // Фильтры журнала со счётчиками
            val filters = listOf<Pair<String, (Application) -> Boolean>>(
                "Все" to { _ -> true },
                "Отправленные" to { a -> a.status == "applied" },
                "Пробные (письма без отправки)" to { a -> a.status == "dry_run" },
                "Ждут анкету" to { a -> a.status == "needs_browser" },
                "Сохранённые ODS" to { a -> a.status == "saved" },
                "Пропущенные и ошибки" to { a -> a.status in setOf("manual", "skipped", "failed") },
            )
            val labels = filters.map { (name, f) -> "$name — ${all.count(f)}" }.toTypedArray()
            pick("Журнал откликов", labels) { fi ->
                val apps = all.filter(filters[fi].second)
                if (apps.isEmpty()) { toast("Здесь пусто"); return@pick }
                val names = apps.map {
                    "${Db.STATUS_RU[it.status] ?: it.status} · ${Sites.byKey(it.channel)?.name ?: Sources.byKey(it.channel)?.name ?: Db.CHANNEL_RU[it.channel] ?: it.channel}\n${it.title} — ${it.employer}\n${it.createdAt}"
                }.toTypedArray()
                pick(filters[fi].first, names) { i -> showApplication(apps[i]) }
            }
        }
    }

    private fun showApplication(a: Application) {
        val lang = if (a.language == "en") "английский" else "русский"
        val hr = a.channel == "ods" && a.formUrl.isNotBlank() && a.formUrl != a.url
        AlertDialog.Builder(this)
            .setTitle(a.title)
            .setMessage(
                "${a.employer}\n${Db.STATUS_RU[a.status] ?: a.status} · ${Db.CHANNEL_RU[a.channel] ?: Sites.byKey(a.channel)?.name ?: Sources.byKey(a.channel)?.name ?: a.channel}\n" +
                    "Язык: $lang · ${a.createdAt}\n\n${a.letter.ifBlank { "(письма нет)" }}",
            )
            .setPositiveButton("Открыть вакансию") { _, _ -> startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(a.url))) }
            .setNeutralButton(if (hr) "Написать HR" else "Копировать письмо") { _, _ ->
                if (hr) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(a.formUrl))) } catch (e: Exception) { toast("Не удалось открыть ${a.formUrl}") }
                    return@setNeutralButton
                }
                getSystemService(android.content.ClipboardManager::class.java)
                    .setPrimaryClip(android.content.ClipData.newPlainText("letter", a.letter))
                toast("Письмо скопировано")
            }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    /** Мониторинг: за сколько делается отклик на каждом ресурсе (сегодня / 7 / 30 дней). */
    private fun showTiming() {
        AlertDialog.Builder(this).setTitle("⏱ Скорость откликов по ресурсам").setMessage(Timing.report(this))
            .setPositiveButton("Закрыть", null).show()
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
