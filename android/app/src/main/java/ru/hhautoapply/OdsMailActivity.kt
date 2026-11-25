package ru.hhautoapply

import android.os.Bundle
import android.text.InputType
import android.view.WindowManager
import android.widget.EditText
import android.widget.ScrollView
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class OdsMailActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val existing = OdsMail.load(this)
        val box = vbox()
        box.addView(label("Используйте пароль приложения из настроек почты. Он хранится на этом телефоне.", 14f))
        fun field(hint: String, value: String, type: Int) = EditText(this).apply {
            this.hint = hint
            setSingleLine(true)
            inputType = type
            setText(value)
            box.addView(this)
        }
        val address = field("Почтовый адрес", existing?.address.orEmpty().ifBlank { Prefs.get(this, "email") },
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val host = field("Сервер SMTP (Gmail, Яндекс, Mail.ru — автоматически)", existing?.host.orEmpty(), InputType.TYPE_CLASS_TEXT)
        val port = field("Порт SMTP (465 или 587)", (existing?.port ?: 465).toString(), InputType.TYPE_CLASS_NUMBER)
        val password = field("Пароль приложения", "", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD).apply {
            isSaveEnabled = false
        }
        val status = label(if (existing != null) "Подключена почта: ${existing.address}" else "", 14f)
        val connectButton = button("Проверить вход и сохранить") {}
        val disconnectButton = button("Отключить почту") {
            OdsMail.disconnect(this)
            finish()
        }.apply { isEnabled = existing != null }
        box.addView(connectButton)
        box.addView(disconnectButton)
        box.addView(status)
        connectButton.setOnClickListener {
            val config = OdsMail.config(address.text.toString(), host.text.toString(), port.text.toString(), password.text.toString())
            if (config == null) {
                status.text = "Проверьте почтовый адрес, SMTP-сервер, порт и пароль приложения."
                return@setOnClickListener
            }
            connectButton.isEnabled = false
            disconnectButton.isEnabled = false
            status.text = "Проверяю вход…"
            lifecycleScope.launch {
                val ok = withContext(Dispatchers.IO) {
                    runCatching { OdsMail.test(config); OdsMail.save(this@OdsMailActivity, config) }.isSuccess
                }
                connectButton.isEnabled = true
                disconnectButton.isEnabled = ok || existing != null
                if (ok) password.text.clear()
                status.text = if (ok) "Подключена почта: ${config.address}" else "Не удалось подключить почту. Проверьте настройки SMTP и пароль приложения."
            }
        }
        setContentView(ScrollView(this).apply { addView(box) })
    }
}
