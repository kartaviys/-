package ru.hhautoapply

import android.content.Context
import android.net.Uri
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Вакансия из любого источника, кроме hh (у hh свой путь через API). */
data class JobPost(
    val source: String,
    val id: String,
    val title: String,
    val company: String,
    val url: String,
    var description: String,
    val junior: Boolean = false,
    /** Текст, по которому фильтруем название (для Telegram — начало поста). */
    val filterText: String = title,
)

enum class Kind {
    /** hh.ru: поиск и отклик через API. */
    HH_API,
    /** Вакансии собираются автоматически, отклик — во встроенном браузере с помощью ИИ. */
    AUTO,
    /** Площадка без открытого API: открываете поиск в приложении, ИИ пишет письмо и заполняет форму. */
    ASSISTED,
}

class Source(
    val key: String,
    val name: String,
    val kind: Kind,
    val group: String,
    val defaultOn: Boolean,
    val instructions: String,
    /** Ссылка на поиск по запросу (для кнопки «Открыть»). */
    val searchUrl: (String) -> String,
    /** Сбор вакансий (только для AUTO). */
    val fetch: ((Context, Net) -> List<JobPost>)? = null,
    /** Догрузка полного описания, если в списке его нет. */
    val details: ((Net, JobPost) -> String)? = null,
)

/** Простой HTTP-клиент для источников. */
class Net {
    private val http = OkHttpClient.Builder().readTimeout(40, TimeUnit.SECONDS).followRedirects(true).build()
    private val ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36"

    fun get(url: String, accept: String = "application/json"): String {
        val req = Request.Builder().url(url).header("User-Agent", ua).header("Accept", accept).build()
        http.newCall(req).execute().use { r ->
            val body = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw RuntimeException("HTTP ${r.code} ($url)")
            return body
        }
    }

    fun json(url: String) = JSONObject(get(url))
}

private fun enc(s: String) = Uri.encode(s)

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

private fun firstLine(text: String) = text.lines().map { it.trim() }.firstOrNull { it.isNotEmpty() }.orEmpty().take(140)

object Sources {
    // ---------- сбор вакансий ----------

    private fun ruQueries(ctx: Context) = Prefs.list(ctx, "ru_queries", Regex("\n"))
    private fun intlQueries(ctx: Context) = Prefs.list(ctx, "intl_queries", Regex("\n"))

    private fun habr(ctx: Context, net: Net): List<JobPost> = ruQueries(ctx).flatMap { q ->
        net.json("https://career.habr.com/api/frontend/vacancies?q=${enc(q)}&sort=date&per_page=50")
            .optJSONArray("list")?.objects().orEmpty().map { v ->
                val qual = v.optString("qualification")
                JobPost(
                    "habr", v.optString("id"), v.optString("title"),
                    v.optJSONObject("company")?.optString("title").orEmpty(),
                    "https://career.habr.com" + v.optString("href"), "",
                    junior = qual.equals("Junior", true) || qual.equals("Intern", true),
                )
            }
    }

    private fun habrDetails(net: Net, p: JobPost): String {
        val html = net.get(p.url, "text/html")
        val start = html.indexOf("vacancy-description__text")
        if (start < 0) return ""
        val end = html.indexOf("basic-section", start + 30).let { if (it < 0) minOf(html.length, start + 20000) else it }
        return Text.stripHtml("<div " + html.substring(start, end))
    }

    private fun getmatch(ctx: Context, net: Net): List<JobPost> = ruQueries(ctx).flatMap { q ->
        net.json("https://getmatch.ru/api/offers?p=1&pa=all&q=${enc(q)}")
            .optJSONArray("offers")?.objects().orEmpty().filter { it.optBoolean("is_active", true) }.map { o ->
                JobPost(
                    "getmatch", o.optString("id"), o.optString("position"),
                    o.optJSONObject("company")?.optString("name").orEmpty(),
                    "https://getmatch.ru" + o.optString("url"),
                    Text.stripHtml(o.optString("description_html").takeIf { it != "null" } ?: o.optString("offer_description")),
                )
            }
    }

