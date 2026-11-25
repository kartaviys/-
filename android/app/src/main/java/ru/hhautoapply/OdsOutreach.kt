package ru.hhautoapply

import android.content.Context
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import java.io.File
import java.util.UUID
import kotlin.coroutines.coroutineContext

object OdsOutreach {
    private const val contactsHeader = "📇 Контакты HR:\n"
    private const val sentNote = "контакты: написали HR "
    private const val duplicateNote = "контакты: этому HR уже писали"
    private const val uncertainNote = "контакты: отправка HR не подтверждена"
    private val telegramPattern = Regex("^(?:https?://(?:www\\.)?(?:t\\.me|telegram\\.me)/|@)?([a-z0-9_]{5,32})/?(?:[?#][^\\s]*)?$", RegexOption.IGNORE_CASE)
    private val emailPattern = Regex("[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)+", RegexOption.IGNORE_CASE)

    fun email(value: String): String? = value.trim().let {
        if (it.length <= 254 && emailPattern.matches(it)) it.lowercase() else null
    }

    private fun telegram(value: String): String? = telegramPattern.matchEntire(value.trim())?.groupValues?.get(1)?.lowercase()

    data class Recipient(val vacancy: Application, val telegram: List<String>, val email: List<String>) {
        val keys = (telegram.map { "tg:$it" } + email.map { "email:$it" }).toSet()
    }

    data class Group(val recipients: List<Recipient>, val keys: Set<String>)

    fun groups(vacancies: List<Application>, ownTelegram: String, ownEmails: Set<String>): List<Group> {
        val mine = telegram(ownTelegram)
        val recipients = vacancies.mapNotNull { vacancy ->
            val block = if (vacancy.letter.startsWith(contactsHeader)) {
                vacancy.letter.removePrefix(contactsHeader).substringBefore("\n\n").lines()
            } else emptyList()
            fun values(label: String) = block.filter { it.startsWith(label) }.flatMap { it.removePrefix(label).split(',') }
            val tgs = (values("Telegram:") + vacancy.formUrl.takeIf { it.startsWith("https://t.me/", true) }.orEmpty())
                .mapNotNull(::telegram).filterNot { it == mine }.distinct()
            val emails = (values("Email:") + vacancy.formUrl.takeIf { it.startsWith("mailto:", true) }
                .orEmpty().substringAfter(':').substringBefore('?'))
                .mapNotNull(::email).filterNot { it in ownEmails }.distinct()
            Recipient(vacancy, tgs, emails).takeIf { it.keys.isNotEmpty() }
        }
        val byKey = recipients.flatMap { recipient -> recipient.keys.map { it to recipient } }.groupBy({ it.first }, { it.second })
        val seen = mutableSetOf<String>()
        return recipients.mapNotNull { first ->
            if (!seen.add(first.vacancy.vacancyId)) return@mapNotNull null
            val related = mutableListOf(first)
            val keys = mutableSetOf<String>()
            var index = 0
            while (index < related.size) {
                for (key in related[index++].keys) {
                    if (!keys.add(key)) continue
                    for (recipient in byKey.getValue(key)) {
                        if (seen.add(recipient.vacancy.vacancyId)) related.add(recipient)
                    }
                }
            }
            Group(related, keys)
        }
    }

    private fun markGroup(db: Db, group: Group, note: String, except: String? = null) {
        for (recipient in group.recipients) {
            val vacancy = recipient.vacancy
            if (vacancy.vacancyId != except && !vacancy.note.startsWith(sentNote)) db.markOds(vacancy.vacancyId, note)
        }
    }

