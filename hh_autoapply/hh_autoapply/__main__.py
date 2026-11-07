"""CLI автоотклика.

  python -m hh_autoapply auth      — авторизация в API hh.ru (один раз)
  python -m hh_autoapply resumes   — показать id ваших резюме
  python -m hh_autoapply login     — войти в hh.ru в браузере (для тестов/анкет)
  python -m hh_autoapply run       — откликнуться (по умолчанию dry_run из конфига)
"""

import argparse
import random
import re
import sys
import time
import tomllib
from pathlib import Path

from .hh_api import HHClient, HHError
from .lang import detect_language
from .letters import write_letter
from .resume import load_resume_text
from .storage import Storage

HH_RESPONSE_PAGE = "https://hh.ru/applicant/vacancy_response?vacancyId={id}"


def load_config(path: str) -> dict:
    with open(path, "rb") as f:
        return tomllib.load(f)


def cmd_auth(cfg, hh: HHClient):
    print("1) Откройте ссылку и разрешите доступ приложению:\n   " + hh.authorize_url())
    print("2) После редиректа скопируйте параметр code из адресной строки.")
    code = input("code = ").strip()
    hh.exchange_code(code)
    print("Готово, токен сохранён.")


def cmd_resumes(cfg, hh: HHClient):
    for r in hh.my_resumes():
        print(f"{r['id']}  {r.get('title')}  (язык: {(r.get('language') or {}).get('id', '?')})")


def cmd_login(cfg, hh):
    from .browser import BrowserFiller

    with BrowserFiller(dict(cfg.get("browser", {}), headless=False), None, {}) as b:
        b.manual_login()
    print("Сессия браузера сохранена.")


def _title_ok(name: str, filt: dict) -> bool:
    low = name.lower()
    include = [w.lower() for w in filt.get("title_include", [])]
    exclude = [w.lower() for w in filt.get("title_exclude", [])]
    if include and not any(w in low for w in include):
        return False
    return not any(re.search(rf"\b{re.escape(w)}", low) for w in exclude)


def collect_vacancies(cfg, hh: HHClient, store: Storage):
    s = cfg["search"]
    params = {k: v for k, v in s.items() if k not in ("queries", "max_pages")}
    params.setdefault("order_by", "publication_time")
    found = {}
    for q in s["queries"]:
        for item in hh.search(q, params, max_pages=s.get("max_pages", 3)):
            vid = str(item["id"])
            if vid in found or item.get("archived"):
                continue
            if not _title_ok(item.get("name", ""), cfg.get("filters", {})):
                continue
            if store.seen(vid):
                continue
            found[vid] = item
    return list(found.values())


