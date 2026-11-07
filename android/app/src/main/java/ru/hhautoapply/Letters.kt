package ru.hhautoapply

import org.json.JSONObject

object Letters {
    private const val SYSTEM_RU = """Ты пишешь сопроводительные письма от лица соискателя на hh.ru.
Письмо должно звучать как живой человек, а не шаблон: коротко (600–1000 знаков),
без канцелярита, без «Уважаемый HR-менеджер» и без пустых фраз вроде «я командный игрок».
Начни естественно: например, что вакансия заинтересовала и чем именно (назови 1–2
конкретные вещи из описания: задачи, продукт, стек). Затем 2–3 предложения о том,
какой релевантный опыт из резюме подходит под эти задачи — только факты из резюме,
ничего не выдумывай. Закончи предложением созвониться/обсудить. Подпись — имя.
Не используй плейсхолдеры в квадратных скобках, markdown и списки. Верни только текст письма."""

    private const val SYSTEM_EN = """You write cover letters on behalf of a job seeker applying on hh.ru.
It must read like a real person wrote it, not a template: 120–200 words, plain and warm,
no "To whom it may concern", no clichés like "I am a team player".
Open naturally — say the role caught your attention and name 1–2 concrete things from the
job description (the problems, product or stack). Then 2–3 sentences mapping relevant
experience from the resume to those needs — only facts from the resume, never invent.
Close by suggesting a call. Sign with the candidate's name.
No placeholders in square brackets, no markdown, no bullet lists. Return only the letter text."""

    fun brief(v: JSONObject): String {
        val sb = StringBuilder()
        sb.appendLine("Должность: ${v.optString("name")}")
        sb.appendLine("Компания: ${v.optJSONObject("employer")?.optString("name").orEmpty()}")
        sb.appendLine("Город: ${v.optJSONObject("area")?.optString("name").orEmpty()}")
        v.optJSONObject("salary")?.let { sb.appendLine("Вилка: ${it.opt("from")}–${it.opt("to")} ${it.optString("currency")}") }
        val skills = v.optJSONArray("key_skills")
        if (skills != null && skills.length() > 0) {
            sb.appendLine("Ключевые навыки: " + (0 until skills.length()).joinToString(", ") { skills.getJSONObject(it).optString("name") })
        }
        sb.append("Описание:\n").append(Text.stripHtml(v.optString("description")).take(6000))
        return sb.toString()
    }

    fun write(llm: Llm, v: JSONObject, lang: String, resumeText: String, name: String, cvUrl: String): String {
        val user = "Имя кандидата для подписи: $name\n\n=== ВАКАНСИЯ ===\n${brief(v)}\n\n" +
            "=== РЕЗЮМЕ КАНДИДАТА ===\n${resumeText.take(8000)}"
        var letter = llm.complete(if (lang == "en") SYSTEM_EN else SYSTEM_RU, user, maxTokens = 2000)
        if (lang == "en" && cvUrl.isNotBlank()) letter += "\n\nCV (PDF): $cvUrl"
        return letter
    }

    const val FORM_SYSTEM = """Ты заполняешь анкету отклика на вакансию от лица кандидата.
Тебе дан список полей формы (JSON), данные кандидата, его резюме, вакансия и готовое сопроводительное письмо.
Правила:
- Отвечай только фактами из резюме и профиля. Если ответа нет в данных — дай разумный
  нейтральный ответ (для текстовых вопросов 1–3 предложения от первого лица).
- Любой вопрос про зарплату/ожидания по доходу: ответ строго "%SALARY%".
- Поле для сопроводительного письма/комментария к отклику: вставь сопроводительное письмо целиком.
- Поле загрузки файла (type=file): null (файл прикрепит пользователь).
- Выбор резюме на hh.ru (радиокнопки с названиями резюме): выбери то, чьё название ближе к "%RESUME%".
- Пароли, номера карт, паспортные данные — всегда null.
- Язык ответов — язык вопроса.
Формат ответа: JSON-объект {"answers": {"<id поля>": <значение>}}, где значение:
  для text/textarea/email/tel/number/date — строка;
  для select — точный текст одного из options;
  для radio — id выбранного варианта (из options[].id);
  для checkbox — список id отмеченных вариантов;
  если поле пропустить — null."""
}
