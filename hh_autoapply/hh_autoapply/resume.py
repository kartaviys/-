"""Чтение текста резюме из PDF / DOCX / TXT / MD."""

from pathlib import Path


def load_resume_text(path: str) -> str:
    if not path:
        return ""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Файл резюме не найден: {p}")
    suffix = p.suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader

        return "\n".join((page.extract_text() or "") for page in PdfReader(str(p)).pages).strip()
    if suffix == ".docx":
        import docx  # пакет python-docx

        return "\n".join(par.text for par in docx.Document(str(p)).paragraphs).strip()
    return p.read_text(encoding="utf-8").strip()
