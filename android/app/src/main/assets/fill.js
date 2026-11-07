// window.__aaFill(id, value): заполняет поле так, чтобы React/Vue заметили изменение.
window.__aaFill = function (id, value) {
  const el = document.querySelector('[data-aa-id="' + id + '"]');
  if (!el) return 'missing';
  el.scrollIntoView({ block: 'center' });
  const tag = el.tagName;
  const type = (el.type || '').toLowerCase();
  if (type === 'radio' || type === 'checkbox') {
    if (!el.checked) el.click();
    return 'ok';
  }
  if (tag === 'SELECT') {
    const opt = [...el.options].find(o => o.text.trim() === String(value).trim());
    if (!opt) return 'no-option';
    el.value = opt.value;
  } else {
    const proto = tag === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return 'ok';
};
// window.__aaSubmit(): нажимает кнопку отправки/«Далее».
window.__aaSubmit = function () {
  const re = /^\s*(отправить|откликнуться|подтвердить|далее|продолжить|готово|submit|apply|send|next|continue|finish)/i;
  for (const b of document.querySelectorAll('button, input[type=submit], [role=button]')) {
    const r = b.getBoundingClientRect();
    if (b.disabled || r.width === 0) continue;
    const label = (b.innerText || b.value || '').trim();
    if (re.test(label)) { b.click(); return label; }
  }
  return '';
};
'ready';
