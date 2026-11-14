package ru.hhautoapply

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import kotlin.coroutines.coroutineContext
import kotlin.coroutines.resume
import kotlin.random.Random

/**
 * Автопилот через сайты: hh.ru без API (если выбран режим «сайт») и очередь «Анкеты» с других площадок.
 * Режим EXTRA_URL — один отклик на открытой странице (кнопка «Агент» на площадках с подтверждением).
 * Работает, пока экран открыт; экран не гаснет. Лучше запускать на зарядке.
 */
class AgentActivity : ComponentActivity() {
    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_SOURCE = "source"
        const val EXTRA_AUTOSTART = "autostart"
    }

    private lateinit var web: WebView
    private lateinit var info: TextView
    private lateinit var startBtn: Button
    private lateinit var limitField: android.widget.EditText
    private lateinit var doneBtn: Button
    private lateinit var skipBtn: Button
    private var agent: BrowserAgent? = null
    private var session: Job? = null
    private var humanWait: CompletableDeferred<Boolean>? = null
    private var resumeLang = "ru"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Агент"
        info = label("Нажмите «Старт». Агент будет откликаться сам; если нужна ваша помощь — попросит.", 13f)
            .apply { setPadding(dp(8), dp(4), dp(8), dp(4)) }
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.scheme != "http" && request.url.scheme != "https"
            override fun onPageFinished(view: WebView, url: String) { agent?.onPageFinished() }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                val file = listOf(File(filesDir, "resume_$resumeLang.pdf"), File(filesDir, "resume_ru.pdf")).firstOrNull { it.exists() }
                callback.onReceiveValue(file?.let { arrayOf(FileProvider.getUriForFile(this@AgentActivity, "$packageName.files", it)) })
                if (file == null) toast("Файл резюме не загружен (кнопки «PDF резюме» на главном экране)")
                return true
            }
        }

        limitField = android.widget.EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setText(Prefs.get(this@AgentActivity, "agent_limit"))
            hint = "50"
        }
        startBtn = button("Старт") { toggle() }
        doneBtn = button("Готово") { humanWait?.complete(true) }.apply { isEnabled = false }
        skipBtn = button("Пропустить") { humanWait?.complete(false) }.apply { isEnabled = false }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(info)
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(8), 0, dp(8), 0)
            addView(label("Лимит откликов за сессию:", 13f))
            addView(limitField, LinearLayout.LayoutParams(dp(90), LinearLayout.LayoutParams.WRAP_CONTENT))
        })
        root.addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(row(startBtn, doneBtn, skipBtn))
        setContentView(root)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val llm = try { Llm(this) { RunLog.add(this, it) } } catch (e: Exception) {
            info.text = "⚠ ${e.message}"; startBtn.isEnabled = false; return
        }
        agent = BrowserAgent(this, web, llm, ::setStatus, ::askHuman, ::askConfirm)

        val url = intent.getStringExtra(EXTRA_URL)
        if (url != null) {
            web.loadUrl(url)
            info.text = "Агент откликнется на вакансию на этой странице. Если нужно, откройте вакансию и нажмите «Старт»."
        } else if (intent.getBooleanExtra(EXTRA_AUTOSTART, false)) {
            toggle()
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    private fun toggle() {
        if (session?.isActive == true) {
            session?.cancel()
            humanWait?.complete(false)
            startBtn.text = "Старт"
            setStatus("Остановлено.")
            return
        }
        limitField.text.toString().trim().toIntOrNull()?.let { Prefs.set(this, "agent_limit", it.toString()) }
        startBtn.text = "Стоп"
        session = lifecycleScope.launch {
            try {
                if (intent.getStringExtra(EXTRA_URL) != null) runSingle() else runSession()
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                setStatus("Ошибка: ${e.message}")
                RunLog.add(this@AgentActivity, "Агент: ошибка — ${e.message}")
            } finally {
                startBtn.text = "Старт"
            }
        }
    }

    // ---------- UI-колбэки агента ----------
    private fun setStatus(s: String) = runOnUiThread { info.text = s }

    private suspend fun askHuman(reason: String): Boolean = withContext(Dispatchers.Main) {
        val wait = CompletableDeferred<Boolean>()
        humanWait = wait
        doneBtn.isEnabled = true; skipBtn.isEnabled = true
        info.text = "✋ $reason\nСделайте это в окне ниже и нажмите «Готово» или «Пропустить»."
        RunLog.add(this@AgentActivity, "  нужен человек: $reason")
        RunWorker.attention(this@AgentActivity, reason)
        try { wait.await() } finally {
            doneBtn.isEnabled = false; skipBtn.isEnabled = false; humanWait = null
            RunWorker.clearAttention(this@AgentActivity)
        }
    }

    private suspend fun askConfirm(question: String): Boolean = withContext(Dispatchers.Main) {
        suspendCancellableCoroutine { cont ->
            AlertDialog.Builder(this@AgentActivity).setTitle("Подтверждение").setMessage(question)
                .setPositiveButton("Отправить") { _, _ -> if (cont.isActive) cont.resume(true) }
                .setNegativeButton("Пропустить") { _, _ -> if (cont.isActive) cont.resume(false) }
                .setOnCancelListener { if (cont.isActive) cont.resume(false) }
                .show()
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    // ---------- сессии ----------
    private fun log(s: String) = RunLog.add(this, s)

    private fun statusOf(o: Outcome) = when (o) {
        Outcome.DONE, Outcome.HUMAN_DONE -> "applied"
        Outcome.SKIPPED -> "manual"
        Outcome.FAILED -> "failed"
    }

    private suspend fun letterFor(title: String, employer: String, description: String, lang: String): String =
        withContext(Dispatchers.IO) {
            val llm = Llm(this@AgentActivity) { log(it) }
            val v = JSONObject().put("name", title).put("employer", JSONObject().put("name", employer)).put("description", description)
            val resume = Prefs.get(this@AgentActivity, if (lang == "en") "en_resume_text" else "ru_resume_text")
                .ifBlank { Prefs.get(this@AgentActivity, "ru_resume_text") }
            Letters.write(llm, v, lang, resume, Prefs.get(this@AgentActivity, if (lang == "en") "name_en" else "name"),
                Prefs.get(this@AgentActivity, "en_cv_url"))
        }

    private fun needConfirm(sourceKey: String) =
        Prefs.bool(this, "agent_confirm") || sourceKey == "linkedin" // LinkedIn — всегда с подтверждением (риск бана)

    private suspend fun pause() {
        val lo = maxOf(15, Prefs.int(this, "delay_min"))
        val hi = maxOf(lo, Prefs.int(this, "delay_max"))
        val sec = (lo..hi).random()
        setStatus("Пауза $sec с, чтобы не выглядеть как бот…")
        delay(sec * 1000L)
    }

    /** Один отклик на открытой странице. */
    private suspend fun runSingle() {
        val a = agent ?: return
        val source = intent.getStringExtra(EXTRA_SOURCE).orEmpty()
        setStatus("Читаю вакансию и пишу письмо…")
        val title = withContext(Dispatchers.Main) { web.title.orEmpty() }
        val text = a.call("window.__ag.bodyText()")
        val lang = Text.detectLanguage("$title $text").also { resumeLang = it }
        val letter = letterFor(title, "", text, lang)
        val outcome = a.runGoal(AgentGoal(title, "", letter, lang), needConfirm(source))
        val url = a.currentUrl()
        Db(this).record("$source:${url.hashCode()}", title, "", url, url, lang, statusOf(outcome), source, letter)
        setStatus("Готово: ${Db.STATUS_RU[statusOf(outcome)]}. Можно открыть следующую вакансию и снова нажать «Старт».")
    }

    /** Полная сессия: hh через сайт → очередь «Анкеты». */
    private suspend fun runSession() {
        val a = agent ?: return
        val db = Db(this)
        val limit = Prefs.int(this, "agent_limit").coerceAtLeast(1)
        val dailyCap = Prefs.int(this, "daily_limit")
        var done = 0
        RunLog.clear(this)
        log("Агент: старт сессии, лимит $limit откликов")

        // 1. hh.ru через сайт
        val hh = Sources.byKey("hh")
        if (hh != null && Sources.isOn(this, hh) && !HhMode.useApi(this)) {
            if (a.ensureHhLogin()) {
                val include = Prefs.list(this, "title_include")
                val exclude = Prefs.list(this, "title_exclude")
                val found = a.hhCollect(Prefs.list(this, "queries", Regex("\n")))
                val fresh = found.filter { Text.titleOk(it.title, include, exclude) && !db.seen(it.id) }
                log("hh (сайт): найдено ${found.size}, подходит ${fresh.size}")
                for (v in fresh) {
                    if (!coroutineContext.isActive || done >= limit) break
                    if (db.appliedToday() >= dailyCap) { log("Дневной лимит откликов достигнут"); break }
                    setStatus("hh: открываю «${v.title}»")
                    val (employer, desc, archived) = a.hhOpen(v.id)
                    val url = "https://hh.ru/vacancy/${v.id}"
                    if (archived) { db.record(v.id, v.title, employer, url, "", "", "skipped", "hh_site", error = "archived"); continue }
                    if (Text.isCvHeavy(desc)) { db.record(v.id, v.title, employer, url, "", "", "skipped", "hh_site", error = "computer vision"); continue }
                    val lang = Text.detectLanguage("${v.title} $desc").also { resumeLang = it }
                    setStatus("hh: пишу письмо для «${v.title}»")
                    val letter = try { letterFor(v.title, employer, desc, lang) } catch (e: Exception) {
                        log("  ! письмо не сгенерировано: ${e.message}"); continue
                    }
                    val outcome = a.hhApply(AgentGoal(v.title, employer, letter, lang), needConfirm("hh"))
                    val st = statusOf(outcome)
                    db.record(v.id, v.title, employer, url, url, lang, st, "hh_site", letter)
                    log("• [hh сайт] [$lang] ${v.title} — $employer → ${Db.STATUS_RU[st]}")
                    if (st == "applied") { done++; pause() }
                }
            } else log("hh: вход не выполнен — пропускаю")
        }

        // 2. Очередь «Анкеты» (Хабр, GetMatch, Telegram, удалёнка…). Hacker News — письмом на email, это вручную.
        val queue = db.pendingBrowser().filter { it.channel != "hn" }
        if (queue.isNotEmpty()) log("Очередь «Анкеты»: ${queue.size}")
        for (app in queue) {
            if (!coroutineContext.isActive || done >= limit) break
            val src = Sources.byKey(app.channel)?.name ?: app.channel
            setStatus("$src: «${app.title}»")
            resumeLang = app.language.ifBlank { "ru" }
            a.load(app.formUrl)
            val outcome = a.runGoal(AgentGoal(app.title, app.employer, app.letter, resumeLang), needConfirm(app.channel))
            val st = statusOf(outcome)
            db.setStatus(app.vacancyId, st)
            log("• [$src] ${app.title} → ${Db.STATUS_RU[st]}")
            if (st == "applied") { done++; pause() }
        }

        val summary = "Агент закончил: откликов $done."
        log(summary)
        setStatus("$summary Подробности — в «Журнале».")
        RunWorker.notify(this, "Агент закончил", summary)
    }
}
