package ru.hhautoapply

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.coroutines.resume

/**
 * Встроенный браузер:
 *  oauth — авторизация приложения в API hh;
 *  login — вход на hh.ru (cookies нужны для вакансий с тестом);
 *  forms — по очереди открывает анкеты и заполняет их с помощью нейросети.
 */
class WebActivity : ComponentActivity() {
    companion object {
        const val EXTRA_MODE = "mode"
        const val MODE_OAUTH = "oauth"
        const val MODE_LOGIN = "login"
        const val MODE_FORMS = "forms"
    }

    private lateinit var web: WebView
    private lateinit var info: TextView
    private lateinit var mode: String

    // очередь анкет
    private var queue: List<Application> = emptyList()
    private var index = 0
    private var steps = 0
    private val seenSignatures = mutableSetOf<String>()
    private var filling = false
    private var llm: Llm? = null
    private var oauthHandled = false

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val pickFile = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        fileCallback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_LOGIN

        info = label("", 13f).apply { setPadding(dp(8), dp(4), dp(8), dp(4)) }
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.webViewClient = Client()
        web.webChromeClient = Chrome()

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(info)
        root.addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        when (mode) {
            MODE_FORMS -> root.addView(row(
                button("Заполнить") { fillCurrent(force = true) },
                button("Письмо") { copyLetter() },
                button("Отправлено ✓") { mark("applied") },
                button("Пропуск") { mark("manual") },
            ))
            else -> root.addView(button("Готово") { CookieManager.getInstance().flush(); finish() })
        }
        setContentView(root)

