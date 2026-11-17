package ru.hhautoapply

import android.content.Context
import android.net.Uri

/**
 * Описание сайта для общего агента: как открыть поиск, как выглядят ссылки на вакансии, где войти.
 * verified — формат ссылок проверен на реальной выдаче; для остальных, если шаблон ничего не нашёл,
 * ссылки на вакансии выбирает нейросеть.
 */
data class SiteDef(
    val key: String,
    val name: String,
    val group: String,
    val loginUrl: String?,
    /** Адрес поиска по запросу и странице (страницы с 0). */
    val search: (query: String, page: Int) -> String,
    /** Поддерживает ли сайт листание страниц через адрес. */
    val paged: Boolean,
    /** Шаблон ссылки на вакансию (группа 1 — id, если есть). */
    val link: Regex,
    val english: Boolean,
    val verified: Boolean,
    /** Поиск по запросу не работает — берём всю ленту и фильтруем сами (сайты компаний). */
    val noQuery: Boolean = false,
    val note: String = "",
)

object Sites {
    private fun e(s: String) = Uri.encode(s)
    private fun slug(s: String) = s.trim().lowercase().replace(Regex("[^a-z0-9а-яё]+"), "-").trim('-')

    private val RU = listOf("data scientist", "ml engineer", "machine learning", "ai engineer", "nlp", "аналитик данных")
    private val EN = listOf("data scientist", "machine learning engineer", "ml engineer", "ai engineer", "nlp engineer", "data analyst")
    private val COMPANY = listOf("data scientist", "machine learning")

    const val G_RU = "Россия — площадки"
    const val G_RU_CO = "Россия — сайты компаний"
    const val G_US = "США"
    const val G_UAE = "ОАЭ"
    const val G_EU = "Европа и релокация"

