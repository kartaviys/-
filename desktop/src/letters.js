// Промпты: сопроводительное письмо и проверка «подходит ли вакансия» (как в Android, Letters.kt).
const { stripHtml } = require('./text');
const { StopSessionError } = require('./llm');

const SYSTEM_RU = `Ты пишешь сопроводительные письма от лица соискателя.
Письмо должно звучать как живой человек, а не шаблон: коротко (600–1000 знаков),
без канцелярита, без «Уважаемый HR-менеджер» и без пустых фраз вроде «я командный игрок».
Начни естественно: например, что вакансия заинтересовала и чем именно (назови 1–2
конкретные вещи из описания: задачи, продукт, стек). Затем 2–3 предложения о том,
какой релевантный опыт из резюме подходит под эти задачи — только факты из резюме,
ничего не выдумывай. Закончи предложением созвониться/обсудить. Подпись — имя.
Не используй плейсхолдеры в квадратных скобках, markdown и списки. Верни только текст письма.`;

const SYSTEM_EN = `You write cover letters on behalf of a job seeker.
It must read like a real person wrote it, not a template: 120–200 words, plain and warm,
no "To whom it may concern", no clichés like "I am a team player".
Open naturally — say the role caught your attention and name 1–2 concrete things from the
job description (the problems, product or stack). Then 2–3 sentences mapping relevant
experience from the resume to those needs — only facts from the resume, never invent.
Close by suggesting a call. Sign with the candidate's name.
No placeholders in square brackets, no markdown, no bullet lists. Return only the letter text.`;

async function writeLetter(llm, store, { title, employer, description, lang }) {
  const resume = (lang === 'en' ? store.get('en_resume_text') : store.get('ru_resume_text')) || store.get('ru_resume_text') || store.get('en_resume_text');
  const name = store.get(lang === 'en' ? 'name_en' : 'name') || 'возьми имя кандидата из резюме; если его там нет — подпись не ставь';
  const user = `Имя кандидата для подписи: ${name}\n\n=== ВАКАНСИЯ ===\nДолжность: ${title}\nКомпания: ${employer || ''}\n` +
    `Описание:\n${stripHtml(description).slice(0, 6000)}\n\n=== РЕЗЮМЕ КАНДИДАТА ===\n${String(resume).slice(0, 8000)}`;
  let letter = await llm.complete(lang === 'en' ? SYSTEM_EN : SYSTEM_RU, user, { maxTokens: 2000 });
  if (lang === 'en' && store.get('en_cv_url')) letter += `\n\nCV (PDF): ${store.get('en_cv_url')}`;
  return letter;
}

const ASSESS = `Ты помогаешь соискателю отбирать вакансии. Тебе даны его целевые роли и вакансия.
Реши, стоит ли откликаться. По умолчанию — откликаться: лучше лишний отклик, чем пропущенная хорошая вакансия.
Отклоняй (fit=false) ТОЛЬКО если основная работа явно из «не подходят» (например, чистый Data Engineer / DWH / BI,
бизнес-аналитик без ML, backend без ML, компьютерное зрение, стажёр/junior, руководитель отдела).
Смешанные роли, где заметная часть работы — ML / Data Science / NLP / LLM / аналитика данных, — подходят.
Если сомневаешься или описание короткое — fit=true.
Ответ — JSON: {"fit": true|false, "reason": "кратко, до 12 слов, по-русски"}`;

/** Подходит ли вакансия. При сбое нейросети — подходит (не блокируем работу), кроме остановки сессии. */
async function assess(llm, store, title, description) {
  const resume = store.get('ru_resume_text') || store.get('en_resume_text');
  const user = `ЦЕЛЕВЫЕ РОЛИ:\n${store.get('target_roles')}\n\nКРАТКО О КАНДИДАТЕ:\n${String(resume).slice(0, 1200)}\n\n` +
    `ВАКАНСИЯ: ${title}\n${stripHtml(description).slice(0, 3000)}`;
  try {
    const o = await llm.completeJson(ASSESS, user, 400);
    return { fit: o.fit !== false, reason: o.reason || '' };
  } catch (e) {
    if (e instanceof StopSessionError) throw e;
    return { fit: true, reason: '' };
  }
}

module.exports = { writeLetter, assess };
