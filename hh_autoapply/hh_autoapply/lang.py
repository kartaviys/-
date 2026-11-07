"""Определение языка вакансии (русский / английский)."""

import html
import re

_TAG_RE = re.compile(r"<[^>]+>")
_CYR_RE = re.compile(r"[а-яёА-ЯЁ]")
_LAT_RE = re.compile(r"[a-zA-Z]")

# Термины, которые пишутся латиницей и в русских вакансиях:
# их не считаем признаком английского текста.
_TECH_WORDS = re.compile(
    r"\b(python|sql|ml|ai|nlp|cv|llm|pytorch|tensorflow|pandas|numpy|spark|"
    r"hadoop|airflow|docker|kubernetes|k8s|git|linux|tableau|power\s*bi|"
    r"clickhouse|postgresql|postgres|mysql|greenplum|kafka|scikit-learn|sklearn|"
    r"catboost|xgboost|lightgbm|mlops|etl|dwh|bi|api|rest|fastapi|django|flask|"
    r"aws|gcp|azure|cloud|jupyter|excel|scala|java|go|data|science|scientist|"
    r"engineer|analyst|senior|middle|junior|lead|team|machine|learning|deep|"
    r"computer|vision|big|a/b|it|hr)\b",
    re.IGNORECASE,
)


def strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(_TAG_RE.sub(" ", text or ""))).strip()


def detect_language(text: str, threshold: float = 0.6) -> str:
    """Возвращает "en", если доля латиницы среди букв (без терминов) >= threshold, иначе "ru"."""
    clean = _TECH_WORDS.sub(" ", strip_html(text))
    cyr = len(_CYR_RE.findall(clean))
    lat = len(_LAT_RE.findall(clean))
    total = cyr + lat
    if total == 0:
        return "ru"
    return "en" if lat / total >= threshold else "ru"
