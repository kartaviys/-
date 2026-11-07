package ru.hhautoapply

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.Toast
import androidx.activity.ComponentActivity

/** Список площадок: включить/выключить, инструкция по подключению, открыть поиск. */
class SourcesActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Источники вакансий"
        val box = vbox()
        box.addView(label(
            "🤖 hh.ru — поиск и отклик полностью автоматически через API.\n" +
                "📥 Авто-сбор — вакансии собираются при каждом запуске, письмо пишется заранее, " +
                "отклик — из «Анкет» во встроенном браузере (ИИ заполняет форму, вы подтверждаете).\n" +
                "🧭 С подтверждением — площадки без открытого API: «Открыть» → вакансия → «Отклик с ИИ».",
            13f,
        ))
        box.addView(button("Настройки источников: запросы, Telegram-каналы, сайты компаний") {
            startActivity(Intent(this, SettingsActivity::class.java))
        })

        for ((group, sources) in Sources.all.groupBy { it.group }) {
            box.addView(header(group))
            for (s in sources) box.addView(card(s))
        }
        setContentView(ScrollView(this).apply { addView(box) })
    }

    private fun card(s: Source): LinearLayout {
        val card = vbox(10).apply {
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setStroke(dp(1), Color.parseColor("#D0D7DE"))
            }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { setMargins(0, dp(4), 0, dp(6)) }
        }
        val badge = when (s.kind) {
            Kind.HH_API -> "🤖 автоотклик через API"
            Kind.AUTO -> "📥 авто-сбор, отклик в «Анкетах»"
            Kind.ASSISTED -> "🧭 с подтверждением"
        }
        val sw = Switch(this).apply {
            text = s.name
            textSize = 16f
            isChecked = Sources.isOn(this@SourcesActivity, s)
            setOnCheckedChangeListener { _, on ->
                Sources.setOn(this@SourcesActivity, s, on)
                Toast.makeText(this@SourcesActivity, "${s.name}: ${if (on) "включено" else "выключено"}", Toast.LENGTH_SHORT).show()
            }
        }
        card.addView(sw)
        card.addView(label(badge, 12f))
        card.addView(row(
            button("Инструкция") {
                AlertDialog.Builder(this).setTitle(s.name).setMessage(s.instructions).setPositiveButton("Понятно", null).show()
            },
            button("Открыть") { open(s) },
        ))
        return card
    }

    private fun open(s: Source) {
        if (s.key == "careers") {
            val sites = Prefs.list(this, "career_sites", Regex("\n"))
            if (sites.isEmpty()) { Toast.makeText(this, "Добавьте сайты в настройках источников", Toast.LENGTH_LONG).show(); return }
            AlertDialog.Builder(this).setTitle("Карьерные сайты")
                .setItems(sites.map { it.removePrefix("https://").removePrefix("www.") }.toTypedArray()) { _, i -> openUrl(s, sites[i]) }
                .show()
            return
        }
        openUrl(s, s.searchUrl(Sources.mainQuery(this, s)))
    }

    private fun openUrl(s: Source, url: String) {
        startActivity(Intent(this, WebActivity::class.java)
            .putExtra(WebActivity.EXTRA_MODE, WebActivity.MODE_ASSIST)
            .putExtra(WebActivity.EXTRA_URL, url)
            .putExtra(WebActivity.EXTRA_SOURCE, s.key))
    }
}