    val all: List<SiteDef> = listOf(
        // ---------- Россия — площадки ----------
        SiteDef("superjob", "SuperJob", G_RU, "https://www.superjob.ru/auth/login/",
            { q, p -> "https://www.superjob.ru/vacancy/search/?keywords=${e(q)}" + if (p > 0) "&page=${p + 1}" else "" }, true,
            Regex("superjob\\.ru/vakansii/[^/?#]+-(\\d{6,})\\.html"), false, true),
        SiteDef("geekjob", "GeekJob", G_RU, "https://geekjob.ru/login",
            { q, p -> "https://geekjob.ru/vacancies?qs=${e(q)}" + if (p > 0) "&page=${p + 1}" else "" }, true,
            Regex("geekjob\\.ru/vacancy/([0-9a-f]{24})"), false, true),
        SiteDef("rabota_ru", "Работа.ру", G_RU, "https://www.rabota.ru/auth/",
            { q, p -> "https://www.rabota.ru/vacancy/?query=${e(q)}" + if (p > 0) "&page=${p + 1}" else "" }, true,
            Regex("rabota\\.ru/vacancy/(\\d{5,})"), false, false),
        SiteDef("getmatch_site", "GetMatch", G_RU, "https://getmatch.ru/login",
            { q, p -> "https://getmatch.ru/vacancies?q=${e(q)}" + if (p > 0) "&p=${p + 1}" else "" }, true,
            Regex("getmatch\\.ru/vacancies/(\\d+)"), false, true),

        // ---------- Россия — сайты компаний ----------
        SiteDef("yandex", "Яндекс", G_RU_CO, "https://passport.yandex.ru/auth",
            { q, _ -> "https://yandex.ru/jobs/vacancies?text=${e(q)}" }, false,
            Regex("yandex\\.ru/jobs/vacancies/[a-z0-9-]*?(\\d{3,})(?:[/?#]|$)"), false, false),
        SiteDef("sber", "Сбер", G_RU_CO, null,
            { q, _ -> "https://rabota.sber.ru/search/?query=${e(q)}" }, false,
            Regex("rabota\\.sber\\.ru/search/(\\d{4,})"), false, false),
        SiteDef("tbank", "Т-Банк", G_RU_CO, null,
            { q, _ -> "https://www.tbank.ru/career/it/vacancies/?query=${e(q)}" }, false,
            Regex("tbank\\.ru/career/[^?#]*vacanc[^?#]*/[a-z0-9-]{6,}"), false, false,
            note = "Сайт Т-Банка использует российский сертификат: если не открывается, установите сертификат Минцифры в телефон."),
        SiteDef("ozon", "Ozon", G_RU_CO, null,
            { q, _ -> "https://career.ozon.ru/vacancy/?query=${e(q)}" }, false,
            Regex("career\\.ozon\\.ru/vacancy/(\\d{3,})"), false, false),
        SiteDef("vk", "VK", G_RU_CO, null,
            { q, _ -> "https://team.vk.company/vacancy/?search=${e(q)}" }, false,
            Regex("team\\.vk\\.company/vacancy/(\\d{3,})"), false, false),
        SiteDef("avito", "Авито", G_RU_CO, null,
            { q, _ -> "https://career.avito.com/vacancies/?q=${e(q)}" }, false,
            Regex("career\\.avito\\.com/vacancies/[a-z-]+/(\\d{3,})/"), false, true, noQuery = true),
        SiteDef("mts", "МТС", G_RU_CO, null,
            { q, _ -> "https://job.mts.ru/vacancies?search=${e(q)}" }, false,
            Regex("job\\.mts\\.ru/vacanc(?:y|ies)/[a-z0-9-]*\\d{3,}"), false, false),
        SiteDef("kaspersky", "Лаборатория Касперского", G_RU_CO, null,
            { q, _ -> "https://careers.kaspersky.ru/vacancies?search=${e(q)}" }, false,
            Regex("careers\\.kaspersky\\.ru/vacancy/([0-9a-f]{4,})"), false, true, noQuery = true),

        // ---------- США ----------
        SiteDef("dice", "Dice", G_US, "https://www.dice.com/dashboard/login",
            { q, p -> "https://www.dice.com/jobs?q=${e(q)}" + if (p > 0) "&page=${p + 1}" else "" }, true,
            Regex("dice\\.com/job-detail/([0-9a-f-]{36})"), true, true),
        SiteDef("builtin", "Built In", G_US, "https://builtin.com/auth/login",
            { q, p -> "https://builtin.com/jobs?search=${e(q)}" + if (p > 0) "&page=${p + 1}" else "" }, true,
            Regex("builtin\\.com/job/[^/?#]+/(\\d{5,})"), true, true),
        SiteDef("wellfound", "Wellfound (стартапы)", G_US, "https://wellfound.com/login",
            { q, p -> "https://wellfound.com/role/${slug(q)}" + if (p > 0) "?page=${p + 1}" else "" }, true,
            Regex("wellfound\\.com/jobs/(\\d{5,})-"), true, true),
        SiteDef("indeed", "Indeed (США)", G_US, "https://secure.indeed.com/account/login",
            { q, p -> "https://www.indeed.com/jobs?q=${e(q)}" + if (p > 0) "&start=${p * 10}" else "" }, true,
            Regex("indeed\\.com/(?:viewjob|rc/clk|pagead/clk)[^\"]*?[?&]jk=([0-9a-f]{16})"), true, false,
            note = "Indeed защищён Cloudflare — иногда будет капча."),
        SiteDef("glassdoor", "Glassdoor", G_US, "https://www.glassdoor.com/profile/login_input.htm",
            { q, _ -> "https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${e(q)}" }, false,
            Regex("glassdoor\\.[a-z.]+/(?:job-listing|partner/jobListing)[^\"]*?jl=(\\d{6,})"), true, false),

        // ---------- ОАЭ ----------
        SiteDef("bayt", "Bayt", G_UAE, "https://www.bayt.com/en/login/",
            { q, p -> "https://www.bayt.com/en/uae/jobs/${slug(q)}-jobs/" + if (p > 0) "?page=${p + 1}" else "" }, true,
            Regex("bayt\\.com/en/[a-z-]+/jobs/[a-z0-9-]+-(\\d{6,})/"), true, true),
        SiteDef("naukrigulf", "Naukrigulf", G_UAE, "https://www.naukrigulf.com/jobseeker/login",
            { q, p -> "https://www.naukrigulf.com/${slug(q)}-jobs-in-uae" + if (p > 0) "-${p + 1}" else "" }, true,
            Regex("naukrigulf\\.com/[a-z0-9-]+-jid-(\\d{6,})"), true, false),
        SiteDef("gulftalent", "GulfTalent", G_UAE, "https://www.gulftalent.com/login",
            { q, _ -> "https://www.gulftalent.com/uae/jobs/title/${slug(q)}" }, false,
            Regex("gulftalent\\.com/[a-z-]+/jobs/[a-z0-9-]+-(\\d{5,})"), true, false),
        SiteDef("indeed_ae", "Indeed ОАЭ", G_UAE, "https://secure.indeed.com/account/login",
            { q, p -> "https://ae.indeed.com/jobs?q=${e(q)}" + if (p > 0) "&start=${p * 10}" else "" }, true,
            Regex("indeed\\.com/(?:viewjob|rc/clk|pagead/clk)[^\"]*?[?&]jk=([0-9a-f]{16})"), true, false),

        // ---------- Европа и релокация ----------
        SiteDef("stepstone", "StepStone (Германия)", G_EU, "https://www.stepstone.de/candidate/login",
            { q, p -> "https://www.stepstone.de/jobs/${slug(q)}" + if (p > 0) "?page=${p + 1}" else "" }, true,
            Regex("stepstone\\.de/stellenangebote--[^\"?#]*--(\\d{6,})-inline\\.html"), true, false),
        SiteDef("relocate", "Relocate.me (с релокацией)", G_EU, "https://relocate.me/login",
            { _, p -> "https://relocate.me/international-jobs" + if (p > 0) "?page=${p + 1}" else "" }, true,
            Regex("relocate\\.me/[a-z-]+/[a-z-]+/[a-z0-9-]+/[a-z0-9-]+-(\\d{3,})(?:[?#]|$)"), true, true, noQuery = true),
    )

    fun byKey(key: String) = all.firstOrNull { it.key == key }

    fun queries(ctx: Context, s: SiteDef): List<String> {
        val saved = Prefs.sp(ctx).getString("q_${s.key}", null)?.lines()?.map { it.trim() }?.filter { it.isNotEmpty() }
        return saved?.takeIf { it.isNotEmpty() } ?: if (s.noQuery) listOf("(вся лента)") else when {
            s.group == G_RU_CO -> COMPANY
            s.english -> EN
            else -> RU
        }
    }

    fun limit(ctx: Context, s: SiteDef): Int =
        Prefs.sp(ctx).getString("limit_${s.key}", null)?.trim()?.toIntOrNull() ?: 20
}
