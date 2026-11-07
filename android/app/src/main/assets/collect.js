(() => {
  const visible = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && (r.width > 0 || r.height > 0 || el.type === 'file' || el.type === 'radio' || el.type === 'checkbox');
  };
  const labelOf = el => {
    let t = '';
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.innerText; }
    if (!t) { const l = el.closest('label'); if (l) t = l.innerText; }
    if (!t) t = el.getAttribute('aria-label') || '';
    if (!t) { const by = el.getAttribute('aria-labelledby'); if (by) { const n = document.getElementById(by); if (n) t = n.innerText; } }
    if (!t) t = el.placeholder || '';
    return (t || '').trim().slice(0, 300);
  };
  const questionOf = (el, maxInputs) => {
    // Текст вопроса: ближайший контейнер, в котором нет чужих полей (только это поле / эта группа)
    let n = el.parentElement;
    for (let i = 0; i < 6 && n; i++, n = n.parentElement) {
      if (n.tagName === 'FORM' || n.tagName === 'BODY') break;
      if (n.querySelectorAll('input:not([type=hidden]),textarea,select').length > maxInputs) break;
      if (n.tagName === 'FIELDSET') { const lg = n.querySelector(':scope > legend'); if (lg) return lg.innerText.trim().slice(0, 400); }
      const txt = (n.innerText || '').trim();
      if (txt.length > 15) return txt.slice(0, 400);
    }
    return '';
  };
  const out = []; let k = 0; const groups = {};
  for (const el of document.querySelectorAll('input, textarea, select')) {
    const type = (el.tagName === 'INPUT' ? (el.type || 'text') : el.tagName.toLowerCase());
    if (['hidden','submit','button','image','reset'].includes(type) || el.disabled || !visible(el)) continue;
    const id = 'f' + (k++);
    el.setAttribute('data-aa-id', id);
    if (type === 'radio' || type === 'checkbox') {
      const key = type + ':' + (el.name || id);
      if (!groups[key]) {
        const size = el.name ? document.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`).length : 1;
        groups[key] = { id: key, type, question: questionOf(el, size), options: [] }; out.push(groups[key]);
      }
      groups[key].options.push({ id, label: labelOf(el) || el.value });
      continue;
    }
    const item = { id, type, label: labelOf(el), name: el.name || '', required: el.required, question: questionOf(el, 1) };
    if (type === 'select') item.options = [...el.options].map(o => o.text.trim()).filter(Boolean).slice(0, 60);
    if (el.value) item.current_value = String(el.value).slice(0, 200);
    out.push(item);
  }
  return out;
})()
