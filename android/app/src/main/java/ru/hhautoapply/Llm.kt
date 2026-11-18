package ru.hhautoapply

import android.content.Context
import android.util.Base64
import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.models.messages.Base64PdfSource
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.DocumentBlockParam
import com.anthropic.models.messages.Message
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import com.anthropic.models.messages.TextBlockParam
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

open class LlmException(msg: String) : Exception(msg)

/** Ошибка, после которой продолжать сессию бессмысленно — останавливаем агента и показываем причину. */
open class StopSessionException(msg: String) : LlmException(msg)

/** Дневной бюджет исчерпан. */
class BudgetException(msg: String) : StopSessionException(msg)

/** Нейросеть отказывает в доступе (401/403: неверный ключ, нет денег или запрос из неподдерживаемой страны). */
class LlmAccessException(msg: String) : StopSessionException(msg)

interface Provider {
    val name: String
    val priceIn: Double   // $ за 1M входных токенов
    val priceOut: Double  // $ за 1M выходных токенов
    /** Возвращает (текст, входные токены, выходные токены). Блокирующий вызов. */
    fun complete(system: String, user: String, wantJson: Boolean, maxTokens: Long): Triple<String, Long, Long>
}

class ClaudeProvider(apiKey: String, private val model: String) : Provider {
    override val name = "claude"
    override val priceIn = 0.10
    override val priceOut = 0.50
    private val client: AnthropicClient = AnthropicOkHttpClient.builder().apiKey(apiKey).build()

    override fun complete(system: String, user: String, wantJson: Boolean, maxTokens: Long): Triple<String, Long, Long> {
        val params = MessageCreateParams.builder()
            .model(model)
            .maxTokens(maxTokens)
            .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
            .system(system)
            .addUserMessage(user)
            .build()
        return unpack(client.messages().create(params))
    }

    /** Достаёт текст резюме из PDF (один раз при загрузке файла). */
    fun extractPdfText(pdf: ByteArray): String {
        val doc = DocumentBlockParam.builder()
            .source(Base64PdfSource.builder().data(Base64.encodeToString(pdf, Base64.NO_WRAP)).build())
            .build()
        val params = MessageCreateParams.builder()
            .model(model)
            .maxTokens(8000L)
            .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
            .addUserMessageOfContentBlockParams(listOf(
                ContentBlockParam.ofDocument(doc),
                ContentBlockParam.ofText(TextBlockParam.builder().text(
                    "Перепиши текст этого резюме целиком простым текстом, сохранив все факты, даты, " +
                        "компании, навыки и достижения. Без комментариев, только текст резюме.",
                ).build()),
            ))
            .build()
        return unpack(client.messages().create(params)).first
    }

    private fun unpack(resp: Message): Triple<String, Long, Long> {
        if (resp.stopReason().orElse(null) == StopReason.REFUSAL) throw LlmException("Claude отказался отвечать")
        val text = resp.content().mapNotNull { block -> block.text().orElse(null)?.text() }.joinToString("")
        return Triple(text, resp.usage().inputTokens(), resp.usage().outputTokens())
    }
}

/**
 * Любой OpenAI-совместимый API (/chat/completions): DeepSeek, своя локальная модель (Ollama, LM Studio,
 * llama.cpp server), OpenRouter, Groq, Mistral, Gemini и т.п.
 */
class OpenAiCompatProvider(
    override val name: String,
    baseUrl: String,
    private val apiKey: String,
    private val model: String,
    override val priceIn: Double,
    override val priceOut: Double,
    timeoutSec: Long = 120,
) : Provider {
    private val endpoint = baseUrl.trim().trimEnd('/').let { if (it.endsWith("/chat/completions")) it else "$it/chat/completions" }
    private val http = OkHttpClient.Builder().readTimeout(timeoutSec, TimeUnit.SECONDS).callTimeout(timeoutSec + 30, TimeUnit.SECONDS).build()
    @Volatile private var jsonModeSupported = true

    override fun complete(system: String, user: String, wantJson: Boolean, maxTokens: Long): Triple<String, Long, Long> {
        return try {
            send(system, user, wantJson && jsonModeSupported, maxTokens)
        } catch (e: LlmException) {
            // Некоторые локальные серверы не знают response_format — повторяем без него
            if (wantJson && jsonModeSupported && e.message.orEmpty().contains(" 400")) {
                jsonModeSupported = false
                send(system, user, false, maxTokens)
            } else throw e
        }
    }

    private fun send(system: String, user: String, jsonMode: Boolean, maxTokens: Long): Triple<String, Long, Long> {
        val body = JSONObject()
            .put("model", model)
            .put("max_tokens", maxTokens)
            .put("stream", false)
            .put("messages", JSONArray()
                .put(JSONObject().put("role", "system").put("content", system))
                .put(JSONObject().put("role", "user").put("content", user)))
        if (jsonMode) body.put("response_format", JSONObject().put("type", "json_object"))
        val req = Request.Builder().url(endpoint)
            .apply { if (apiKey.isNotBlank()) header("Authorization", "Bearer $apiKey") }
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { r ->
            val txt = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw LlmException("$name ${r.code}: ${txt.take(300)}")
            val o = JSONObject(txt)
            var content = o.getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content")
            // Модели с «размышлениями» (Qwen3, DeepSeek-R1) иногда пишут <think>…</think> — убираем
            content = content.replace(Regex("<think>.*?</think>", RegexOption.DOT_MATCHES_ALL), "").trim()
            val u = o.optJSONObject("usage")
            return Triple(content, u?.optLong("prompt_tokens") ?: 0, u?.optLong("completion_tokens") ?: 0)
        }
    }
}

