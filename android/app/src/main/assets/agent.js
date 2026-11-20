// Помощники браузерного агента. Внедряются на страницу перед каждым шагом.
window.__ag = (function () {
  const vis = el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const clean = t => (t || '').replace(/\s+/g, ' ').trim();
  const HABR_APPLIED = /Вы откликнулись|Вы уже откликнулись|Отклик отправлен|Ваш отклик отправлен|Отклик на вакансию отправлен|Вы отправили отклик|Отозвать отклик/i;
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
      const full = (document.body ? document.body.innerText : '').toLowerCase();
      // всплывающее окно капчи (hh — нижняя шторка) часто в конце страницы — смотрим начало и конец текста
      const body = full.length > 8000 ? full.slice(0, 4000) + ' ' + full.slice(-4000) : full;
      const title = (document.title || '').toLowerCase();
      if (/checking your browser|проверка браузера|just a moment\.\.\.|checking if the site connection is secure/.test(title + ' ' + body.slice(0, 300))) return 'auto';
      const captchaEl = document.querySelector('.g-recaptcha, .h-captcha, .smart-captcha, [class*="captcha" i], [id*="captcha" i], input[name*="captcha" i], .cf-turnstile');
      const captchaFrame = /recaptcha|hcaptcha|smartcaptcha|captcha|turnstile|challenges\.cloudflare/.test(frames);
      const captchaText = /не робот|подтвердите, что вы человек|i'm not a robot|i am not a robot|verify you are human|введите символы с картинки|введите текст с картинки|пройдите капчу|текст с картинки|enter the characters|solve the captcha/.test(body);
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

    // ---------- Контакты HR на странице вакансии (ODS и др.) ----------
    // Нажать «Показать контакты» / «Откликнуться» (кнопка на этой же странице, не внешняя ссылка)
    contactsReveal() {
      const re = /показать контакт|контакты|связаться|откликнуться|show contact|contacts|contact|respond|apply/i;
      const b = [...document.querySelectorAll('button, [role=button], a')].find(x => {
        if (!vis(x) || !re.test(clean(x.innerText))) return false;
        const h = x.tagName === 'A' ? (x.getAttribute('href') || '') : '';
        return !h || h.startsWith('#') || h.startsWith('javascript');
      });
      if (!b) return 'missing';
      b.scrollIntoView({ block: 'center' }); b.click(); return 'ok';
    },
    // Email, Telegram, телефоны, LinkedIn, ссылки на отклик + признак «нужен вход»
    contacts() {
      const text = document.body ? document.body.innerText : '';
      const uniq = a => [...new Set(a.map(x => x.trim()).filter(Boolean))];
      const emails = (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []);
      const tgText = (text.match(/(?:^|[\s(,:])@([A-Za-z][A-Za-z0-9_]{4,31})\b/g) || []).map(s => '@' + s.replace(/^[^@]*@/, ''));
      const phones = (text.match(/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g) || []);
      const tg = [], li = [], apply = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const h = a.href || '';
        if (h.startsWith('mailto:')) emails.push(h.slice(7).split('?')[0]);
        else if (h.startsWith('tel:')) phones.push(h.slice(4));
        else if (/^https?:\/\/(t\.me|telegram\.me)\//.test(h) && !/\/s\/|\/joinchat|\/share/.test(h)) tg.push(h.split('?')[0]);
        else if (/linkedin\.com\/in\//.test(h)) li.push(h.split('?')[0]);
        else if (/apply|vacanc|career|job|hh\.ru\/vacancy|forms\.|docs\.google\.com\/forms|typeform/i.test(h) && !/ods\.ai/.test(h)) apply.push(h);
      }
      const block = (() => {
        const m = text.match(/(контакт[^\n]{0,20}\n?[\s\S]{0,300}|contact[^\n]{0,20}\n?[\s\S]{0,300})/i);
        return m ? clean(m[0]).slice(0, 300) : '';
      })();
      const loginRequired = /войдите|авторизуйтесь|зарегистрируйтесь|log ?in to|sign in to|чтобы увидеть контакт/i.test(text) &&
        !emails.length && !tg.length && !tgText.length;
      return JSON.stringify({
        emails: uniq(emails).filter(e => !/ods\.ai|example\.|sentry/i.test(e)).slice(0, 5),
        telegrams: uniq([...tg, ...tgText.map(t => 'https://t.me/' + t.slice(1))]).filter(t => !/odsjobs|opendatascience|ods_ai/i.test(t)).slice(0, 5),
        phones: uniq(phones).slice(0, 3), linkedin: uniq(li).slice(0, 3), apply: uniq(apply).slice(0, 3), block, loginRequired,
      });
    },

    // ---------- Общий агент сайтов ----------
    // Ссылки на вакансии по шаблону (регулярное выражение по полному адресу)
    siteLinks(pattern) {
      const re = new RegExp(pattern, 'i');
      const out = [], seen = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href || '';
        const m = href.match(re);
        if (!m) continue;
        const key = m[0];
        if (seen.has(key)) {
          // у той же вакансии может быть ссылка с текстом — дополним пустое название
          const ex = out.find(o => o.key === key);
          if (ex && !ex.title) ex.title = clean(a.innerText || a.getAttribute('aria-label')).slice(0, 150);
          continue;
        }
        seen.add(key);
        const card = a.closest('li, article, [class*="card" i], [class*="vacanc" i], [class*="job" i]');
        const ct = card ? clean(card.innerText).slice(0, 1500) : '';
        out.push({ key, id: m[1] || '', url: href.split('#')[0], title: clean(a.innerText || a.getAttribute('aria-label') || a.title).slice(0, 150),
          applied: /Вы откликнулись|Отклик отправлен|Applied\b|Application sent|Already applied/.test(ct) });
      }
      for (const o of out) if (!o.title) { o.title = ''; }
      return JSON.stringify(out);
    },
    // Все ссылки страницы (для случая, когда шаблон не сработал — выберет нейросеть)
    allLinks() {
      const out = [], seen = new Set();
      for (const a of document.querySelectorAll('a[href]')) {
        const href = (a.href || '').split('#')[0];
        const t = clean(a.innerText || a.getAttribute('aria-label')).slice(0, 100);
        if (!/^https?:/.test(href) || t.length < 4 || seen.has(href)) continue;
        seen.add(href);
        out.push({ url: href, title: t });
        if (out.length >= 160) break;
      }
      return JSON.stringify(out);
    },
    pageApplied() {
      const t = clean(document.body ? document.body.innerText : '').slice(0, 8000);
      return /Вы откликнулись|Вы уже откликнулись|Отклик отправлен|You applied|Applied on|Application submitted|already applied/i.test(t) ? 'true' : 'false';
    },

    // ---------- Хабр Карьера ----------
    habrLoggedIn() {
      const login = [...document.querySelectorAll('a, button')].find(x => vis(x) &&
        /^(войти|вход|sign in|log in)$/i.test(clean(x.innerText)) );
      const signIn = document.querySelector('a[href*="sign_in"], a[href*="account.habr.com/login"], a[href*="/users/auth"]');
      return (login || (signIn && vis(signIn))) ? 'false' : 'true';
    },
    // Отклик уже есть: текст на странице или кнопка/ссылка «Ваш отклик», «Отозвать», ссылка на /responses
    habrApplied() {
      const body = clean(document.body ? document.body.innerText : '').slice(0, 8000);
      if (HABR_APPLIED.test(body)) return 'true';
      const el = [...document.querySelectorAll('a, button')].find(x => vis(x) &&
        (/^(ваш отклик|мой отклик|отклик отправлен|вы откликнулись|посмотреть отклик|отозвать( отклик)?)$/i.test(clean(x.innerText)) ||
         /\/responses\/|\/conversations\//.test(x.getAttribute('href') || '') && /отклик/i.test(clean(x.innerText))));
      return el ? 'true' : 'false';
    },
    // 'ok' — нажали «Откликнуться»; 'external' — отклик на сайте компании; 'applied' — уже откликались; 'missing'
    habrRespond() {
      const body = clean(document.body ? document.body.innerText : '').slice(0, 8000);
      if (this.habrApplied() === 'true') return 'applied';
      const btns = [...document.querySelectorAll('button, a')].filter(x => vis(x) && /откликнуться/i.test(clean(x.innerText)));
      if (btns.length === 0) return 'missing';
      const ext = btns.find(x => /на сайте|сайте компании/i.test(clean(x.innerText)) || (x.tagName === 'A' && /^https?:/.test(x.getAttribute('href') || '') && !/habr\.com/.test(x.getAttribute('href') || '')));
      const own = btns.find(x => x !== ext);
      if (!own) return 'external';
      own.scrollIntoView({ block: 'center' }); own.click(); return 'ok';
    },

    // ---------- LinkedIn ----------
    // Вакансии на странице поиска: ссылки /jobs/view/<id> и карточки с data-job-id
    liLinks() {
      const out = [], seen = new Set();
      const appliedIn = el => { const c = el && (el.closest('li, [data-job-id], [data-occludable-job-id]') || el); const ct = c ? clean(c.innerText) : '';
        return /Applied\b|Вы откликнулись|Отклик отправлен|Заявка отправлена/.test(ct) && ct.length < 2000; };
      const add = (id, t, el) => { if (!id || seen.has(id)) return; t = clean(t); if (t.length < 3) return; seen.add(id); out.push({ id, title: t.slice(0, 150), applied: appliedIn(el) }); };
      for (const a of document.querySelectorAll('a[href*="/jobs/view/"]')) {
        const m = (a.getAttribute('href') || '').match(/\/jobs\/view\/(?:[^/?]*-)?(\d{6,})/);
        if (m) add(m[1], a.getAttribute('aria-label') || a.innerText, a);
      }
      for (const c of document.querySelectorAll('[data-job-id], [data-occludable-job-id]')) {
        const id = c.getAttribute('data-job-id') || c.getAttribute('data-occludable-job-id');
        const t = c.querySelector('a, strong, h3');
        if (/^\d{6,}$/.test(id || '')) add(id, t ? (t.getAttribute('aria-label') || t.innerText) : '', c);
      }
      return JSON.stringify(out);
    },
    // Кнопка «Easy Apply» (на английском и русском интерфейсе)
    liEasyApply() {
      const re = /easy apply|простая подача|откликнуться быстро|быстрый отклик/i;
      const b = [...document.querySelectorAll('button, a[role=button]')].find(x => vis(x) && re.test(clean(x.innerText || x.getAttribute('aria-label'))));
      if (!b) return 'missing';
      b.scrollIntoView({ block: 'center' }); b.click(); return 'ok';
    },
    liApplied() {
      const t = clean(document.body ? document.body.innerText : '').slice(0, 6000);
      return /\bApplied\b \d|Application submitted|Вы откликнулись|Отклик отправлен|Заявка отправлена/i.test(t) ? 'true' : 'false';
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
        // Карточка вакансии в выдаче: если на ней отметка об отклике — помечаем, открывать не будем
        const up = a.parentElement;
        const card = (up && up.closest('[data-qa^="vacancy-serp__vacancy"], [class*="vacancy-card"], [class*="serp-item_"], article')) ||
          (up && up.parentElement && up.parentElement.parentElement);
        const ct = card ? clean(card.innerText) : '';
        const applied = /Вы откликнулись|Отклик отправлен|Резюме доставлено/i.test(ct) && ct.length < 3000;
        out.push({ id: m[1], title: t.slice(0, 150), applied });
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
