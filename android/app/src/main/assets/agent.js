// Помощники браузерного агента. Внедряются на страницу перед каждым шагом.
window.__ag = (function () {
  const vis = el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const clean = t => (t || '').replace(/\s+/g, ' ').trim();
  const labelOf = el => {
    let t = '';
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) t = l.innerText; }
    if (!t) { const l = el.closest('label'); if (l) t = l.innerText; }
    if (!t) t = el.getAttribute('aria-label') || el.placeholder || el.title || '';
    return clean(t).slice(0, 120);
  };
  const el = id => document.querySelector('[data-ag-id="' + id + '"]');
  const setValue = (e, text) => {
    e.focus();
    if (e.isContentEditable) { e.innerText = text; }
    else {
      const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, text);
    }
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    e.dispatchEvent(new Event('blur', { bubbles: true }));
  };

  return {
    // Снимок страницы: интерактивные элементы (сначала поля и кнопки, потом ссылки) + видимый текст.
    snapshot() {
      document.querySelectorAll('[data-ag-id]').forEach(e => e.removeAttribute('data-ag-id'));
      const controls = [], links = [];
      let k = 0;
      const sel = 'button, input, textarea, select, [contenteditable="true"], [role=button], [role=checkbox], [role=radio], ' +
        '[role=option], [role=tab], [role=combobox], summary, a[href], label';
      for (const e of document.querySelectorAll(sel)) {
        const type = (e.type || '').toLowerCase();
        if (type === 'hidden' || e.disabled) continue;
        // label берём только если её поле скрыто (кастомные радио/чекбоксы)
        if (e.tagName === 'LABEL') {
          const c = e.control || e.querySelector('input');
          if (!c || vis(c)) continue;
        }
        if (!vis(e) && type !== 'file') continue;
        const id = 'e' + (k++);
        e.setAttribute('data-ag-id', id);
        const item = { id, tag: e.tagName.toLowerCase() };
        if (type) item.type = type;
        const isField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.tagName) || e.isContentEditable;
        const text = isField ? labelOf(e) : clean(e.innerText || e.value || e.getAttribute('aria-label') || e.title).slice(0, 90);
        if (text) item.text = text;
        if (e.name) item.name = e.name.slice(0, 40);
        const qa = e.getAttribute('data-qa'); if (qa) item.qa = qa.slice(0, 60);
        if (type === 'checkbox' || type === 'radio') item.checked = e.checked;
        if (e.tagName === 'SELECT') item.options = [...e.options].map(o => clean(o.text)).filter(Boolean).slice(0, 30);
        if (isField && e.tagName !== 'SELECT' && type !== 'checkbox' && type !== 'radio') item.value = clean(e.value || e.innerText).slice(0, 60);
        if (e.required) item.required = true;
        if (e.tagName === 'A') { item.href = (e.getAttribute('href') || '').slice(0, 80); links.push(item); } else controls.push(item);
      }
      const elements = controls.slice(0, 110).concat(links.slice(0, 150 - Math.min(110, controls.length)));
      const text = clean((document.body ? document.body.innerText : '')).slice(0, 2500);
      return JSON.stringify({ url: location.href, title: document.title, text, elements });
    },
    click(id) { const e = el(id); if (!e) return 'missing'; e.scrollIntoView({ block: 'center' }); e.click(); return 'ok'; },
    type(id, text) { const e = el(id); if (!e) return 'missing'; e.scrollIntoView({ block: 'center' }); setValue(e, text); return 'ok'; },
    select(id, option) {
      const e = el(id); if (!e) return 'missing';
      const o = [...e.options].find(x => clean(x.text) === clean(option)) || [...e.options].find(x => clean(x.text).includes(clean(option)));
      if (!o) return 'no-option';
      e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); return 'ok';
    },
    scroll(dir) { window.scrollBy(0, dir === 'up' ? -700 : 700); return 'ok'; },

    // Капча / антибот-проверка: '' если нет, иначе 'auto' (проходит сама, напр. Cloudflare) или 'human'
    blocker() {
      const frames = [...document.querySelectorAll('iframe')].map(f => (f.src || '') + ' ' + (f.title || '')).join(' ').toLowerCase();
      const body = (document.body ? document.body.innerText : '').toLowerCase().slice(0, 4000);
      const title = (document.title || '').toLowerCase();
      if (/checking your browser|проверка браузера|just a moment\.\.\.|checking if the site connection is secure/.test(title + ' ' + body.slice(0, 300))) return 'auto';
      const captchaEl = document.querySelector('.g-recaptcha, .h-captcha, .smart-captcha, [class*="captcha" i], [id*="captcha" i], input[name*="captcha" i], .cf-turnstile');
      const captchaFrame = /recaptcha|hcaptcha|smartcaptcha|captcha|turnstile|challenges\.cloudflare/.test(frames);
      const captchaText = /не робот|подтвердите, что вы человек|i'm not a robot|i am not a robot|verify you are human|введите символы с картинки|enter the characters/.test(body);
      return (captchaEl && vis(captchaEl)) || captchaFrame || captchaText ? 'human' : '';
    },

    // Список резюме в профиле hh: ссылки вида /resume/<hash>
    hhResumes() {
      const out = [], seen = new Set();
      for (const a of document.querySelectorAll('a[href*="/resume/"]')) {
        const m = (a.getAttribute('href') || '').match(/\/resume\/([0-9a-f]{20,})/i);
        if (!m || seen.has(m[1])) continue;
        const t = clean(a.innerText);
        if (t.length < 3) continue;
        seen.add(m[1]);
        out.push({ id: m[1], title: t.slice(0, 120) });
      }
      return JSON.stringify(out);
    },

    // Заполнить пустые поля про зарплату (по подписи/плейсхолдеру/имени поля)
    fillSalary(value) {
      const re = /зарплат|заработн|з\/п|оклад|доход|ожидани|вознагражден|salary|compensation|expected pay|desired pay/i;
      let n = 0;
      for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea')) {
        if (!vis(e) || (e.value || '').trim() === String(value)) continue;
        const q = labelOf(e) + ' ' + (e.name || '') + ' ' + (e.id || '');
        if (re.test(q)) { setValue(e, value); n++; }
      }
      return String(n);
    },

    // ---------- hh.ru ----------
    has(sel) { return !!document.querySelector(sel); },
    clickSel(sel) {
      const e = [...document.querySelectorAll(sel)].find(vis) || document.querySelector(sel);
      if (!e) return 'missing'; e.scrollIntoView({ block: 'center' }); e.click(); return 'ok';
    },
    fillSel(sel, text) { const e = document.querySelector(sel); if (!e) return 'missing'; setValue(e, text); return 'ok'; },
    textOf(sel) { const e = document.querySelector(sel); return e ? clean(e.innerText) : ''; },
    bodyText() { return clean(document.body ? document.body.innerText : '').slice(0, 9000); },
    hhLinks() {
      const out = [], seen = new Set();
      const anchors = document.querySelectorAll('a[data-qa*="serp-item__title"], a[href*="/vacancy/"]');
      for (const a of anchors) {
        const m = (a.getAttribute('href') || '').match(/\/vacancy\/(\d+)/);
        if (!m || seen.has(m[1])) continue;
        const t = clean(a.innerText);
        if (t.length < 3) continue;
        seen.add(m[1]);
        out.push({ id: m[1], title: t.slice(0, 150) });
      }
      return JSON.stringify(out);
    },
    // Выбор резюме в окне отклика: радиокнопка, рядом с которой название резюме
    pickResume(title) {
      const radios = [...document.querySelectorAll('input[type=radio]')];
      if (radios.length === 0) return 'none';
      const want = clean(title).toLowerCase();
      const textOf = r => { const box = r.closest('label') || r.parentElement; return clean(box ? box.innerText : '').toLowerCase(); };
      // Сначала точное совпадение названия, потом «содержит» (иначе RU-резюме спутается с «… (EN)»)
      let best = want ? radios.find(r => textOf(r) === want) || null : null;
      if (!best && want) {
        const hits = radios.filter(r => textOf(r).includes(want)).sort((a, b) => textOf(a).length - textOf(b).length);
        best = hits[0] || null;
      }
      if (!best) return 'not-found';
      if (!best.checked) (best.closest('label') || best).click();
      return 'ok';
    },
  };
})();
'ready';
