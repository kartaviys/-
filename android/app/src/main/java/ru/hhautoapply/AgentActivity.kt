package ru.hhautoapply

import android.app.AlertDialog
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch

/**
 * Пульт агента. Сам агент работает в фоне (AgentEngine внутри фоновой задачи) — можно выключить экран.
 * Здесь видно, что он делает, можно задать лимит, остановить и помочь с капчей/входом.
 * EXTRA_URL — режим одного отклика: откройте вакансию в окне и нажмите «Старт».
 */
class AgentActivity : ComponentActivity() {
    companion object {
        const val EXTRA_URL = "url"
        const val EXTRA_SOURCE = "source"
        const val EXTRA_AUTOSTART = "autostart"
    }

    private lateinit var info: TextView
    private lateinit var promptView: TextView
    private lateinit var startBtn: Button
    private lateinit var doneBtn: Button
    private lateinit var skipBtn: Button
    private lateinit var limitField: EditText
    private lateinit var webBox: FrameLayout
    private var confirmDialog: AlertDialog? = null
    private val single get() = intent.getStringExtra(EXTRA_URL) != null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Агент"
        Prefs.migrate(this)

        info = label("", 13f).apply { setPadding(dp(8), dp(4), dp(8), dp(2)) }
        promptView = label("", 14f).apply { setPadding(dp(8), dp(2), dp(8), dp(2)) }
        limitField = EditText(this).apply { inputType = InputType.TYPE_CLASS_NUMBER; setText(Prefs.get(this@AgentActivity, "agent_limit")) }
        startBtn = button("Старт") { toggle() }
        doneBtn = button("Готово") { AgentEngine.answer(true) }.apply { isEnabled = false }
        skipBtn = button("Пропустить") { AgentEngine.answer(false) }.apply { isEnabled = false }
        webBox = FrameLayout(this)

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(info)
        root.addView(promptView)
        root.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(dp(8), 0, dp(8), 0)
            addView(label(if (single) "Один отклик на открытой вакансии" else "Лимит откликов за сессию:", 13f))
            if (!single) addView(limitField, LinearLayout.LayoutParams(dp(90), LinearLayout.LayoutParams.WRAP_CONTENT))
        })
        root.addView(webBox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(row(startBtn, doneBtn, skipBtn))
        root.addView(label("Агент работает в фоне — экран можно выключить. Если понадобится помощь (капча, вход), придёт уведомление.", 11f)
            .apply { setPadding(dp(8), 0, dp(8), dp(4)) })
        setContentView(root)

        // Наблюдаем за движком, пока окно на экране
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { AgentEngine.status.collect { info.text = it } }
                launch { AgentEngine.running.collect { startBtn.text = if (it) "Стоп" else "Старт" } }
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
        if (AgentEngine.web != null) AgentEngine.attach(webBox)
    }

    override fun onStop() {
        super.onStop()
        AgentEngine.detach() // браузер остаётся жить в фоне
        android.webkit.CookieManager.getInstance().flush()
    }

    private fun toggle() {
        if (AgentEngine.running.value) {
            RunWorker.stopAgent(this)
            info.text = "Останавливаю…"
        } else start()
    }

    private fun start() {
        limitField.text.toString().trim().toIntOrNull()?.let { Prefs.set(this, "agent_limit", it.toString()) }
        if (!single) RunLog.clear(this)
        RunWorker.startAgent(this, single, intent.getStringExtra(EXTRA_SOURCE).orEmpty())
        info.text = "Запускаю агента…"
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
