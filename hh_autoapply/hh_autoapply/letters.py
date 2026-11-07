"""Генерация сопроводительных писем под конкретную вакансию."""

from .lang import strip_html

SYSTEM_RU = """Ты пишешь сопроводительные письма от лица соискателя на hh.ru.
Письмо должно звучать как живой человек, а не шаблон: коротко (600–1000 знаков),
без канцелярита, без «Уважаемый HR-менеджер» и без пустых фраз вроде «я командный игрок».
Начни естественно: например, что вакансия заинтересовала и чем именно (назови 1–2
конкретные вещи из описания: задачи, продукт, стек). Затем 2–3 предложения о том,
какой релевантный опыт из резюме подходит под эти задачи — только факты из резюме,
ничего не выдумывай. Закончи предложением созвониться/обсудить. Подпись — имя.
Не используй плейсхолдеры в квадратных скобках, markdown и списки. Верни только текст письма."""

SYSTEM_EN = """You write cover letters on behalf of a job seeker applying on hh.ru.
It must read like a real person wrote it, not a template: 120–200 words, plain and warm,
no "To whom it may concern", no clichés like "I am a team player".
Open naturally — say the role caught your attention and name 1–2 concrete things from the
job description (the problems, product or stack). Then 2–3 sentences mapping relevant
experience from the resume to those needs — only facts from the resume, never invent.
Close by suggesting a call. Sign with the candidate's name.
No placeholders in square brackets, no markdown, no bullet lists. Return only the letter text."""


def vacancy_brief(v: dict) -> str:
    salary = v.get("salary") or {}
    parts = [
        f"Должность: {v.get('name', '')}",
        f"Компания: {(v.get('employer') or {}).get('name', '')}",
        f"Город: {(v.get('area') or {}).get('name', '')}",
    ]
    if salary:
        parts.append(f"Вилка: {salary.get('from')}–{salary.get('to')} {salary.get('currency')}")
    skills = ", ".join(s["name"] for s in v.get("key_skills") or [])
    if skills:
        parts.append(f"Ключевые навыки: {skills}")
    parts.append("Описание:\n" + strip_html(v.get("description", ""))[:6000])
    return "\n".join(parts)


def write_letter(llm, vacancy: dict, language: str, resume_text: str, profile: dict,
                 english_resume_url: str = "") -> str:
    system = SYSTEM_EN if language == "en" else SYSTEM_RU
    name = profile.get("name_en" if language == "en" else "name", profile.get("name", ""))
    user = (
        f"Имя кандидата для подписи: {name}\n\n"
        f"=== ВАКАНСИЯ ===\n{vacancy_brief(vacancy)}\n\n"
        f"=== РЕЗЮМЕ КАНДИДАТА ===\n{resume_text[:8000]}"
    )
    letter = llm.complete(system, user, max_tokens=2000)
    if language == "en" and english_resume_url:
        letter += f"\n\nCV (PDF): {english_resume_url}"
    return letter