/** Набор провайдеров с fallback или round_robin («вперемешку»). */
class Llm(private val ctx: Context, private val log: (String) -> Unit) {
    private val providers = mutableListOf<Provider>()
    private val roundRobin = Prefs.get(ctx, "strategy").trim() == "round_robin"
    private var turn = 0
    private val usage = mutableMapOf<String, DoubleArray>() // in, out, cost

    init {
        val order = Prefs.list(ctx, "providers").toMutableList()
        // Своя модель указана, но не добавлена в порядок — добавляем последней (запасной)
        if (Prefs.get(ctx, "custom_base_url").isNotBlank() && order.none { it.equals("custom", true) || it.equals("local", true) }) order += "custom"
        for (name in order) {
            when (name.lowercase()) {
                "claude" -> Prefs.get(ctx, "anthropic_key").trim().takeIf { it.isNotEmpty() }
                    ?.let { providers += ClaudeProvider(it, Prefs.get(ctx, "claude_model").trim()) }
                "deepseek" -> Prefs.get(ctx, "deepseek_key").trim().takeIf { it.isNotEmpty() }
                    ?.let { providers += OpenAiCompatProvider("deepseek", "https://api.deepseek.com", it, Prefs.get(ctx, "deepseek_model").trim(), 0.28, 0.42) }
                "custom", "local" -> Prefs.get(ctx, "custom_base_url").trim().takeIf { it.isNotEmpty() }?.let { url ->
                    fun price(k: String) = Prefs.get(ctx, k).replace(',', '.').toDoubleOrNull() ?: 0.0
                    providers += OpenAiCompatProvider(
                        Prefs.get(ctx, "custom_name").trim().ifBlank { "своя модель" }, url,
                        Prefs.get(ctx, "custom_key").trim(), Prefs.get(ctx, "custom_model").trim(),
                        price("custom_price_in"), price("custom_price_out"),
                        timeoutSec = Prefs.int(ctx, "custom_timeout").coerceIn(30, 1800).toLong(),
                    )
                }
            }
        }
        if (providers.isEmpty()) throw LlmException("Не настроена ни одна нейросеть: укажите ключ Claude/DeepSeek или адрес своей модели в настройках (и добавьте её в «Порядок провайдеров»)")
    }

    val claude: ClaudeProvider? get() = providers.filterIsInstance<ClaudeProvider>().firstOrNull()

    fun complete(system: String, user: String, wantJson: Boolean = false, maxTokens: Long = 4000): String {
        val order = if (roundRobin) {
            val k = turn++ % providers.size
            providers.drop(k) + providers.take(k)
        } else providers
        val budget = Prefs.get(ctx, "daily_budget").replace(',', '.').toDoubleOrNull() ?: 0.0
        if (budget > 0 && Usage.todayCost(ctx) >= budget) {
            throw BudgetException("Дневной бюджет на нейросеть исчерпан (${Usage.money(budget)}). Увеличьте его в настройках или продолжите завтра.")
        }
        var last: Exception? = null
        var accessErrors = 0
        for (p in order) {
            try {
                val (text, tin, tout) = p.complete(system, user, wantJson, maxTokens)
                val cost = tin / 1e6 * p.priceIn + tout / 1e6 * p.priceOut
                val u = usage.getOrPut(p.name) { DoubleArray(3) }
                u[0] += tin.toDouble(); u[1] += tout.toDouble()
                u[2] += cost
                Usage.add(ctx, p.name, tin, tout, cost)
                if (text.isNotBlank()) return text.trim()
                last = LlmException("${p.name}: пустой ответ")
            } catch (e: Exception) {
                last = e
                val m = e.message.orEmpty()
                if (Regex("\\b(401|403)\\b").containsMatchIn(m) || m.contains("forbidden", true) || m.contains("authentication", true)) accessErrors++
                log("[llm] ${p.name}: ошибка — $m; пробую следующего")
            }
        }
        if (accessErrors == order.size) {
            val m = last?.message.orEmpty()
            throw LlmAccessException(
                if (m.contains("not allowed", true) || m.contains("forbidden", true))
                    "Нейросеть отказала в доступе (403 «Request not allowed»). Для Claude это значит, что запрос пришёл из страны, " +
                        "где Anthropic не работает (в т.ч. Россия). Включите VPN для всего телефона (или добавьте «HH Автоотклик» " +
                        "в приложения VPN) — либо укажите ключ DeepSeek или свою модель в настройках."
                else "Нейросеть отказала в доступе (${m.take(120)}). Проверьте ключ и баланс в настройках."
            )
        }
        throw LlmException("Все провайдеры упали: ${last?.message}")
    }

    fun completeJson(system: String, user: String, maxTokens: Long = 4000): JSONObject =
        parseJson(complete(system, "$user\n\nОтветь только JSON-объектом.", true, maxTokens))

    fun report(): String = if (usage.isEmpty()) "LLM не вызывался" else usage.entries.joinToString("\n") { (n, u) ->
        "$n: ${u[0].toLong()} вх. / ${u[1].toLong()} вых. токенов ≈ $" + String.format("%.4f", u[2])
    }

    companion object {
        fun parseJson(text: String): JSONObject {
            val t = text.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
            return try {
                JSONObject(t)
            } catch (e: Exception) {
                val m = Regex("\\{.*\\}", RegexOption.DOT_MATCHES_ALL).find(t)
                    ?: throw LlmException("Не удалось разобрать JSON: ${t.take(200)}")
                JSONObject(m.value)
            }
        }
    }
}
