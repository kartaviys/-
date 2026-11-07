"""Заполнение анкет в браузере (Playwright).

Используется там, где API hh не справляется:
  * вакансии с тестом/опросом от работодателя на самом hh.ru;
  * вакансии, где отклик идёт на сайте работодателя (response_url).

Браузер запускается с постоянным профилем (папка browser_profile), поэтому один раз
войдите в hh.ru командой `python -m hh_autoapply login`, и дальше сессия сохранится.
"""

import json
import re

from .lang import strip_html

SALARY_RE = re.compile(
    r"зарплат|заработн|з/п|зп\b|оклад|доход|ожидани.*(оплат|вознагр|зарпл)|"
    r"вознагражден|salary|compensation|pay\s*expectation|expected\s*pay|desired\s*pay",
    re.IGNORECASE,
)
# Такие поля никогда не заполняем автоматически.
FORBIDDEN_RE = re.compile(
    r"парол|password|cvv|cvc|номер\s*карты|card\s*number|паспорт|passport|снилс|инн\b",
    re.IGNORECASE,
)
CAPTCHA_RE = re.compile(r"captcha|капч|recaptcha|hcaptcha|smartcaptcha", re.IGNORECASE)
SUBMIT_RE = re.compile(
    r"^\s*(отправить|откликнуться|подтвердить|далее|продолжить|готово|"
    r"submit|apply|send|next|continue|finish)\b",
    re.IGNORECASE,
)

# JS, который находит видимые поля формы, помечает их data-aa-id и собирает подписи.
_COLLECT_JS = r"""
() => {
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
}
"""

FORM_SYSTEM = """Ты заполняешь анкету отклика на вакансию от лица кандидата.
Тебе дан список полей формы (JSON), данные кандидата, его резюме, вакансия и готовое сопроводительное письмо.
Правила:
- Отвечай только фактами из резюме и профиля. Если ответа нет в данных — дай разумный
  нейтральный ответ (для текстовых вопросов 1–3 предложения от первого лица).
- Любой вопрос про зарплату/ожидания по доходу: ответ строго "{salary}".
- Поле для сопроводительного письма/комментария к отклику: вставь сопроводительное письмо целиком.
- Поле загрузки файла (type=file) с резюме/CV: ответ "RESUME_FILE". Другие файлы: null.
- Выбор резюме на hh.ru (радиокнопки с названиями резюме): выбери то, чьё название ближе к "{resume_title}".
- Пароли, номера карт, паспортные данные — всегда null.
- Язык ответов — язык вопроса.
Формат ответа: JSON-объект {{"answers": {{"<id поля>": <значение>}}}}, где значение:
  для text/textarea/email/tel/number/date — строка;
  для select — точный текст одного из options;
  для radio — id выбранного варианта (из options[].id);
  для checkbox — список id отмеченных вариантов;
  если поле пропустить — null.
"""