    private fun trudvsem(ctx: Context, net: Net): List<JobPost> = ruQueries(ctx).flatMap { q ->
        val res = net.json("https://opendata.trudvsem.ru/api/v1/vacancies?text=${enc(q)}&limit=100").optJSONObject("results")
        res?.optJSONArray("vacancies")?.objects().orEmpty().mapNotNull { it.optJSONObject("vacancy") }.map { v ->
            JobPost(
                "trudvsem", v.optString("id"), v.optString("job-name"),
                v.optJSONObject("company")?.optString("name").orEmpty(),
                v.optString("vac_url"),
                Text.stripHtml(v.optString("duty")),
            )
        }
    }

    private val tgPost = Regex("data-post=\"([^\"]+)\"")
    private val tgText = Regex("class=\"tgme_widget_message_text[^\"]*\"[^>]*>(.*?)</div>", RegexOption.DOT_MATCHES_ALL)

    private fun telegram(ctx: Context, net: Net): List<JobPost> = Prefs.list(ctx, "tg_channels").flatMap { raw ->
        val ch = raw.removePrefix("@").removePrefix("https://t.me/").trim('/')
        val html = net.get("https://t.me/s/$ch", "text/html")
        // Разрезаем страницу на сообщения по атрибуту data-post
        val starts = tgPost.findAll(html).toList()
        starts.mapIndexedNotNull { i, m ->
            val chunk = html.substring(m.range.first, if (i + 1 < starts.size) starts[i + 1].range.first else html.length)
            val textHtml = tgText.find(chunk)?.groupValues?.get(1) ?: return@mapIndexedNotNull null
            val text = Text.stripHtmlKeepLines(textHtml)
            val post = m.groupValues[1]
            JobPost("telegram", post, firstLine(text), "@$ch", "https://t.me/$post", text, filterText = text.take(300))
        }
    }

    private fun remoteok(ctx: Context, net: Net): List<JobPost> =
        JSONArray(net.get("https://remoteok.com/api")).objects().drop(1).map { j ->
            val tags = j.optJSONArray("tags")?.toString().orEmpty()
            JobPost(
                "remoteok", j.optString("id"), j.optString("position"), j.optString("company"),
                j.optString("url"), Text.stripHtml(j.optString("description")), junior = tags.contains("junior"),
            )
        }

    private fun remotive(ctx: Context, net: Net): List<JobPost> =
        net.json("https://remotive.com/api/remote-jobs").optJSONArray("jobs")?.objects().orEmpty().map { j ->
            JobPost(
                "remotive", j.optString("id"), j.optString("title"), j.optString("company_name"),
                j.optString("url"), Text.stripHtml(j.optString("description")),
            )
        }

    private fun himalayas(ctx: Context, net: Net): List<JobPost> = intlQueries(ctx).flatMap { q ->
        net.json("https://himalayas.app/jobs/api/search?q=${enc(q)}").optJSONArray("jobs")?.objects().orEmpty().map { j ->
            val seniority = j.optJSONArray("seniority")?.toString().orEmpty()
            JobPost(
                "himalayas", j.optString("guid"), j.optString("title"), j.optString("companyName"),
                j.optString("applicationLink").ifBlank { j.optString("guid") },
                Text.stripHtml(j.optString("description")),
                junior = seniority.contains("Entry", true) || seniority.contains("Junior", true),
            )
        }
    }

    private val rssItem = Regex("<item>(.*?)</item>", RegexOption.DOT_MATCHES_ALL)
    private fun tag(xml: String, name: String) =
        Regex("<$name>(.*?)</$name>", RegexOption.DOT_MATCHES_ALL).find(xml)?.groupValues?.get(1)?.trim()
            ?.removePrefix("<![CDATA[")?.removeSuffix("]]>").orEmpty()

