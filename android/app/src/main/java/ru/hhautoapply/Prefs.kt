package ru.hhautoapply

import android.content.Context
import android.content.SharedPreferences

enum class FieldType { TEXT, MULTILINE, SECRET, BOOL, NUMBER }

data class Field(val key: String, val label: String, val type: FieldType = FieldType.TEXT, val default: String = "")

data class Section(val title: String, val fields: List<Field>)

object Prefs {
    val sections = listOf(
        Section("hh.ru API (приложение с dev.hh.ru)", listOf(
            Field("hh_client_id", "Client ID"),
            Field("hh_client_secret", "Client Secret", FieldType.SECRET),
            Field("hh_redirect_uri", "Redirect URI (такой же, как в приложении на dev.hh.ru)", default = "https://localhost/hh-autoapply"),
            Field("hh_contact_email", "Ваш email (hh требует его в User-Agent)"),
        )),
        Section("Нейросеть", listOf(
            Field("anthropic_key", "Ключ Claude (sk-ant-…)", FieldType.SECRET),
            Field("deepseek_key", "Ключ DeepSeek (необязательно, запасной)", FieldType.SECRET),
            Field("providers", "Порядок провайдеров через запятую", default = "claude,deepseek"),
            Field("strategy", "Стратегия: fallback или round_robin (вперемешку)", default = "fallback"),
            Field("claude_model", "Модель Claude", default = "claude-haiku-5-5"),
            Field("deepseek_model", "Модель DeepSeek", default = "deepseek-chat"),
        )),
        Section("Поиск", listOf(
            Field("queries", "Запросы (по одному на строку, можно OR и кавычки)", FieldType.MULTILINE, default = listOf(
                "\"data scientist\" OR \"дата сайентист\" OR \"дата-сайентист\" OR \"data science\" OR \"специалист по анализу данных\"",
                "\"ml engineer\" OR \"ml-engineer\" OR \"ml инженер\" OR \"ml-инженер\" OR \"machine learning engineer\" OR \"инженер машинного обучения\" OR \"инженер по машинному обучению\" OR \"специалист по машинному обучению\"",
                "\"ml developer\" OR \"ml-разработчик\" OR \"ml разработчик\" OR \"разработчик ml\" OR \"разработчик машинного обучения\" OR \"ai developer\" OR \"ai-разработчик\" OR \"разработчик ai\" OR \"разработчик ии\" OR \"ии-разработчик\"",
                "\"ml analyst\" OR \"ml-аналитик\" OR \"ml аналитик\" OR \"аналитик ml\" OR \"аналитик машинного обучения\"",
                "\"ai engineer\" OR \"ai-инженер\" OR \"ai инженер\" OR \"инженер ai\" OR \"инженер ии\" OR \"ии-инженер\" OR \"llm engineer\" OR \"llm-инженер\" OR \"llm инженер\" OR \"genai engineer\"",
                "\"внедрение ai\" OR \"внедрению ai\" OR \"внедрение ии\" OR \"внедрению ии\" OR \"ai specialist\" OR \"ai-специалист\" OR \"специалист по ии\" OR \"специалист по искусственному интеллекту\" OR \"ai automation\" OR \"ai integration\"",
                "nlp OR \"обработка естественного языка\" OR \"natural language processing\"",
                "\"classic ml\" OR \"classical ml\" OR \"классическое ml\" OR \"классический ml\" OR \"классическому ml\" OR \"классическое машинное обучение\"",
                "\"data analyst\" OR \"аналитик данных\"",
            ).joinToString("\n")),
            Field("title_include", "Название содержит одно из (через запятую)",
                default = "data scien, дата сайент, дата-сайент, анализу данных, ml, machine learning, машинн, ai, ии, искусственн, llm, genai, nlp, естественного языка, natural language, data analyst, аналитик данных"),
            Field("title_exclude", "Исключить, если в названии (через запятую)",
                default = "junior, intern, стажер, стажёр, младший, lead, head, руководител, cv, computer vision, зрени, opencv, видеоаналит, image, изображен"),
            Field("area", "Регион (113 — Россия, 1 — Москва, 2 — СПб)", FieldType.NUMBER, "113"),
            Field("period", "Вакансии за последние N дней", FieldType.NUMBER, "7"),
            Field("remote_only", "Только удалёнка", FieldType.BOOL, "false"),
        )),
        Section("Резюме", listOf(
            Field("ru_resume_id", "ID русского резюме на hh (кнопка «Мои резюме»)"),
            Field("en_resume_id", "ID английского резюме на hh"),
            Field("ru_title", "Название русского резюме на hh", default = "Senior Data Scientist"),
            Field("en_title", "Название английского резюме на hh", default = "Senior Data Scientist (EN)"),
            Field("en_cv_url", "Ссылка на PDF англ. резюме (добавится в письмо, необязательно)"),
            Field("ru_resume_text", "Текст русского резюме (заполняется из PDF)", FieldType.MULTILINE),
            Field("en_resume_text", "Текст английского резюме (заполняется из PDF)", FieldType.MULTILINE),
        )),
        Section("Профиль для анкет", listOf(
            Field("name", "Имя Фамилия"),
            Field("name_en", "Name Surname"),
            Field("email", "Email"),
            Field("phone", "Телефон"),
            Field("city", "Город", default = "Москва"),
            Field("telegram", "Telegram"),
            Field("linkedin", "LinkedIn"),
            Field("github", "GitHub"),
        )),
        Section("Анкеты", listOf(
            Field("salary_answer", "Ответ на любой вопрос про зарплату", default = "25000"),
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

    fun profileJson(ctx: Context): String {
        val o = org.json.JSONObject()
        for (k in listOf("name", "name_en", "email", "phone", "city", "telegram", "linkedin", "github")) {
            o.put(k, get(ctx, k))
        }
        return o.toString()
    }
}
