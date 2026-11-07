package ru.hhautoapply

import android.os.Bundle
import android.text.InputType
import android.widget.CheckBox
import android.widget.EditText
import android.widget.ScrollView
import android.widget.Toast
import androidx.activity.ComponentActivity

class SettingsActivity : ComponentActivity() {
    private val editors = mutableMapOf<String, Any>() // EditText или CheckBox

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val box = vbox()
        box.addView(label("Ключи хранятся только на этом телефоне.", 13f))
        for (section in Prefs.sections) {
            box.addView(header(section.title))
            for (f in section.fields) {
                if (f.type == FieldType.BOOL) {
                    val cb = CheckBox(this).apply { text = f.label; isChecked = Prefs.bool(this@SettingsActivity, f.key) }
                    editors[f.key] = cb
                    box.addView(cb)
                    continue
                }
                box.addView(label(f.label, 13f))
                val et = EditText(this).apply {
                    setText(Prefs.get(this@SettingsActivity, f.key))
                    inputType = when (f.type) {
                        FieldType.SECRET -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                        FieldType.NUMBER -> InputType.TYPE_CLASS_NUMBER
                        FieldType.MULTILINE -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
                        else -> InputType.TYPE_CLASS_TEXT
                    }
                    if (f.type == FieldType.MULTILINE) { minLines = 3; maxLines = 12 }
                }
                editors[f.key] = et
                box.addView(et)
            }
        }
        box.addView(button("Сохранить") { save(); finish() })
        setContentView(ScrollView(this).apply { addView(box) })
    }

    override fun onPause() {
        super.onPause()
        save()
    }

    private fun save() {
        for ((key, view) in editors) {
            val value = when (view) {
                is CheckBox -> view.isChecked.toString()
                is EditText -> view.text.toString()
                else -> continue
            }
            Prefs.set(this, key, value)
        }
        RunWorker.scheduleDaily(this)
        Toast.makeText(this, "Сохранено", Toast.LENGTH_SHORT).show()
    }
}