        when (mode) {
            MODE_OAUTH -> startOauth()
            MODE_LOGIN -> { info.text = "Войдите в свой аккаунт hh.ru и нажмите «Готово»."; web.loadUrl("https://hh.ru/account/login") }
            MODE_FORMS -> startForms()
        }
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush()
    }

    // ---------- OAuth ----------
    private fun startOauth() {
        if (Prefs.get(this, "hh_client_id").isBlank()) {
            toast("Сначала укажите Client ID и Secret в настройках"); finish(); return
        }
        info.text = "Разрешите доступ приложению."
        web.loadUrl(HhApi(this).authorizeUrl())
    }

    private fun handleRedirect(uri: Uri): Boolean {
        val redirect = Prefs.get(this, "hh_redirect_uri").trim()
        if (mode != MODE_OAUTH || redirect.isEmpty() || !uri.toString().startsWith(redirect)) return false
        if (oauthHandled) return true
        oauthHandled = true
        val code = uri.getQueryParameter("code")
        if (code == null) { toast("hh не вернул код: ${uri.getQueryParameter("error")}"); finish(); return true }
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { HhApi(this@WebActivity).exchangeCode(code) }
                toast("API hh подключено ✅")
            } catch (e: Exception) {
                toast("Ошибка авторизации: ${e.message}")
            }
            finish()
        }
        return true
    }

    // ---------- Анкеты ----------
    private fun startForms() {
        queue = Db(this).pendingBrowser()
        if (queue.isEmpty()) { toast("Анкет в очереди нет"); finish(); return }
        try { llm = Llm(this) { } } catch (e: Exception) { toast(e.message.orEmpty()); finish(); return }
        index = 0
        openCurrent()
    }

    private val current get() = queue.getOrNull(index)

    private fun openCurrent() {
        val a = current ?: run { toast("Все анкеты пройдены"); finish(); return }
        steps = 0
        seenSignatures.clear()
        info.text = "${index + 1}/${queue.size}: ${a.title} — ${a.employer}\nЗагружаю…"
        web.loadUrl(a.formUrl)
    }

    private fun mark(status: String) {
        current?.let { Db(this).setStatus(it.vacancyId, status) }
        index++
        openCurrent()
    }

    private fun copyLetter() {
        val a = current ?: return
        getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("letter", a.letter))
        toast("Письмо скопировано")
    }

    private suspend fun js(code: String): String = suspendCancellableCoroutine { cont ->
        web.evaluateJavascript(code) { cont.resume(it ?: "null") }
    }

    private fun fillCurrent(force: Boolean = false) {
        val a = current ?: return
        val model = llm ?: return
        if (filling) return
        if (!force && steps >= 6) return
        filling = true
        lifecycleScope.launch {
            try {
                js(assets.open("fill.js").bufferedReader().readText())
                val raw = js(assets.open("collect.js").bufferedReader().readText())
                val all = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
                val fields = JSONArray()
                var needsLogin = false
                for (i in 0 until all.length()) {
                    val f = all.getJSONObject(i)
                    if (f.optString("type") == "password") needsLogin = true
                    if (!Text.forbidden.containsMatchIn(fieldText(f))) fields.put(f)
                }
                val head = "${index + 1}/${queue.size}: ${a.title} — ${a.employer}\n"
                if (needsLogin && mode == MODE_FORMS) {
                    info.text = head + "Сайт просит войти или зарегистрироваться — сделайте это вручную, затем «Заполнить»."
                    return@launch
                }
                if (fields.length() == 0) { info.text = head + "Полей анкеты не найдено."; return@launch }
                val sig = (0 until fields.length()).joinToString("|") { fields.getJSONObject(it).optString("id") + fieldText(fields.getJSONObject(it)) }
                if (!force && !seenSignatures.add(sig)) return@launch
                steps++

                info.text = head + "Нейросеть заполняет ${fields.length()} полей…"
                val answers = withContext(Dispatchers.IO) { askLlm(model, a, fields) }
                var filled = 0
                for (i in 0 until fields.length()) {
                    for (call in fillCalls(fields.getJSONObject(i), answers)) {
                        if (js(call).contains("ok")) filled++
                    }
                }
                val autoSubmit = Prefs.bool(this@WebActivity, "auto_submit")
                if (autoSubmit) {
                    val clicked = js("window.__aaSubmit()")
                    info.text = head + "Заполнено полей: $filled. Нажата кнопка $clicked. Проверьте результат и нажмите ✓."
                } else {
                    info.text = head + "Заполнено полей: $filled. Файл резюме прикрепите тапом по полю. " +
                        "Проверьте анкету, отправьте её на сайте и нажмите «Отправлено ✓»."
                }
            } catch (e: Exception) {
                info.text = "Ошибка: ${e.message}"
            } finally {
                filling = false
            }
        }
    }

    private fun askLlm(model: Llm, a: Application, fields: JSONArray): JSONObject {
        val system = Letters.FORM_SYSTEM
            .replace("%SALARY%", Prefs.get(this, "salary_answer"))
            .replace("%RESUME%", Prefs.get(this, if (a.language == "en") "en_title" else "ru_title"))
        val resume = Prefs.get(this, if (a.language == "en") "en_resume_text" else "ru_resume_text")
            .ifBlank { Prefs.get(this, "ru_resume_text") }
        val user = "ПОЛЯ ФОРМЫ:\n$fields\n\nПРОФИЛЬ КАНДИДАТА:\n${Prefs.profileJson(this)}\n\n" +
            "ВАКАНСИЯ: ${a.title} — ${a.employer}\n\nСОПРОВОДИТЕЛЬНОЕ ПИСЬМО:\n${a.letter}\n\nРЕЗЮМЕ:\n${resume.take(6000)}"
        val data = model.completeJson(system, user)
        return data.optJSONObject("answers") ?: data
    }

    /** JS-вызовы для заполнения одного поля. Зарплату подставляем сами, не доверяя модели. */
    private fun fillCalls(f: JSONObject, answers: JSONObject): List<String> {
        val id = f.getString("id")
        val type = f.optString("type")
        val salary = Prefs.get(this, "salary_answer")
        val value = answers.opt(id)
        fun call(target: String, v: String = "") = "window.__aaFill(${JSONObject.quote(target)}, ${JSONObject.quote(v)})"
        return when (type) {
            "file" -> emptyList()
            "radio" -> {
                val opts = f.optJSONArray("options") ?: JSONArray()
                val pairs = (0 until opts.length()).map { opts.getJSONObject(it).let { o -> o.getString("id") to o.optString("label") } }
                var chosen = (value as? String)?.takeIf { v -> pairs.any { it.first == v } }
                if (Text.salary.containsMatchIn(f.optString("question"))) chosen = Text.salaryOption(pairs, salary) ?: chosen
                listOfNotNull(chosen?.let { call(it) })
            }
            "checkbox" -> {
                val arr = value as? JSONArray ?: return emptyList()
                (0 until arr.length()).map { call(arr.getString(it)) }
            }
            else -> {
                val v = if (Text.salary.containsMatchIn(fieldText(f))) salary
                else if (value == null || value == JSONObject.NULL) return emptyList() else value.toString()
                if (v.isBlank()) emptyList() else listOf(call(id, v))
            }
        }
    }

    private fun fieldText(f: JSONObject) = listOf("label", "name", "question").joinToString(" ") { f.optString(it) }

    private fun resumeUri(): Uri? {
        val lang = current?.language ?: "ru"
        val file = listOf(File(filesDir, "resume_$lang.pdf"), File(filesDir, "resume_ru.pdf")).firstOrNull { it.exists() } ?: return null
        return FileProvider.getUriForFile(this, "$packageName.files", file)
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    // ---------- WebView ----------
    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (handleRedirect(uri)) return true
            // Не даём сайту открыть внешнее приложение (intent://, hhru:// и т.п.)
            return uri.scheme != "http" && uri.scheme != "https"
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            if (mode == MODE_OAUTH && handleRedirect(Uri.parse(url))) view.stopLoading()
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (mode != MODE_FORMS) return
            lifecycleScope.launch {
                delay(2500) // даём SPA дорисовать форму
                fillCurrent()
            }
        }
    }

    private inner class Chrome : WebChromeClient() {
        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            val uri = resumeUri()
            if (uri != null) {
                callback.onReceiveValue(arrayOf(uri))
                toast("Прикреплено резюме")
            } else {
                fileCallback = callback
                pickFile.launch(arrayOf("*/*"))
            }
            return true
        }
    }
}
