package ru.hhautoapply

import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import androidx.activity.ComponentActivity

/** Все агенты: hh, Хабр, LinkedIn и ~20 сайтов (SuperJob, компании РФ, США, ОАЭ, Европа). У каждого — «Войти» и «Агент». */
class AgentsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Все агенты (${Sites.all.size + 3})"
        val box = vbox()
        box.addView(label(
            "У каждого сайта свой агент: свой список «Что искать», лимит и вход. Агент ищет вакансии, отсеивает " +
                "неподходящие (фильтр названий + проверка нейросетью), пишет письмо и откликается. Одновременно работает один агент.\n" +
                "✅ — формат сайта проверен; ⚠️ — не проверен заранее, ссылки на вакансии при необходимости найдёт нейросеть.",
            12f,
        ))

        box.addView(header("Основные"))
        box.addView(card("hh.ru", "✅", "https://hh.ru/account/login", "hh"))
        box.addView(card("Хабр Карьера", "✅", "https://career.habr.com/", "habr"))
        box.addView(card("LinkedIn", "✅", "https://www.linkedin.com/login", "linkedin"))

        for ((group, sites) in Sites.all.groupBy { it.group }) {
            box.addView(header(group))
            for (s in sites) box.addView(card(s.name, if (s.verified) "✅" else "⚠️", s.loginUrl, s.key, s.note))
        }
        setContentView(ScrollView(this).apply { addView(box) })
    }

    private fun card(name: String, badge: String, loginUrl: String?, target: String, note: String = ""): LinearLayout {
        val c = vbox(8).apply {
            background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setStroke(dp(1), Color.parseColor("#D0D7DE")) }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                .apply { setMargins(0, dp(3), 0, dp(5)) }
        }
        c.addView(label("$badge  $name", 16f))
        if (note.isNotBlank()) c.addView(label(note, 11f))
        val login = button(if (loginUrl != null) "Войти" else "Открыть сайт") {
            startActivity(Intent(this, WebActivity::class.java)
                .putExtra(WebActivity.EXTRA_MODE, WebActivity.MODE_LOGIN)
                .putExtra(WebActivity.EXTRA_URL, loginUrl ?: Sites.byKey(target)?.search?.invoke("data scientist", 0))
                .putExtra(WebActivity.EXTRA_SOURCE, name))
        }
        val agent = button("🤖 Агент") {
            startActivity(Intent(this, AgentActivity::class.java)
                .putExtra(AgentActivity.EXTRA_TARGET, target)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
        }
        c.addView(row(login, agent))
        return c
    }
}
