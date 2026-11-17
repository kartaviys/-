package ru.hhautoapply

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Пульт агента (hh или LinkedIn — EXTRA_TARGET). Сам агент работает в фоне (AgentEngine внутри фоновой задачи),
 * экран можно выключить. Здесь: что искать (редактируемый список), лимит, старт/стоп, помощь с капчей/входом.
 * EXTRA_URL — режим одного отклика: откройте вакансию в окне и нажмите «Старт».
 */
class AgentActivity : ComponentActivity() {
    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_SOURCE = "source"
        const val EXTRA_AUTOSTART = "autostart"
        const val EXTRA_TARGET = "target"   // "hh" (по умолчанию) или "linkedin"
    }

    private lateinit var info: TextView
    private lateinit var promptView: TextView
    private lateinit var startBtn: Button
    private lateinit var doneBtn: Button
    private lateinit var skipBtn: Button
    private lateinit var limitField: EditText
    private lateinit var queriesField: EditText
    private lateinit var webBox: FrameLayout
    private var confirmDialog: AlertDialog? = null

    private val single get() = intent.getStringExtra(EXTRA_URL) != null
    private val target get() = intent.getStringExtra(EXTRA_TARGET) ?: "hh"
    private val isLinkedIn get() = target == "linkedin"
    private val limitKey get() = if (isLinkedIn) "linkedin_limit" else "agent_limit"
    private val queriesKey get() = if (isLinkedIn) "linkedin_queries" else "queries"
    private val agentName get() = if (isLinkedIn) "LinkedIn" else "hh"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Prefs.migrate(this)
        buildUi()
    }

    /** Окно могли открыть заново с другим агентом (hh ↔ LinkedIn) — пересобираем под новый intent. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        AgentEngine.detach()
        recreate()
    }

    private fun buildUi() {
        title = if (single) "Агент: одна вакансия" else "Агент $agentName"

        info = label("", 13f).apply { setPadding(dp(8), dp(4), dp(8), dp(2)) }
        promptView = label("", 14f).apply { setPadding(dp(8), dp(2), dp(8), dp(2)) }
        limitField = EditText(this).apply { inputType = InputType.TYPE_CLASS_NUMBER; setText(Prefs.get(this@AgentActivity, limitKey)) }
        queriesField = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 3; maxLines = 6
            setText(Prefs.get(this@AgentActivity, queriesKey))
            textSize = 14f
        }
        startBtn = button("Старт") { toggle() }
        doneBtn = button("Готово") { AgentEngine.answer(true) }.apply { isEnabled = false }
        skipBtn = button("Пропустить") { AgentEngine.answer(false) }.apply { isEnabled = false }
        webBox = FrameLayout(this)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(info)
        root.addView(promptView)
        if (!single) {
            // Что искать — прямо здесь, можно редактировать перед стартом
            val queriesBox = vbox(0).apply { setPadding(dp(8), 0, dp(8), 0) }
            queriesBox.addView(label("Что искать на $agentName — по одной вакансии на строку (ищется по названию):", 12f))
            queriesBox.addView(queriesField)
            queriesBox.addView(LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(label("Лимит откликов за сессию:", 13f))
                addView(limitField, LinearLayout.LayoutParams(dp(90), LinearLayout.LayoutParams.WRAP_CONTENT))
            })
            val toggleQueries = button("✏️ Что искать и лимит (скрыть)") {}
            toggleQueries.setOnClickListener {
                val show = queriesBox.visibility != View.VISIBLE
                queriesBox.visibility = if (show) View.VISIBLE else View.GONE
                toggleQueries.text = if (show) "✏️ Что искать и лимит (скрыть)" else "✏️ Что искать и лимит (показать)"
            }
            root.addView(toggleQueries)
            root.addView(queriesBox)
        } else {
            root.addView(label("Откройте вакансию в окне ниже и нажмите «Старт» — агент откликнется на неё.", 13f)
                .apply { setPadding(dp(8), 0, dp(8), 0) })
        }
        root.addView(webBox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(row(startBtn, doneBtn, skipBtn))
        root.addView(label("Работает в фоне — экран можно выключить. Нужна помощь (капча, вход) — придёт уведомление.", 11f)
            .apply { setPadding(dp(8), 0, dp(8), dp(4)) })
        setContentView(root)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { AgentEngine.status.collect { info.text = it } }
                launch { AgentEngine.running.collect { refreshStartButton() } }
                launch { AgentEngine.target.collect { refreshStartButton() } }
                launch { AgentEngine.prompt.collect { showPrompt(it) } }
            }
        }

        lifecycleScope.launch {
            val w = AgentEngine.ensureWeb(this@AgentActivity)
            AgentEngine.attach(webBox)
            intent.getStringExtra(EXTRA_URL)?.let { if (!AgentEngine.running.value) w.loadUrl(it) }
            if (intent.getBooleanExtra(EXTRA_AUTOSTART, false) && !AgentEngine.running.value) start()
        }
    }

    override fun onStart() {
        super.onStart()
        if (AgentEngine.web != null && ::webBox.isInitialized) AgentEngine.attach(webBox)
    }

    override fun onStop() {
        super.onStop()
        saveFields()
        AgentEngine.detach() // браузер остаётся жить в фоне
        android.webkit.CookieManager.getInstance().flush()
    }

    /** Чей агент сейчас работает: этот — «Стоп», другой — подсказка. */
    private fun refreshStartButton() {
        val running = AgentEngine.running.value
        val other = AgentEngine.target.value
        val mine = other == target || (single && other == "single")
        startBtn.text = when {
            running && mine -> "Стоп"
            running -> "Остановить ${if (other == "linkedin") "LinkedIn" else "hh"} и запустить $agentName"
            else -> "Старт"
        }
    }

    private fun saveFields() {
        if (single || !::queriesField.isInitialized) return
        limitField.text.toString().trim().toIntOrNull()?.let { Prefs.set(this, limitKey, it.toString()) }
        val q = queriesField.text.toString().lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (q.isNotEmpty()) Prefs.set(this, queriesKey, q.joinToString("\n"))
    }

    private fun toggle() {
        val running = AgentEngine.running.value
        val mine = AgentEngine.target.value == target || (single && AgentEngine.target.value == "single")
        when {
            running && mine -> { RunWorker.stopAgent(this); RunWorker.stop(this); info.text = "Останавливаю…" }
            running -> switchAgent()
            else -> start()
        }
    }

    /** Работает другой агент: останавливаем его и запускаем этот. */
    private fun switchAgent() {
        info.text = "Останавливаю другого агента…"
        RunWorker.stopAgent(this)
        RunWorker.stop(this)
        lifecycleScope.launch {
            repeat(40) {
                if (!AgentEngine.running.value) { start(); return@launch }
                delay(500)
            }
            Toast.makeText(this@AgentActivity, "Другой агент ещё останавливается — нажмите «Старт» через несколько секунд", Toast.LENGTH_LONG).show()
        }
    }

    private fun start() {
        saveFields()
        if (!single) RunLog.clear(this)
        RunWorker.startAgent(this, single, intent.getStringExtra(EXTRA_SOURCE).orEmpty(), if (single) "hh" else target)
        info.text = "Запускаю агента $agentName…"
    }

    private fun showPrompt(p: AgentEngine.Prompt?) {
        confirmDialog?.dismiss(); confirmDialog = null
        when (p) {
            null -> { promptView.text = ""; doneBtn.isEnabled = false; skipBtn.isEnabled = false }
            is AgentEngine.Prompt.Human -> {
                promptView.text = "✋ ${p.reason}\nСделайте это в окне ниже и нажмите «Готово» (или «Пропустить»)."
                doneBtn.isEnabled = true; skipBtn.isEnabled = true
            }
            is AgentEngine.Prompt.Confirm -> {
                promptView.text = "❓ ${p.question}"
                confirmDialog = AlertDialog.Builder(this).setTitle("Подтверждение").setMessage(p.question)
                    .setPositiveButton("Отправить") { _, _ -> AgentEngine.answer(true) }
                    .setNegativeButton("Пропустить") { _, _ -> AgentEngine.answer(false) }
                    .setCancelable(false)
                    .show()
            }
        }
    }
}