    suspend fun run(
        ctx: Context, browser: BrowserAgent, status: (String) -> Unit, confirm: suspend (String) -> Boolean,
    ): String = Db(ctx).use { db ->
        val mail = OdsMail.load(ctx)
        val ownEmails = listOfNotNull(email(Prefs.get(ctx, "email")), mail?.address).toSet()
        val vacancies = db.list("status = 'saved' AND channel = 'ods'")
        val groups = groups(vacancies, Prefs.get(ctx, "telegram"), ownEmails)
        val history = db.odsHistory()
        val todo = groups.filter { group ->
            val legacy = group.recipients.any { it.vacancy.note.startsWith(sentNote) }
            val sent = legacy || group.keys.any { history[it] == true }
            val pending = group.keys.any { history[it] == false }
            if (sent) {
                db.rememberOds(group.keys, "history:" + group.recipients.first().vacancy.vacancyId)
                markGroup(db, group, duplicateNote)
            } else if (pending) {
                db.rememberOds(group.keys, "history:" + group.recipients.first().vacancy.vacancyId, sent = false)
                markGroup(db, group, uncertainNote)
            }
            !sent && !pending
        }
        val limit = Prefs.int(ctx, "limit_ods_tg").coerceAtLeast(1)
        val telegramCap = Prefs.int(ctx, "ods_tg_daily_limit").coerceAtLeast(1)
        val mailCap = Prefs.int(ctx, "ods_mail_daily_limit").coerceAtLeast(1)
        val template = Prefs.get(ctx, "ods_tg_template")
        val name = Prefs.get(ctx, "name")
        val attachments = listOf("ru", "en").map { File(ctx.filesDir, "resume_$it.pdf") }.filter { it.isFile }
        if (todo.isNotEmpty() && attachments.isEmpty()) RunLog.add(ctx, "ODS: PDF резюме не загружены, отправка будет без вложений")

        fun text(v: Application): String {
            val body = template.replace("{title}", v.title).replace("{url}", v.url)
                .replace("{company}", v.employer).replace("{name}", name).trim()
            return if (v.url in body) body else listOf(body, v.url).filter { it.isNotBlank() }.joinToString("\n\n")
        }

        val forEmail = mutableListOf<Group>()
        val forTelegram = todo.filter { group ->
            val hasTelegram = group.recipients.any { it.telegram.isNotEmpty() }
            if (!hasTelegram) forEmail.add(group)
            hasTelegram
        }
        var telegramSent = 0
        var emailSent = 0
        var unknown = 0
        val telegramReady = forTelegram.isNotEmpty() && db.odsSentToday("telegram") < telegramCap && browser.tgEnsureLogin()
        if (telegramReady) {
            for ((index, group) in forTelegram.withIndex()) {
                coroutineContext.ensureActive()
                if (telegramSent >= limit || db.odsSentToday("telegram") >= telegramCap) break
                val recipient = group.recipients.first { it.telegram.isNotEmpty() }
                val handle = recipient.telegram.first()
                val v = recipient.vacancy
                if (!confirm("Отправить @$handle сообщение по вакансии «${v.title}»?")) continue
                val claim = UUID.randomUUID().toString()
                var reserved = false
                var previouslySent = false
                Timing.begin(ctx, "ods_tg")
                status("Telegram: @$handle — «${v.title}»")
                val result = browser.tgSend(handle, text(v), attachments.isNotEmpty(), v.url) { peer, already ->
                    val keys = group.keys + "tg-peer:$peer"
                    reserved = !already && db.reserveOds(keys, claim, "telegram")
                    if (!reserved) {
                        val states = db.odsHistory()
                        previouslySent = already || keys.any { states[it] == true }
                        db.rememberOds(keys, claim, sent = previouslySent)
                    }
                    reserved
                }
                when (result) {
                    BrowserAgent.TgResult.SENT -> {
                        db.finishOds(claim, v.vacancyId, "telegram")
                        markGroup(db, group, duplicateNote, v.vacancyId)
                        telegramSent++
                    }
                    BrowserAgent.TgResult.ALREADY -> markGroup(db, group, if (previouslySent) duplicateNote else uncertainNote)
                    BrowserAgent.TgResult.BLOCKED -> {
                        forEmail.add(group)
                        db.markOds(v.vacancyId, "контакты: Telegram — писать нельзя")
                    }
                    BrowserAgent.TgResult.UNCONFIRMED -> {
                        unknown++
                        markGroup(db, group, uncertainNote)
                    }
                    BrowserAgent.TgResult.FAILED -> {
                        if (reserved) db.releaseOds(claim)
                        db.markOds(v.vacancyId, "контакты: Telegram — не отправлено")
                    }
                    BrowserAgent.TgResult.NO_LOGIN -> Unit
                }
                Timing.end(ctx, result == BrowserAgent.TgResult.SENT)
                RunLog.add(ctx, "• [ODS → Telegram] @$handle — ${v.title}: " + when (result) {
                    BrowserAgent.TgResult.SENT -> "отправлено"
                    BrowserAgent.TgResult.ALREADY -> if (previouslySent) "уже писали" else "есть неподтверждённая отправка"
                    BrowserAgent.TgResult.BLOCKED -> "писать нельзя"
                    BrowserAgent.TgResult.NO_LOGIN -> "нет входа"
                    BrowserAgent.TgResult.FAILED -> "не отправлено"
                    BrowserAgent.TgResult.UNCONFIRMED -> "отправка не подтверждена"
                })
                if (result == BrowserAgent.TgResult.NO_LOGIN) break
                if (result == BrowserAgent.TgResult.SENT && index < forTelegram.lastIndex && telegramSent < limit) {
                    val min = maxOf(30, Prefs.int(ctx, "ods_tg_delay_min"))
                    val max = maxOf(min, Prefs.int(ctx, "ods_tg_delay_max"))
                    val seconds = (min..max).random()
                    status("Telegram: пауза $seconds с перед следующим сообщением")
                    delay(seconds * 1_000L)
                }
            }
        } else if (forTelegram.isNotEmpty()) {
            RunLog.add(ctx, "ODS → Telegram: вход не выполнен или достигнут дневной лимит")
        }

        val emailQueue = forEmail.filter { group -> group.recipients.any { it.email.isNotEmpty() } }
        if (mail != null) {
            for (group in emailQueue) {
                coroutineContext.ensureActive()
                if (telegramSent + emailSent >= limit || db.odsSentToday("email") >= mailCap) break
                val recipient = group.recipients.first { it.email.isNotEmpty() }
                val address = recipient.email.first()
                val v = recipient.vacancy
                val claim = UUID.randomUUID().toString()
                if (!confirm("Отправить письмо на $address по вакансии «${v.title}»?")) continue
                if (!db.reserveOds(group.keys, claim, "email")) continue
                status("Почта: $address — «${v.title}»")
                val result = OdsMail.send(mail, address, "Отклик на вакансию «${v.title}»", text(v), attachments)
                when (result) {
                    OdsMail.Result.SENT -> {
                        db.finishOds(claim, v.vacancyId, "email")
                        markGroup(db, group, duplicateNote, v.vacancyId)
                        emailSent++
                    }
                    OdsMail.Result.UNCONFIRMED -> {
                        unknown++
                        markGroup(db, group, uncertainNote)
                    }
                    OdsMail.Result.UNAVAILABLE -> db.releaseOds(claim)
                }
                RunLog.add(ctx, "• [ODS → почта] $address — ${v.title}: " + when (result) {
                    OdsMail.Result.SENT -> "отправлено"
                    OdsMail.Result.UNCONFIRMED -> "отправка не подтверждена"
                    OdsMail.Result.UNAVAILABLE -> "подключение или подготовка письма не удались"
                })
                if (result == OdsMail.Result.UNAVAILABLE) break
            }
        }
        val summary = buildString {
            append("ODS: Telegram — $telegramSent, почта — $emailSent.")
            if (todo.isEmpty()) append(" Новых получателей нет.")
            if (unknown > 0) append(" Не подтверждено: $unknown. Проверьте историю отправок.")
            if (mail == null && emailQueue.isNotEmpty()) append(" Для отправки писем подключите почту.")
        }
        RunLog.add(ctx, summary)
        status(summary)
        summary
    }
}
