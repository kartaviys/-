"""Клиент API hh.ru: OAuth, поиск вакансий, резюме, отклики."""

import json
import time
import urllib.parse
from pathlib import Path

import requests

API = "https://api.hh.ru"
AUTHORIZE_URL = "https://hh.ru/oauth/authorize"
TOKEN_URL = "https://api.hh.ru/token"


class HHError(RuntimeError):
    def __init__(self, status: int, payload):
        self.status = status
        self.payload = payload
        super().__init__(f"hh.ru {status}: {payload}")

    @property
    def reasons(self) -> set:
        """Коды ошибок hh (например test_required, letter_required, already_applied)."""
        out = set()
        if isinstance(self.payload, dict):
            for e in self.payload.get("errors", []):
                out.add(e.get("value") or e.get("type"))
        return {r for r in out if r}


class HHClient:
    def __init__(self, cfg: dict, token_path: str = "token.json"):
        self.client_id = cfg.get("client_id", "")
        self.client_secret = cfg.get("client_secret", "")
        self.redirect_uri = cfg.get("redirect_uri", "")
        self.token_path = Path(token_path)
        self.session = requests.Session()
        # hh.ru требует HH-User-Agent вида "Название/версия (контакт)"
        self.session.headers["HH-User-Agent"] = cfg.get("user_agent", "hh-autoapply/1.0")
        self.token = self._load_token()

    # ---------- OAuth ----------
    def authorize_url(self) -> str:
        q = {"response_type": "code", "client_id": self.client_id}
        if self.redirect_uri:
            q["redirect_uri"] = self.redirect_uri
        return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(q)}"

    def exchange_code(self, code: str) -> None:
        data = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
        }
        if self.redirect_uri:
            data["redirect_uri"] = self.redirect_uri
        self._save_token(self._post_token(data))

    def _refresh(self) -> None:
        data = {"grant_type": "refresh_token", "refresh_token": self.token["refresh_token"]}
        self._save_token(self._post_token(data))

    def _post_token(self, data: dict) -> dict:
        r = self.session.post(TOKEN_URL, data=data, timeout=30)
        if r.status_code != 200:
            raise HHError(r.status_code, _payload(r))
        tok = r.json()
        tok["expires_at"] = time.time() + tok.get("expires_in", 0) - 60
        return tok

    def _load_token(self):
        if self.token_path.exists():
            return json.loads(self.token_path.read_text())
        return None

    def _save_token(self, tok: dict) -> None:
        self.token = tok
        self.token_path.write_text(json.dumps(tok, indent=2))
        try:
            self.token_path.chmod(0o600)
        except OSError:
            pass

    def _auth_headers(self) -> dict:
        if not self.token:
            raise RuntimeError("Нет токена hh.ru. Сначала выполните: python -m hh_autoapply auth")
        if time.time() >= self.token.get("expires_at", 0):
            self._refresh()
        return {"Authorization": f"Bearer {self.token['access_token']}"}

    # ---------- запросы ----------
    def _request(self, method: str, path: str, auth: bool = False, **kw):
        headers = kw.pop("headers", {})
        if auth or self.token:
            headers.update(self._auth_headers())
        for attempt in range(4):
            r = self.session.request(method, API + path, headers=headers, timeout=30, **kw)
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 ** attempt)
                continue
            break
        if r.status_code >= 400:
            raise HHError(r.status_code, _payload(r))
        return r.json() if r.content else {}

    def search(self, text: str, params: dict, max_pages: int = 5):
        """Итерирует по найденным вакансиям (краткие карточки)."""
        for page in range(max_pages):
            q = dict(params, text=text, page=page, per_page=100)
            data = self._request("GET", "/vacancies", params=q)
            yield from data.get("items", [])
            if page + 1 >= data.get("pages", 0):
                break
            time.sleep(0.3)

    def vacancy(self, vacancy_id: str) -> dict:
        return self._request("GET", f"/vacancies/{vacancy_id}")

    def my_resumes(self) -> list:
        return self._request("GET", "/resumes/mine", auth=True).get("items", [])

    def apply(self, vacancy_id: str, resume_id: str, message: str = "") -> None:
        data = {"vacancy_id": vacancy_id, "resume_id": resume_id}
        if message:
            data["message"] = message
        self._request("POST", "/negotiations", auth=True, data=data)


def _payload(r):
    try:
        return r.json()
    except ValueError:
        return r.text[:500]
