package ru.hhautoapply

import android.content.Context
import android.graphics.Typeface
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Небольшие помощники для вёрстки кодом (без XML). */
fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

fun Context.vbox(pad: Int = 16) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(pad), dp(pad), dp(pad), dp(pad))
}

fun Context.header(text: String) = TextView(this).apply {
    this.text = text
    textSize = 18f
    setTypeface(typeface, Typeface.BOLD)
    setPadding(0, dp(16), 0, dp(6))
}

fun Context.label(text: String, size: Float = 14f) = TextView(this).apply {
    this.text = text
    textSize = size
    setPadding(0, dp(4), 0, dp(2))
}

fun Context.button(text: String, onClick: (View) -> Unit) = Button(this).apply {
    this.text = text
    isAllCaps = false
    setOnClickListener(onClick)
}

fun Context.row(vararg views: View) = LinearLayout(this).apply {
    orientation = LinearLayout.HORIZONTAL
    for (v in views) addView(v, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
}
