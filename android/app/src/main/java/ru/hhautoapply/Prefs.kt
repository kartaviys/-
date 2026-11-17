package ru.hhautoapply

import android.content.Context
import android.content.SharedPreferences

enum class FieldType { TEXT, MULTILINE, SECRET, BOOL, NUMBER }

data class Field(val key: String, val label: String, val type: FieldType = FieldType.TEXT, val default: String = "")

data class Section(val title: String, val fields: List<Field>)

object Prefs {
    val sections = listOf(
        Section("hh.ru: режим работы", listOf(
            Field("hh_mode", "auto — API, если подключено, иначе через сайт; api — только API; site — только через сайт (Агент)", default = "auto"),
        )),
        Section("Браузерный агент", listOf(
            Field("agent_confirm", "Спрашивать подтверждение перед каждой отправкой (LinkedIn — всегда)", FieldType.BOOL, "false"),
            Field("agent_limit", "Сколько откликов агент делает за одну сессию", FieldType.NUMBER, "50"),
            Field("agent_max_steps", "Максимум шагов агента на одну вакансию", FieldType.NUMBER, "20"),
        )),
        Section("LinkedIn-агент", listOf(
            Field("linkedin_queries", "Запросы для LinkedIn — по одному на строку", FieldType.MULTILINE, default = listOf(
                "data scientist", "machine learning engineer", "ml engineer", "ai engineer", "nlp engineer",
                "llm engineer", "applied scientist", "data analyst",
            ).joinToString("\n")),
            Field("linkedin_location", "Локация (пусто — по всему миру; например Germany, European Union, Italy)"),
            Field("linkedin_remote", "Только удалёнка (Remote)", FieldType.BOOL, "true"),
            Field("linkedin_senior_only", "Только уровень Mid-Senior", FieldType.BOOL, "false"),
            Field("linkedin_days", "Вакансии за последние N дней", FieldType.NUMBER, "7"),
            Field("linkedin_pages", "Сколько страниц результатов проходить на каждый запрос (по 25; 40 — все)", FieldType.NUMBER, "40"),
            Field("linkedin_limit", "Откликов за одну сессию", FieldType.NUMBER, "20"),
            Field("linkedin_daily_limit", "Откликов в LinkedIn в сутки (больше — риск блокировки)", FieldType.NUMBER, "30"),
            Field("linkedin_delay_min", "Пауза между откликами от, сек", FieldType.NUMBER, "45"),
            Field("linkedin_delay_max", "Пауза между откликами до, сек", FieldType.NUMBER, "120"),
            Field("linkedin_confirm", "Спрашивать подтверждение перед отправкой (рекомендуется)", FieldType.BOOL, "true"),
            Field("linkedin_daily_auto", "Запускать LinkedIn-агента в ежедневном автозапуске", FieldType.BOOL, "false"),
        )),
        Section("hh.ru API (приложение с dev.hh.ru)", listOf(
            Field("hh_client_id", "Client ID"),
            Field("hh_client_secret", "Client Secret", FieldType.SECRET),
            Field("hh_redirect_uri", "Redirect URI (такой же, как в приложении на dev.hh.ru)", default = "https://localhost/hh-autoapply"),
            Field("hh_contact_email", "Ваш email (hh требует его в User-Agent)"),
        )),
        Section("Нейросеть", listOf(
            Field("anthropic_key", "Ключ Claude (sk-ant-…)", FieldType.SECRET),
            Field("deepseek_key", "Ключ DeepSeek (необязательно, запасной)", FieldType.SECRET),
            Field("providers", "Порядок провайдеров через запятую: claude, deepseek, custom (своя модель)", default = "claude,deepseek,custom"),
            Field("strategy", "Стратегия: fallback или round_robin (вперемешку)", default = "fallback"),
            Field("claude_model", "Модель Claude", default = "claude-haiku-5-5"),
            Field("deepseek_model", "Модель DeepSeek", default = "deepseek-chat"),
            Field("daily_budget", "Дневной бюджет на нейросеть, $ (0 — без ограничения)", default = "1"),
        )),
        Section("Своя модель (локальная или любой OpenAI-совместимый API)", listOf(
            Field("custom_base_url", "Адрес API. Ollama на ПК: http://192.168.1.10:11434/v1 · LM Studio: http://192.168.1.10:1234/v1 · " +
                "Ollama в Termux на телефоне: http://127.0.0.1:11434/v1 · OpenRouter: https://openrouter.ai/api/v1"),
            Field("custom_model", "Название модели (например qwen2.5:7b, gemma3:12b)"),
            Field("custom_key", "Ключ API (для локальной модели не нужен)", FieldType.SECRET),
            Field("custom_name", "Как подписывать в расходах", default = "своя модель"),
            Field("custom_timeout", "Таймаут ответа, сек (локальные модели медленные)", FieldType.NUMBER, "300"),
            Field("custom_price_in", "Цена за 1M входных токенов, $ (для локальной — 0)", default = "0"),
            Field("custom_price_out", "Цена за 1M выходных токенов, $ (для локальной — 0)", default = "0"),
        )),
        Section("Поиск", listOf(
            Field("queries", "Запросы для hh — по одному на строку, простыми словами, в порядке важности", FieldType.MULTILINE, default = listOf(
                "data scientist",
                "ml engineer",
                "ml-инженер",
                "machine learning engineer",
                "инженер машинного обучения",
                "специалист по машинному обучению",
                "ai engineer",
                "ai-инженер",
                "llm engineer",
                "nlp engineer",
                "nlp",
                "ml-разработчик",
                "разработчик ml",
                "ai developer",
                "ml-аналитик",
                "ml analyst",
                "аналитик данных",
                "data analyst",
                "applied scientist",
                "research scientist",
                "deep learning",
                "внедрение ии",
                "специалист по ии",
                "промпт-инженер",
                "рекомендательные системы",
                "компьютерный лингвист",
            ).joinToString("\n")),
            Field("title_include", "Название содержит одно из (через запятую)",
                default = "data scien, дата сайент, дата-сайент, анализу данных, ml, machine learning, машинн, ai, ии, искусственн, llm, genai, nlp, естественного языка, natural language, data analyst, аналитик данных, applied scien, research scien, research engineer, ml researcher, ai researcher, исследователь машинн, исследователь ml, исследователь ai, deep learning, нейросет, нейронн, prompt, промпт, generative, генеративн, рекомендательн, recommender, recsys, ranking, ранжирован, decision scien, лингвист, linguist, conversational"),
            Field("title_exclude", "Исключить, если в названии (через запятую)",
                default = "junior, intern, стажер, стажёр, младший, lead, head, руководител, cv, computer vision, зрени, opencv, видеоаналит, image, изображен"),
            Field("area", "Регион hh (пусто — все регионы; 113 — Россия, 1 — Москва, 2 — СПб)", FieldType.NUMBER, ""),
            Field("experience_filter", "Фильтр по опыту на hh (только 3+ лет)", FieldType.BOOL, "false"),
            Field("period", "Вакансии за последние N дней (пусто — без ограничения)", FieldType.NUMBER, ""),
            Field("max_pages", "Сколько страниц результатов проходить на каждый запрос (по 50 вакансий; 40 — все)", FieldType.NUMBER, "40"),
            Field("remote_only", "Только удалёнка", FieldType.BOOL, "false"),
        )),
        Section("Источники (кроме hh)", listOf(
            Field("ru_queries", "Запросы для российских площадок (Хабр, GetMatch, Trudvsem), по одному на строку", FieldType.MULTILINE,
                default = listOf("data scientist", "machine learning", "ML-инженер", "ML engineer", "AI-инженер", "AI engineer", "NLP", "LLM", "аналитик данных", "ML-аналитик", "внедрение ИИ").joinToString("\n")),
            Field("intl_queries", "Запросы для зарубежных площадок (Himalayas, Hacker News, поиск LinkedIn и др.)", FieldType.MULTILINE,
                default = listOf("machine learning", "data scientist", "ml engineer", "ai engineer", "nlp", "llm", "applied scientist", "data analyst").joinToString("\n")),
            Field("tg_channels", "Telegram-каналы (по одному на строку, без @)", FieldType.MULTILINE,
                default = listOf("odsjobs", "datasciencejobs", "datajobschannel", "foranalysts", "nlp_jobs", "analysts_jobs", "careerspace").joinToString("\n")),
            Field("career_sites", "Карьерные сайты компаний (ссылки, по одной на строку)", FieldType.MULTILINE,
                default = listOf("https://yandex.ru/jobs/vacancies", "https://rabota.sber.ru/", "https://www.tbank.ru/career/", "https://career.avito.com/vacancies/", "https://career.ozon.ru/", "https://team.vk.company/vacancy/", "https://job.mts.ru/", "https://careers.kaspersky.ru/").joinToString("\n")),
            Field("max_other", "Максимум новых вакансий из других источников за запуск (на каждую пишется письмо)", FieldType.NUMBER, "40"),
        )),
        Section("Резюме", listOf(
            Field("ru_resume_id", "ID русского резюме на hh (кнопка «Мои резюме»)"),
            Field("en_resume_id", "ID английского резюме на hh"),
            Field("ru_title", "Название русского резюме на hh (агент заполнит сам из профиля hh)"),
            Field("en_title", "Название английского резюме на hh (агент заполнит сам из профиля hh)"),
            Field("en_cv_url", "Ссылка на PDF англ. резюме (добавится в письмо, необязательно)"),
            Field("ru_resume_text", "Текст русского резюме (заполняется из PDF или агентом из профиля hh)", FieldType.MULTILINE),
            Field("en_resume_text", "Текст английского резюме (заполняется из PDF или агентом из профиля hh)", FieldType.MULTILINE),
        )),
        Section("Профиль для анкет", listOf(
            Field("name", "Имя Фамилия (если пусто — возьмётся из резюме)"),
            Field("name_en", "Name Surname (если пусто — возьмётся из резюме)"),
            Field("email", "Email"),
            Field("phone", "Телефон"),
            Field("city", "Город", default = "Москва"),
            Field("telegram", "Telegram"),
            Field("linkedin", "LinkedIn"),
            Field("github", "GitHub"),
        )),
        Section("Анкеты", listOf(
            Field("salary_answer", "Ответ на любой вопрос про зарплату", default = "250000"),
            Field("auto_submit", "Отправлять анкеты автоматически", FieldType.BOOL, "false"),
        )),
        Section("Запуск", listOf(
            Field("max_applications", "Максимум откликов за запуск", FieldType.NUMBER, "150"),
            Field("daily_limit", "Лимит откликов в сутки (у hh — максимум 200)", FieldType.NUMBER, "150"),
            Field("delay_min", "Пауза между откликами от, сек", FieldType.NUMBER, "10"),
            Field("delay_max", "Пауза между откликами до, сек", FieldType.NUMBER, "30"),
            Field("daily_auto", "Откликаться автоматически каждый день", FieldType.BOOL, "false"),
            Field("daily_hour", "Час ежедневного запуска (0–23)", FieldType.NUMBER, "10"),
        )),
    )

