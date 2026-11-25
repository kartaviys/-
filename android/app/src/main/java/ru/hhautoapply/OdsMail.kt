package ru.hhautoapply

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.Properties
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.mail.Message
import javax.mail.MessagingException
import javax.mail.Session
import javax.mail.Transport
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeBodyPart
import javax.mail.internet.MimeMessage
import javax.mail.internet.MimeMultipart

object OdsMail {
    class Config(val address: String, val host: String, val port: Int, val password: String)
    enum class Result { SENT, UNAVAILABLE, UNCONFIRMED }

    private const val configKey = "ods_smtp_connection"
    private const val keyAlias = "ods-smtp"
    private val hostPattern = Regex("[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)+")

    fun defaultHost(address: String): String? = when (address.substringAfter('@').lowercase()) {
        "gmail.com", "googlemail.com" -> "smtp.gmail.com"
        "yandex.ru", "yandex.com", "ya.ru" -> "smtp.yandex.ru"
        "mail.ru", "bk.ru", "inbox.ru", "list.ru", "internet.ru" -> "smtp.mail.ru"
        else -> null
    }

    fun config(address: String, host: String, port: String, password: String): Config? {
        val sender = OdsOutreach.email(address) ?: return null
        val server = host.trim().ifBlank { defaultHost(sender).orEmpty() }
        val securePort = port.trim().toIntOrNull()?.takeIf { it == 465 || it == 587 } ?: return null
        if (!hostPattern.matches(server) || password.isBlank()) return null
        return Config(sender, server, securePort, password.trim())
    }

    fun load(ctx: Context): Config? {
        val encrypted = Prefs.get(ctx, configKey)
        if (encrypted.isBlank()) return null
        return runCatching {
            val bytes = Base64.decode(encrypted, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            val key = keyStore().getKey(keyAlias, null) as SecretKey
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes, 0, 12))
            val json = JSONObject(cipher.doFinal(bytes, 12, bytes.size - 12).toString(Charsets.UTF_8))
            Config(json.getString("address"), json.getString("host"), json.getInt("port"), json.getString("password"))
        }.getOrNull()
    }

    fun save(ctx: Context, config: Config) {
        val key = keyStore().getKey(keyAlias, null) as? SecretKey ?: KeyGenerator
            .getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
                init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build())
                generateKey()
            }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val json = JSONObject().put("address", config.address).put("host", config.host)
            .put("port", config.port).put("password", config.password)
        Prefs.set(ctx, configKey, Base64.encodeToString(cipher.iv + cipher.doFinal(json.toString().toByteArray()), Base64.NO_WRAP))
    }

    fun disconnect(ctx: Context) = Prefs.set(ctx, configKey, "")

    private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    private fun session(config: Config): Session = Session.getInstance(Properties().apply {
        setProperty("mail.smtp.auth", "true")
        setProperty("mail.smtp.ssl.checkserveridentity", "true")
        setProperty("mail.smtp.ssl.protocols", "TLSv1.2")
        if (config.port == 465) setProperty("mail.smtp.ssl.enable", "true")
        else {
            setProperty("mail.smtp.starttls.enable", "true")
            setProperty("mail.smtp.starttls.required", "true")
        }
        setProperty("mail.smtp.connectiontimeout", "12000")
        setProperty("mail.smtp.timeout", "20000")
        setProperty("mail.smtp.writetimeout", "20000")
        setProperty("mail.smtp.quitwait", "false")
    })

    private fun connect(session: Session, config: Config): Transport {
        val transport = session.getTransport("smtp")
        try {
            transport.connect(config.host, config.port, config.address, config.password)
            return transport
        } catch (e: MessagingException) {
            runCatching { transport.close() }
            throw e
        }
    }

    fun test(config: Config) {
        val transport = connect(session(config), config)
        runCatching { transport.close() }
    }

    fun send(config: Config, to: String, subject: String, text: String, attachments: List<File>): Result {
        val session = session(config)
        val message = try {
            MimeMessage(session).apply {
                setFrom(InternetAddress(config.address, true))
                setRecipient(Message.RecipientType.TO, InternetAddress(to, true))
                setSubject(subject.replace(Regex("[\\r\\n]"), " "), "UTF-8")
                if (attachments.isEmpty()) setText(text, "UTF-8")
                else {
                    val parts = MimeMultipart()
                    parts.addBodyPart(MimeBodyPart().apply { setText(text, "UTF-8") })
                    for (attachment in attachments) parts.addBodyPart(MimeBodyPart().apply { attachFile(attachment) })
                    setContent(parts)
                }
                saveChanges()
            }
        } catch (_: Exception) {
            return Result.UNAVAILABLE
        }
        val transport = try {
            connect(session, config)
        } catch (_: MessagingException) {
            return Result.UNAVAILABLE
        }
        return try {
            transport.sendMessage(message, message.allRecipients)
            Result.SENT
        } catch (_: MessagingException) {
            Result.UNCONFIRMED
        } finally {
            runCatching { transport.close() }
        }
    }
}