def cmd_run(cfg, hh: HHClient, args):
    from .llm import LLM

    dry_run = args.dry_run if args.dry_run is not None else cfg["run"].get("dry_run", True)
    limit = args.limit or cfg["run"].get("max_applications", 30)
    daily_cap = cfg["run"].get("daily_limit", 190)

    store = Storage(cfg["run"].get("db_path", "applications.db"))
    llm = LLM(cfg["llm"])
    profile = cfg.get("profile", {})
    res = cfg["resumes"]
    resume_text = {"ru": load_resume_text(res.get("ru_file", "")), "en": load_resume_text(res.get("en_file", ""))}
    if not resume_text["en"]:
        resume_text["en"] = resume_text["ru"]
    resume_id = {"ru": res["ru_resume_id"], "en": res.get("en_resume_id") or res["ru_resume_id"]}
    resume_file = {"ru": res.get("ru_file", ""), "en": res.get("en_file") or res.get("ru_file", "")}
    resume_title = {"ru": res.get("ru_title", ""), "en": res.get("en_title", "")}

    vacancies = collect_vacancies(cfg, hh, store)
    print(f"Найдено новых подходящих вакансий: {len(vacancies)}  (dry_run={dry_run})")

    browser = None
    done = 0
    try:
        for item in vacancies:
            if done >= limit:
                break
            if not dry_run and store.applied_today() >= daily_cap:
                print("Достигнут дневной лимит откликов.")
                break
            try:
                v = hh.vacancy(item["id"])
            except HHError as e:
                print(f"- {item['id']}: не удалось загрузить ({e})")
                continue
            if "got_response" in (v.get("relations") or []):
                store.record(v, "", "applied", "earlier")
                continue

            lang = detect_language(v.get("name", "") + " " + v.get("description", ""))
            channel = "external" if v.get("response_url") else ("hh_test" if v.get("has_test") else "api")
            print(f"\n• [{lang}] [{channel}] {v['name']} — {(v.get('employer') or {}).get('name', '')}\n  {v.get('alternate_url')}")

            if channel != "api" and not cfg["browser"].get("enabled", True):
                store.record(v, lang, "skipped", channel, error="needs browser, browser disabled")
                continue

            try:
                letter = write_letter(llm, v, lang, resume_text[lang], profile, res.get("en_cv_url", ""))
            except Exception as e:
                print(f"  ! письмо не сгенерировано: {e}")
                store.record(v, lang, "failed", channel, error=str(e))
                continue

            if dry_run:
                print("  --- письмо ---\n  " + letter.replace("\n", "\n  "))
                store.record(v, lang, "dry_run", channel, letter)
                done += 1
                continue

            status, error = "failed", ""
            if channel == "api":
                try:
                    hh.apply(v["id"], resume_id[lang], letter)
                    status = "applied"
                except HHError as e:
                    error = str(e)
                    if "test_required" in e.reasons:
                        channel = "hh_test"
                    elif "already_applied" in e.reasons:
                        status = "applied"
                    elif "limit_exceeded" in e.reasons:
                        print("  ! hh.ru: дневной лимит откликов исчерпан.")
                        store.record(v, lang, "failed", channel, letter, error)
                        break
                    else:
                        print(f"  ! {e}")

            if channel in ("hh_test", "external") and status != "applied":
                if not cfg["browser"].get("enabled", True):
                    status, error = "skipped", "browser disabled"
                else:
                    if browser is None:
                        from .browser import BrowserFiller

                        browser = BrowserFiller(cfg["browser"], llm, profile).__enter__()
                    url = v["response_url"] if channel == "external" else HH_RESPONSE_PAGE.format(id=v["id"])
                    status = browser.fill(url, v, letter, resume_text[lang], resume_file[lang], resume_title[lang])

            print(f"  → {status}")
            store.record(v, lang, status, channel, letter, error)
            if status == "applied":
                done += 1
            time.sleep(random.uniform(*cfg["run"].get("delay_seconds", [20, 60])))
    finally:
        if browser is not None:
            browser.__exit__(None, None, None)

    print(f"\nГотово. Обработано: {done}.\nРасход LLM:\n{llm.report()}")


def main(argv=None):
    p = argparse.ArgumentParser(prog="hh_autoapply")
    p.add_argument("command", choices=["auth", "resumes", "login", "run"])
    p.add_argument("-c", "--config", default="config.toml")
    p.add_argument("--dry-run", dest="dry_run", action="store_true", default=None,
                   help="только сгенерировать письма, не откликаться")
    p.add_argument("--live", dest="dry_run", action="store_false", help="реально откликаться")
    p.add_argument("--limit", type=int, help="максимум откликов за запуск")
    args = p.parse_args(argv)

    if not Path(args.config).exists():
        sys.exit(f"Нет файла {args.config}. Скопируйте config.example.toml в config.toml и заполните.")
    cfg = load_config(args.config)
    hh = HHClient(cfg["hh"], cfg["hh"].get("token_path", "token.json"))

    {"auth": cmd_auth, "resumes": cmd_resumes, "login": cmd_login}.get(
        args.command, lambda c, h: cmd_run(c, h, args)
    )(cfg, hh)


if __name__ == "__main__":
    main()