    private val defaults: Map<String, String> =
        sections.flatMap { it.fields }.associate { it.key to it.default }

    fun sp(ctx: Context): SharedPreferences = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)

    fun get(ctx: Context, key: String): String = sp(ctx).getString(key, null) ?: defaults[key].orEmpty()
    fun bool(ctx: Context, key: String): Boolean = get(ctx, key) == "true"
    fun int(ctx: Context, key: String): Int = get(ctx, key).trim().toIntOrNull() ?: defaults[key]?.toIntOrNull() ?: 0
    fun list(ctx: Context, key: String, sep: Regex = Regex("[,\n]")): List<String> =
        get(ctx, key).split(sep).map { it.trim() }.filter { it.isNotEmpty() }

    fun set(ctx: Context, key: String, value: String) = sp(ctx).edit().putString(key, value).apply()

    /** Обновления настроек между версиями: старые OR-запросы заменяем на простые. */
    fun migrate(ctx: Context) {
        val q = sp(ctx).getString("queries", null)
        if (q != null && q.contains(" OR ")) sp(ctx).edit().remove("queries").apply()
        val e = sp(ctx).edit()
        // v2: зарплата 250 000; поиск без привязки к региону и без фильтра опыта
        if (sp(ctx).getString("mig_v2", null) == null) {
            if (sp(ctx).getString("salary_answer", null) == "25000") e.putString("salary_answer", "250000")
            if (sp(ctx).getString("area", null) in setOf("113", "1")) e.putString("area", "")
            e.putString("mig_v2", "done")
        }
        // v3: hh — только поиск по названию, без ограничения по дате
        if (sp(ctx).getString("mig_v3", null) == null) {
            if (sp(ctx).getString("period", null) == "7") e.putString("period", "")
            e.putString("mig_v3", "done")
        }
        e.apply()
    }

    fun profileJson(ctx: Context): String {
        val o = org.json.JSONObject()
        for (k in listOf("name", "name_en", "email", "phone", "city", "telegram", "linkedin", "github")) {
            o.put(k, get(ctx, k))
        }
        return o.toString()
    }
}