    private fun wwr(ctx: Context, net: Net): List<JobPost> {
        val feeds = listOf(
            "https://weworkremotely.com/remote-jobs.rss",
            "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
            "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
        )
        return feeds.flatMap { url ->
            val xml = try { net.get(url, "application/rss+xml, */*") } catch (_: Exception) { "" }
            rssItem.findAll(xml).map { it.groupValues[1] }.map { item ->
                val full = Text.stripHtml(tag(item, "title"))
                val company = full.substringBefore(":", "").trim()
                val title = full.substringAfter(": ", full).trim()
                val link = tag(item, "link").ifBlank { tag(item, "guid") }
                JobPost("wwr", link, title, company, link, Text.stripHtml(android.text.Html.fromHtml(tag(item, "description"), 0).toString()))
            }.toList()
        }
    }

    private fun hackerNews(ctx: Context, net: Net): List<JobPost> {
        val stories = net.json("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5")
            .optJSONArray("hits")?.objects().orEmpty()
        val story = stories.firstOrNull { it.optString("title").contains("Who is hiring", true) } ?: return emptyList()
        val sid = story.optString("objectID")
        return intlQueries(ctx).flatMap { q ->
            net.json("https://hn.algolia.com/api/v1/search?tags=comment,story_$sid&query=${enc(q)}&hitsPerPage=50")
                .optJSONArray("hits")?.objects().orEmpty()
                .filter { it.optString("parent_id") == sid } // только верхнеуровневые посты компаний
                .map { h ->
                    val text = Text.stripHtmlKeepLines(h.optString("comment_text"))
                    val head = firstLine(text)
                    JobPost(
                        "hn", h.optString("objectID"), head, head.substringBefore("|").trim(),
                        "https://news.ycombinator.com/item?id=${h.optString("objectID")}", text, filterText = text.take(400),
                    )
                }
        }
    }

    // ---------- реестр ----------

    private const val ASSIST_HOWTO = "\n\nКак откликаться: «Открыть» → найдите вакансию → «Отклик с ИИ» (нейросеть прочитает " +
        "вакансию, напишет письмо и заполнит форму) → проверьте и отправьте на сайте → «В журнал ✓»."

