package ru.hhautoapply

import android.text.Html

object Text {
    private val tech = Regex(
        "\\b(python|sql|ml|ai|nlp|cv|llm|pytorch|tensorflow|pandas|numpy|spark|hadoop|airflow|docker|" +
            "kubernetes|k8s|git|linux|tableau|power\\s*bi|clickhouse|postgresql|postgres|mysql|greenplum|kafka|" +
            "scikit-learn|sklearn|catboost|xgboost|lightgbm|mlops|etl|dwh|bi|api|rest|fastapi|django|flask|aws|" +
            "gcp|azure|cloud|jupyter|excel|scala|java|go|data|science|scientist|engineer|analyst|senior|middle|" +
            "junior|lead|team|machine|learning|deep|computer|vision|big|a/b|it|hr)\\b",
        RegexOption.IGNORE_CASE,
    )
    private val cyr = Regex("[а-яёА-ЯЁ]")
    private val lat = Regex("[a-zA-Z]")

    fun stripHtml(html: String?): String =
        Html.fromHtml(html.orEmpty(), Html.FROM_HTML_MODE_LEGACY).toString().replace(Regex("\\s+"), " ").trim()

    /** То же, но с сохранением переносов строк (для постов Telegram и Hacker News). */
    fun stripHtmlKeepLines(html: String?): String =
        Html.fromHtml(html.orEmpty(), Html.FROM_HTML_MODE_LEGACY).toString()
            .lines().joinToString("\n") { it.replace(Regex("[ \t\u00A0]+"), " ").trim() }
            .replace(Regex("\n{3,}"), "\n\n").trim()

    /** "en", если доля латиницы (без технических терминов) >= 60%, иначе "ru". */
    fun detectLanguage(text: String): String {
        val clean = tech.replace(stripHtml(text), " ")
        val c = cyr.findAll(clean).count()
        val l = lat.findAll(clean).count()
        if (c + l == 0) return "ru"
        return if (l.toDouble() / (c + l) >= 0.6) "en" else "ru"
    }

    val salary = Regex(
        "зарплат|заработн|з/п|зп\\b|оклад|доход|ожидани.*(оплат|вознагр|зарпл)|вознагражден|salary|compensation|" +
            "pay\\s*expectation|expected\\s*pay|desired\\s*pay",
        RegexOption.IGNORE_CASE,
    )
    val forbidden = Regex("парол|password|cvv|cvc|номер\\s*карты|card\\s*number|паспорт|passport|снилс|инн\\b", RegexOption.IGNORE_CASE)

    fun titleOk(name: String, include: List<String>, exclude: List<String>): Boolean {
        val low = name.lowercase()
        if (include.isNotEmpty() && include.none { Regex("\\b" + Regex.escape(it.lowercase())).containsMatchIn(low) }) return false
        return exclude.none { Regex("\\b" + Regex.escape(it.lowercase())).containsMatchIn(low) }
    }

    private val cvTerms = Regex(
        "computer vision|компьютерн\\w* зрени|opencv|yolo|детекци\\w* объект|сегментаци\\w* изображ|" +
            "обработк\\w* изображ|видеоаналит|image (?:recognition|segmentation|classification)",
        RegexOption.IGNORE_CASE,
    )

    /** Вакансия про компьютерное зрение, если CV-терминов в описании много. */
    fun isCvHeavy(descriptionHtml: String): Boolean = cvTerms.findAll(stripHtml(descriptionHtml)).count() >= 3

    /** Для радиокнопок с диапазонами зарплат выбирает вариант, в который попадает salary. */
    fun salaryOption(options: List<Pair<String, String>>, salary: String): String? {
        val target = salary.filter { it.isDigit() }.toLongOrNull() ?: return null
        for ((id, label) in options) {
            var nums = Regex("\\d[\\d ]*").findAll(label).map { it.value.replace(" ", "").toLong() }.toList()
            if (Regex("тыс|k\\b", RegexOption.IGNORE_CASE).containsMatchIn(label)) nums = nums.map { if (it < 1000) it * 1000 else it }
            if (nums.size == 2 && target in nums[0]..nums[1]) return id
            if (nums.size == 1 && Regex("до|less|under|below", RegexOption.IGNORE_CASE).containsMatchIn(label) && target <= nums[0]) return id
            if (nums.size == 1 && Regex("от|more|over|above|\\+", RegexOption.IGNORE_CASE).containsMatchIn(label) && target >= nums[0]) return id
        }
        return null
    }
}