class BrowserFiller:
    def __init__(self, cfg: dict, llm, profile: dict):
        self.cfg = cfg
        self.llm = llm
        self.profile = profile
        self.salary = str(cfg.get("salary_answer", "25000"))
        self._pw = None
        self._ctx = None

    # ---------- жизненный цикл ----------
    def __enter__(self):
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        self._ctx = self._pw.chromium.launch_persistent_context(
            self.cfg.get("profile_dir", "browser_profile"),
            headless=self.cfg.get("headless", False),
            locale="ru-RU",
        )
        return self

    def __exit__(self, *exc):
        if self._ctx:
            self._ctx.close()
        if self._pw:
            self._pw.stop()

    def manual_login(self, url: str = "https://hh.ru/account/login") -> None:
        page = self._ctx.new_page()
        page.goto(url)
        input("Войдите в аккаунт в открывшемся окне браузера и нажмите Enter здесь… ")
        page.close()

    # ---------- основная логика ----------
    def fill(self, url: str, vacancy: dict, letter: str, resume_text: str,
             resume_file: str, resume_title: str) -> str:
        """Возвращает статус: applied / manual / failed."""
        page = self._ctx.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(2500)
            auto_submit = self.cfg.get("auto_submit", False)
            seen_signatures = set()
            filled_any = False

            for _step in range(int(self.cfg.get("max_steps", 6))):
                if self._has_captcha(page):
                    return self._wait_human(page, "На странице капча")
                fields = page.evaluate(_COLLECT_JS)
                if any(f.get("type") == "password" for f in fields):
                    return self._wait_human(page, "Сайт просит войти/зарегистрироваться")
                fields = [f for f in fields if not FORBIDDEN_RE.search(_field_text(f))]
                signature = json.dumps([f["id"] + _field_text(f) for f in fields], ensure_ascii=False)
                if not fields or signature in seen_signatures:
                    break
                seen_signatures.add(signature)

                answers = self._ask_llm(fields, vacancy, letter, resume_text, resume_title)
                self._apply_answers(page, fields, answers, resume_file)
                filled_any = True

                if not auto_submit:
                    return self._wait_human(page, "Проверьте анкету и отправьте её сами")
                if not self._click_submit(page):
                    return self._wait_human(page, "Не нашёл кнопку отправки")
                page.wait_for_timeout(3000)

            return "applied" if filled_any else "manual"
        except Exception as e:
            print(f"   [browser] ошибка: {e}")
            return "failed"
        finally:
            if not page.is_closed():
                page.close()

    def _ask_llm(self, fields, vacancy, letter, resume_text, resume_title) -> dict:
        system = FORM_SYSTEM.format(salary=self.salary, resume_title=resume_title)
        user = (
            f"ПОЛЯ ФОРМЫ:\n{json.dumps(fields, ensure_ascii=False)}\n\n"
            f"ПРОФИЛЬ КАНДИДАТА:\n{json.dumps(self.profile, ensure_ascii=False)}\n\n"
            f"ВАКАНСИЯ: {vacancy.get('name')} — {(vacancy.get('employer') or {}).get('name', '')}\n"
            f"{strip_html(vacancy.get('description', ''))[:3000]}\n\n"
            f"СОПРОВОДИТЕЛЬНОЕ ПИСЬМО:\n{letter}\n\n"
            f"РЕЗЮМЕ:\n{resume_text[:6000]}"
        )
        data = self.llm.complete_json(system, user, max_tokens=4000)
        return data.get("answers", data)

    def _apply_answers(self, page, fields, answers: dict, resume_file: str) -> None:
        for f in fields:
            val = answers.get(f["id"])
            text = _field_text(f)
            ftype = f["type"]
            # Зарплату подставляем сами, не доверяя модели
            if ftype not in ("radio", "checkbox", "file") and SALARY_RE.search(text):
                val = self.salary
            try:
                if ftype == "file":
                    if val and resume_file:
                        page.set_input_files(f'[data-aa-id="{f["id"]}"]', resume_file)
                elif ftype == "radio":
                    opt_id = val if isinstance(val, str) else None
                    if SALARY_RE.search(f.get("question", "")):
                        opt_id = _closest_salary_option(f["options"], self.salary) or opt_id
                    if opt_id:
                        page.check(f'[data-aa-id="{opt_id}"]', force=True)
                elif ftype == "checkbox":
                    for opt_id in (val or []) if isinstance(val, list) else []:
                        page.check(f'[data-aa-id="{opt_id}"]', force=True)
                elif ftype == "select":
                    if val:
                        page.select_option(f'[data-aa-id="{f["id"]}"]', label=str(val))
                elif val is not None and val != "":
                    page.fill(f'[data-aa-id="{f["id"]}"]', str(val))
            except Exception as e:
                print(f"   [browser] поле «{text[:60]}» не заполнено: {e}")

    def _click_submit(self, page) -> bool:
        candidates = page.locator('button, input[type="submit"], [role="button"]')
        for i in range(candidates.count()):
            el = candidates.nth(i)
            try:
                if not el.is_visible() or not el.is_enabled():
                    continue
                label = (el.inner_text() or el.get_attribute("value") or "").strip()
                if SUBMIT_RE.search(label):
                    el.click()
                    return True
            except Exception:
                continue
        return False

    def _has_captcha(self, page) -> bool:
        html = page.content()[:200000]
        return bool(CAPTCHA_RE.search(html)) and page.locator("iframe[src*='captcha']").count() > 0

    def _wait_human(self, page, reason: str) -> str:
        if self.cfg.get("headless", False) or not self.cfg.get("ask_human", True):
            print(f"   [browser] {reason} — пропускаю, отметьте вручную.")
            return "manual"
        ans = input(f"   [browser] {reason}. Завершите в браузере. Отклик отправлен? [y/N] ")
        return "applied" if ans.strip().lower() in ("y", "д", "да", "yes") else "manual"


def _field_text(f: dict) -> str:
    return " ".join(str(f.get(k, "")) for k in ("label", "name", "question"))


def _closest_salary_option(options: list, salary: str):
    """Для радиокнопок с диапазонами зарплат выбираем тот, куда попадает salary."""
    target = int(re.sub(r"\D", "", salary) or 0)
    for opt in options:
        nums = [int(n.replace(" ", "")) for n in re.findall(r"\d[\d ]*", opt["label"])]
        nums = [n * 1000 if n < 1000 and re.search(r"тыс|k\b", opt["label"], re.I) else n for n in nums]
        if len(nums) == 2 and nums[0] <= target <= nums[1]:
            return opt["id"]
        if len(nums) == 1 and re.search(r"до|less|under|below", opt["label"], re.I) and target <= nums[0]:
            return opt["id"]
        if len(nums) == 1 and re.search(r"от|more|over|above|\+", opt["label"], re.I) and target >= nums[0]:
            return opt["id"]
    return None