    val all: List<Source> = listOf(
        // --- Россия ---
        Source("hh", "hh.ru", Kind.HH_API, "Россия", true,
            "Главный источник: поиск и отклик идут через официальный API hh.ru, полностью автоматически.\n\n" +
                "1. Зарегистрируйте приложение на dev.hh.ru (раздел «Мои приложения») и дождитесь одобрения.\n" +
                "2. Впишите Client ID, Client Secret и Redirect URI в «Настройки → hh.ru API».\n" +
                "3. На главном экране: «Войти через API hh», затем «Мои резюме на hh».\n" +
                "4. Для вакансий с тестом: «Войти на hh.ru (для тестов)».",
            { q -> "https://hh.ru/search/vacancy?text=${enc(q)}" }),
        Source("habr", "Хабр Карьера", Kind.AUTO, "Россия", true,
            "Вакансии собираются автоматически (поиск по «Запросам для российских площадок»), junior отсекаются.\n\n" +
                "1. Включите источник.\n2. Один раз войдите на career.habr.com через «Открыть» — откликаться можно только залогиненным.\n" +
                "3. Найденные вакансии появятся в «Анкетах»: там ИИ заполнит форму отклика, вы подтверждаете.",
            { q -> "https://career.habr.com/vacancies?q=${enc(q)}&type=all" }, ::habr, ::habrDetails),
        Source("getmatch", "GetMatch", Kind.AUTO, "Россия", true,
            "Вакансии с открытой зарплатой из getmatch.ru собираются автоматически.\n\n" +
                "1. Включите источник (если уже получаете GetMatch в Telegram — можно оставить, дубли отсекаются).\n" +
                "2. Один раз войдите на getmatch.ru через «Открыть».\n3. Отклик — из «Анкет».",
            { q -> "https://getmatch.ru/vacancies?q=${enc(q)}" }, ::getmatch),
        Source("trudvsem", "Работа России (Trudvsem)", Kind.AUTO, "Россия", false,
            "Государственный портал, открытый API — вакансии собираются автоматически.\n\n" +
                "1. Включите источник.\n2. Для отклика нужен вход через Госуслуги на trudvsem.ru («Открыть»).\n" +
                "3. Отклик — из «Анкет». IT-вакансий здесь немного, поэтому по умолчанию выключено.",
            { q -> "https://trudvsem.ru/vacancy/search?_title=${enc(q)}" }, ::trudvsem),
        Source("telegram", "Telegram-каналы", Kind.AUTO, "Россия", true,
            "Читаются публичные каналы с вакансиями (без входа в Telegram). Список — в «Настройки → Источники → Telegram-каналы».\n\n" +
                "По умолчанию: ODS #jobs, Data Science Jobs, Data jobs feed, Job for Analysts & DS, NLP jobs, Analysts_Jobs, careerspace.\n" +
                "Подходящие посты попадают в «Анкеты» с готовым письмом: откройте пост, перейдите по ссылке " +
                "работодателя или напишите контакту, письмо можно скопировать кнопкой «Письмо».",
            { _ -> "https://t.me/s/odsjobs" }, ::telegram),
        Source("ods", "ODS Jobs", Kind.ASSISTED, "Россия", true,
            "Вакансии ODS уже приходят через Telegram-канал ODS #jobs (источник «Telegram-каналы»). " +
                "Здесь — сайт ods.ai/jobs целиком." + ASSIST_HOWTO,
            { _ -> "https://ods.ai/jobs" }),
        Source("geekjob", "GeekJob", Kind.ASSISTED, "Россия", true,
            "Открытого API нет." + ASSIST_HOWTO, { q -> "https://geekjob.ru/vacancies?qs=${enc(q)}" }),
        Source("superjob", "SuperJob", Kind.ASSISTED, "Россия", true,
            "У SuperJob есть API только для зарегистрированных партнёров, поэтому — через встроенный браузер. " +
                "Войдите в аккаунт SuperJob при первом открытии." + ASSIST_HOWTO,
            { q -> "https://www.superjob.ru/vacancy/search/?keywords=${enc(q)}" }),
        Source("rabota", "Работа.ру", Kind.ASSISTED, "Россия", true,
            "Открытого API для соискателей нет. Войдите в аккаунт при первом открытии." + ASSIST_HOWTO,
            { q -> "https://www.rabota.ru/vacancy/?query=${enc(q)}" }),
        Source("avito", "Авито Работа", Kind.ASSISTED, "Россия", false,
            "API Авито — только для работодателей. Войдите в Авито при первом открытии. " +
                "IT-вакансий уровня senior здесь мало, поэтому по умолчанию выключено." + ASSIST_HOWTO,
            { q -> "https://www.avito.ru/all/vakansii?q=${enc(q)}" }),
        Source("setka", "Сетка", Kind.ASSISTED, "Россия", true,
            "Профессиональная сеть Сбера, работает через приложение и сайт, API нет. " +
                "Заполните профиль, подпишитесь на рекрутеров и компании; вакансии открывайте здесь." + ASSIST_HOWTO,
            { _ -> "https://setka.ru/" }),
        Source("careers", "Карьерные сайты компаний", Kind.ASSISTED, "Россия", true,
            "Список сайтов — в «Настройки → Источники → Карьерные сайты компаний» (по одному на строку, можно дописать свои). " +
                "«Открыть» покажет список." + ASSIST_HOWTO,
            { _ -> "" }),

        // --- Международные ---
        Source("linkedin", "LinkedIn", Kind.ASSISTED, "Международные", true,
            "Полностью автоматическая подача на LinkedIn запрещена его правилами и быстро приводит к блокировке аккаунта, " +
                "поэтому здесь — полуавтомат с вашим подтверждением.\n\n" +
                "1. «Открыть» → войдите в LinkedIn (email и пароль).\n" +
                "2. Поиск уже открыт с фильтрами Easy Apply и Mid-Senior.\n" +
                "3. Откройте вакансию → Easy Apply → «Отклик с ИИ»: нейросеть заполнит шаги формы.\n" +
                "4. Проверьте каждый шаг, нажмите Submit → «В журнал ✓».",
            { q -> "https://www.linkedin.com/jobs/search/?keywords=${enc(q)}&f_AL=true&f_E=4" }),
        Source("indeed", "Indeed", Kind.ASSISTED, "Международные", true,
            "Публичного API для соискателей нет." + ASSIST_HOWTO, { q -> "https://www.indeed.com/jobs?q=${enc(q)}" }),
        Source("glassdoor", "Glassdoor", Kind.ASSISTED, "Международные", true,
            "API нет. Требует входа." + ASSIST_HOWTO, { q -> "https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${enc(q)}" }),
        Source("levels", "Levels.fyi", Kind.ASSISTED, "Международные", true,
            "Вакансии плюс реальные зарплаты по компаниям — удобно сверять вилку перед откликом." + ASSIST_HOWTO,
            { q -> "https://www.levels.fyi/jobs?searchText=${enc(q)}" }),
        Source("builtin", "Built In", Kind.ASSISTED, "Международные", true,
            "API нет. Вакансии в основном в США." + ASSIST_HOWTO, { q -> "https://builtin.com/jobs?search=${enc(q)}" }),
        Source("dice", "Dice", Kind.ASSISTED, "Международные", true,
            "API нет. Технические вакансии, в основном США." + ASSIST_HOWTO, { q -> "https://www.dice.com/jobs?q=${enc(q)}" }),
        Source("hn", "Hacker News «Who is hiring»", Kind.AUTO, "Стартапы", true,
            "Ежемесячный тред на Hacker News. Посты компаний собираются автоматически через открытый API (поиск по " +
                "«Запросам для зарубежных площадок»). Откликаются обычно письмом на email из поста: письмо готово, " +
                "кнопка «Письмо» копирует его.",
            { _ -> "https://news.ycombinator.com/submitted?id=whoishiring" }, ::hackerNews),
        Source("wellfound", "Wellfound (бывший AngelList)", Kind.ASSISTED, "Стартапы", true,
            "API нет, сайт защищён от ботов. Создайте профиль, затем откликайтесь здесь." + ASSIST_HOWTO,
            { _ -> "https://wellfound.com/jobs" }),
        Source("wttj", "Welcome to the Jungle (Otta)", Kind.ASSISTED, "Стартапы", true,
            "API нет. Otta теперь часть Welcome to the Jungle." + ASSIST_HOWTO,
            { q -> "https://www.welcometothejungle.com/en/jobs?query=${enc(q)}" }),
        Source("aijobs", "aijobs.net", Kind.ASSISTED, "Только AI/ML", true,
            "По проверке aijobs.net теперь перенаправляет на foorilla.com, открытой ленты вакансий нет — открываем сайт." + ASSIST_HOWTO,
            { _ -> "https://aijobs.net/" }),

        // --- Удалёнка ---
        Source("remoteok", "Remote OK", Kind.AUTO, "Удалёнка", true,
            "Открытый API, вакансии собираются автоматически и фильтруются по названию. Отклик — из «Анкет» (ссылка на Remote OK).",
            { q -> "https://remoteok.com/remote-${enc(q.replace(' ', '-'))}-jobs" }, ::remoteok),
        Source("wwr", "We Work Remotely", Kind.AUTO, "Удалёнка", true,
            "Читается RSS-лента, вакансии фильтруются по названию. Отклик — из «Анкет».",
            { q -> "https://weworkremotely.com/remote-jobs/search?term=${enc(q)}" }, ::wwr),
        Source("remotive", "Remotive", Kind.AUTO, "Удалёнка", true,
            "Открытый API (вакансии с задержкой 24 часа, обновляется редко). Отклик — из «Анкет».",
            { q -> "https://remotive.com/remote-jobs?query=${enc(q)}" }, ::remotive),
        Source("himalayas", "Himalayas", Kind.AUTO, "Удалёнка", true,
            "Открытый API с поиском — вакансии собираются автоматически, junior отсекаются. Отклик — из «Анкет».",
            { q -> "https://himalayas.app/jobs?q=${enc(q)}" }, ::himalayas),
        Source("arc", "Arc.dev", Kind.ASSISTED, "Удалёнка", true,
            "Площадка-маркетплейс: создайте профиль и пройдите проверку, дальше предложения приходят сами. " +
                "Здесь можно открыть вакансии и откликнуться." + ASSIST_HOWTO,
            { _ -> "https://arc.dev/remote-jobs" }),
        Source("turing", "Turing", Kind.ASSISTED, "Удалёнка", true,
            "Маркетплейс: регистрация, тесты и интервью на платформе, затем подбор проектов. Откройте и пройдите онбординг.",
            { _ -> "https://www.turing.com/jobs" }),

        // --- Европа и релокация ---
        Source("eures", "EURES (портал ЕС)", Kind.ASSISTED, "Европа и релокация", true,
            "Официальный портал вакансий ЕС. Нужна учётная запись EU Login." + ASSIST_HOWTO,
            { q -> "https://europa.eu/eures/portal/jv-se/search?keywordsEverywhere=${enc(q)}" }),
        Source("stepstone", "StepStone", Kind.ASSISTED, "Европа и релокация", true,
            "Крупнейшая площадка Германии, API нет." + ASSIST_HOWTO,
            { q -> "https://www.stepstone.de/jobs/${enc(q.replace(' ', '-'))}" }),
        Source("xing", "XING", Kind.ASSISTED, "Европа и релокация", true,
            "Профессиональная сеть Германии, API для соискателей нет." + ASSIST_HOWTO,
            { q -> "https://www.xing.com/jobs/search?keywords=${enc(q)}" }),
        Source("relocate", "Relocate.me", Kind.ASSISTED, "Европа и релокация", true,
            "Вакансии с релокацией. Открытой ленты нет (проверено)." + ASSIST_HOWTO,
            { _ -> "https://relocate.me/" }),
        Source("landing", "Landing.jobs", Kind.ASSISTED, "Европа и релокация", true,
            "API закрыт (проверено: 403)." + ASSIST_HOWTO, { _ -> "https://landing.jobs/jobs" }),
        Source("infojobs_it", "InfoJobs.it (Италия)", Kind.ASSISTED, "Европа и релокация", false,
            "Внимание: по проверке главная страница InfoJobs.it показывает прощальное сообщение («Grazie Italia») — " +
                "похоже, сервис в Италии закрылся. Оставлено выключенным." + ASSIST_HOWTO,
            { _ -> "https://www.infojobs.it/" }),
        Source("indeed_it", "Indeed Italia", Kind.ASSISTED, "Европа и релокация", true,
            "Итальянская версия Indeed." + ASSIST_HOWTO, { q -> "https://it.indeed.com/jobs?q=${enc(q)}" }),
    )

    fun byKey(key: String) = all.firstOrNull { it.key == key }

    fun isOn(ctx: Context, s: Source): Boolean =
        Prefs.sp(ctx).getString("src_${s.key}", null)?.let { it == "true" } ?: s.defaultOn

    fun setOn(ctx: Context, s: Source, on: Boolean) = Prefs.set(ctx, "src_${s.key}", on.toString())

    /** Запрос, который подставляется в поиск на сайтах «с подтверждением». */
    fun mainQuery(ctx: Context, s: Source): String {
        val list = if (s.group == "Россия") ruQueries(ctx) else intlQueries(ctx)
        return list.firstOrNull() ?: "machine learning"
    }
}
