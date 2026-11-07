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

class LlmException(msg: String) : Exception(msg)

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

class DeepSeekProvider(private val apiKey: String, private val model: String) : Provider {
    override val name = "deepseek"
    override val priceIn = 0.28
    override val priceOut = 0.42
    private val http = OkHttpClient.Builder().readTimeout(120, TimeUnit.SECONDS).build()

    override fun complete(system: String, user: String, wantJson: Boolean, maxTokens: Long): Triple<String, Long, Long> {
        val body = JSONObject()
            .put("model", model)
            .put("max_tokens", maxTokens)
            .put("messages", JSONArray()
                .put(JSONObject().put("role", "system").put("content", system))
                .put(JSONObject().put("role", "user").put("content", user)))
        if (wantJson) body.put("response_format", JSONObject().put("type", "json_object"))
        val req = Request.Builder()
            .url("https://api.deepseek.com/chat/completions")
            .header("Authorization", "Bearer $apiKey")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(req).execute().use { r ->
            val txt = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw LlmException("DeepSeek ${r.code}: ${txt.take(300)}")
            val o = JSONObject(txt)
            val content = o.getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content")
            val u = o.optJSONObject("usage")
            return Triple(content, u?.optLong("prompt_tokens") ?: 0, u?.optLong("completion_tokens") ?: 0)
        }
    }
}

/** Набор провайдеров с fallback или round_robin («вперемешку»). */
class Llm(ctx: Context, private val log: (String) -> Unit) {
    private val providers = mutableListOf<Provider>()
    private val roundRobin = Prefs.get(ctx, "strategy").trim() == "round_robin"
    private var turn = 0
    private val usage = mutableMapOf<String, DoubleArray>() // in, out, cost

    init {
        for (name in Prefs.list(ctx, "providers")) {
            when (name.lowercase()) {
                "claude" -> Prefs.get(ctx, "anthropic_key").trim().takeIf { it.isNotEmpty() }
                    ?.let { providers += ClaudeProvider(it, Prefs.get(ctx, "claude_model").trim()) }
                "deepseek" -> Prefs.get(ctx, "deepseek_key").trim().takeIf { it.isNotEmpty() }
                    ?.let { providers += DeepSeekProvider(it, Prefs.get(ctx, "deepseek_model").trim()) }
            }
        }
        if (providers.isEmpty()) throw LlmException("Не указан ни один ключ нейросети в настройках")
    }

    val claude: ClaudeProvider? get() = providers.filterIsInstance<ClaudeProvider>().firstOrNull()

    fun complete(system: String, user: String, wantJson: Boolean = false, maxTokens: Long = 4000): String {
        val order = if (roundRobin) {
            val k = turn++ % providers.size
            providers.drop(k) + providers.take(k)
        } else providers
        var last: Exception? = null
        for (p in order) {
            try {
                val (text, tin, tout) = p.complete(system, user, wantJson, maxTokens)
                val u = usage.getOrPut(p.name) { DoubleArray(3) }
                u[0] += tin.toDouble(); u[1] += tout.toDouble()
                u[2] += tin / 1e6 * p.priceIn + tout / 1e6 * p.priceOut
                if (text.isNotBlank()) return text.trim()
                last = LlmException("${p.name}: пустой ответ")
            } catch (e: Exception) {
                last = e
                log("[llm] ${p.name}: ошибка — ${e.message}; пробую следующего")
            }
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
