package ru.hhautoapply

import android.content.Context
import android.net.Uri
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class HhException(val code: Int, val body: String) : Exception("hh.ru $code: ${body.take(300)}") {
    /** Коды ошибок hh: test_required, letter_required, already_applied, limit_exceeded… */
    val reasons: Set<String>
        get() = try {
            val arr = JSONObject(body).optJSONArray("errors") ?: JSONArray()
            (0 until arr.length()).mapNotNull { i ->
                val e = arr.getJSONObject(i)
                e.optString("value").ifEmpty { e.optString("type") }.ifEmpty { null }
            }.toSet()
        } catch (_: Exception) { emptySet() }
}

class HhApi(private val ctx: Context) {
    private val api = "https://api.hh.ru"
    private val http = OkHttpClient.Builder().readTimeout(60, TimeUnit.SECONDS).build()
    private val ua get() = "HHAutoApplyAndroid/1.0 (${Prefs.get(ctx, "hh_contact_email").ifBlank { "unknown" }})"

    // ---------- OAuth ----------
    fun authorizeUrl(): String = Uri.parse("https://hh.ru/oauth/authorize").buildUpon()
        .appendQueryParameter("response_type", "code")
        .appendQueryParameter("client_id", Prefs.get(ctx, "hh_client_id").trim())
        .appendQueryParameter("redirect_uri", Prefs.get(ctx, "hh_redirect_uri").trim())
        .build().toString()

    fun exchangeCode(code: String) = saveToken(postToken(FormBody.Builder()
        .add("grant_type", "authorization_code")
        .add("client_id", Prefs.get(ctx, "hh_client_id").trim())
        .add("client_secret", Prefs.get(ctx, "hh_client_secret").trim())
        .add("redirect_uri", Prefs.get(ctx, "hh_redirect_uri").trim())
        .add("code", code)
        .build()))

    private fun refresh(refreshToken: String) = saveToken(postToken(FormBody.Builder()
        .add("grant_type", "refresh_token")
        .add("refresh_token", refreshToken)
        .build()))

    private fun postToken(form: FormBody): JSONObject {
        val req = Request.Builder().url("$api/token").header("HH-User-Agent", ua).post(form).build()
        http.newCall(req).execute().use { r ->
            val body = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw HhException(r.code, body)
            val tok = JSONObject(body)
            tok.put("expires_at", System.currentTimeMillis() / 1000 + tok.optLong("expires_in") - 60)
            return tok
        }
    }

    private fun saveToken(tok: JSONObject) = Prefs.set(ctx, "hh_token", tok.toString())

    val isAuthorized: Boolean get() = Prefs.get(ctx, "hh_token").isNotBlank()

    private fun accessToken(): String {
        val raw = Prefs.get(ctx, "hh_token")
        if (raw.isBlank()) throw IllegalStateException("Нет авторизации в hh.ru — нажмите «Войти через API hh»")
        var tok = JSONObject(raw)
        if (System.currentTimeMillis() / 1000 >= tok.optLong("expires_at")) {
            refresh(tok.getString("refresh_token"))
            tok = JSONObject(Prefs.get(ctx, "hh_token"))
        }
        return tok.getString("access_token")
    }

    // ---------- запросы ----------
    private fun call(builder: Request.Builder, auth: Boolean): String {
        builder.header("HH-User-Agent", ua)
        if (auth || isAuthorized) builder.header("Authorization", "Bearer ${accessToken()}")
        val req = builder.build()
        var attempt = 0
        while (true) {
            http.newCall(req).execute().use { r ->
                val body = r.body?.string().orEmpty()
                if ((r.code == 429 || r.code >= 500) && attempt < 3) {
                    Thread.sleep(2000L shl attempt)
                    attempt++
                } else {
                    if (!r.isSuccessful) throw HhException(r.code, body)
                    return body
                }
            }
        }
    }

    fun search(text: String, page: Int): JSONObject {
        val url = "$api/vacancies".toHttpUrl().newBuilder()
            .addQueryParameter("text", text)
            .addQueryParameter("search_field", "name")
            .addQueryParameter("experience", "between3And6")
            .addQueryParameter("experience", "moreThan6")
            .addQueryParameter("area", Prefs.get(ctx, "area").trim())
            .addQueryParameter("period", Prefs.get(ctx, "period").trim())
            .addQueryParameter("order_by", "publication_time")
            .addQueryParameter("per_page", "100")
            .addQueryParameter("page", page.toString())
        if (Prefs.bool(ctx, "remote_only")) url.addQueryParameter("schedule", "remote")
        return JSONObject(call(Request.Builder().url(url.build()), auth = false))
    }

    fun vacancy(id: String): JSONObject = JSONObject(call(Request.Builder().url("$api/vacancies/$id"), auth = false))

    fun myResumes(): JSONArray =
        JSONObject(call(Request.Builder().url("$api/resumes/mine"), auth = true)).optJSONArray("items") ?: JSONArray()

    fun apply(vacancyId: String, resumeId: String, message: String) {
        val form = FormBody.Builder().add("vacancy_id", vacancyId).add("resume_id", resumeId)
        if (message.isNotBlank()) form.add("message", message)
        call(Request.Builder().url("$api/negotiations").post(form.build()), auth = true)
    }
}
