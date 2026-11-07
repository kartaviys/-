"""Обёртка над LLM: DeepSeek и Claude, по отдельности или вперемешку.

strategy:
  "fallback"    — всегда первый провайдер из списка, остальные только при ошибке/отказе;
  "round_robin" — провайдеры по очереди (вперемешку), при ошибке берётся следующий.
"""

import json
import os
import re
from dataclasses import dataclass, field


class LLMError(RuntimeError):
    pass


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class DeepSeekProvider:
    name = "deepseek"

    def __init__(self, cfg: dict):
        from openai import OpenAI  # DeepSeek использует OpenAI-совместимый API

        key = os.environ.get("DEEPSEEK_API_KEY")
        if not key:
            raise LLMError("Не задана переменная окружения DEEPSEEK_API_KEY")
        self.client = OpenAI(api_key=key, base_url=cfg.get("base_url", "https://api.deepseek.com"))
        self.model = cfg.get("model", "deepseek-chat")
        self.price_in = cfg.get("price_input_per_m", 0.28)
        self.price_out = cfg.get("price_output_per_m", 0.42)

    def complete(self, system: str, user: str, want_json: bool, max_tokens: int):
        kwargs = {}
        if want_json:
            kwargs["response_format"] = {"type": "json_object"}
        resp = self.client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            **kwargs,
        )
        text = resp.choices[0].message.content or ""
        u = resp.usage
        return text, u.prompt_tokens, u.completion_tokens


class ClaudeProvider:
    name = "claude"

    def __init__(self, cfg: dict):
        import anthropic

        # Ключ берётся из ANTHROPIC_API_KEY (или из профиля `ant auth login`).
        self.anthropic = anthropic
        self.client = anthropic.Anthropic()
        self.model = cfg.get("model", "claude-haiku-5-5")
        self.effort = cfg.get("effort", "low")
        self.price_in = cfg.get("price_input_per_m", 0.10)
        self.price_out = cfg.get("price_output_per_m", 0.50)

    def complete(self, system: str, user: str, want_json: bool, max_tokens: int):
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            output_config={"effort": self.effort},
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        if resp.stop_reason == "refusal":
            raise LLMError("Claude отказался отвечать на запрос")
        text = "".join(b.text for b in resp.content if b.type == "text")
        return text, resp.usage.input_tokens, resp.usage.output_tokens


_PROVIDERS = {"deepseek": DeepSeekProvider, "claude": ClaudeProvider}


@dataclass
class LLM:
    cfg: dict
    usage: dict = field(default_factory=dict)
    _providers: list = field(default_factory=list)
    _turn: int = 0

    def __post_init__(self):
        order = self.cfg.get("providers", ["deepseek"])
        errors = []
        for name in order:
            try:
                self._providers.append(_PROVIDERS[name](self.cfg.get(name, {})))
            except Exception as e:  # нет ключа или пакета: работаем с остальными
                errors.append(f"{name}: {e}")
        if not self._providers:
            raise LLMError("Ни один LLM-провайдер не настроен: " + "; ".join(errors))
        for err in errors:
            print(f"[llm] провайдер пропущен — {err}")
        self.strategy = self.cfg.get("strategy", "fallback")

    def _order(self):
        if self.strategy == "round_robin":
            k = self._turn % len(self._providers)
            self._turn += 1
            return self._providers[k:] + self._providers[:k]
        return list(self._providers)

    def complete(self, system: str, user: str, want_json: bool = False, max_tokens: int = 4000) -> str:
        last_err = None
        for p in self._order():
            try:
                text, tin, tout = p.complete(system, user, want_json, max_tokens)
            except Exception as e:
                last_err = e
                print(f"[llm] {p.name}: ошибка — {e}; пробую следующего провайдера")
                continue
            u = self.usage.setdefault(p.name, Usage())
            u.input_tokens += tin
            u.output_tokens += tout
            u.cost_usd += tin / 1e6 * p.price_in + tout / 1e6 * p.price_out
            if text.strip():
                return text.strip()
            last_err = LLMError(f"{p.name} вернул пустой ответ")
        raise LLMError(f"Все провайдеры упали: {last_err}")

    def complete_json(self, system: str, user: str, max_tokens: int = 4000) -> dict:
        text = self.complete(system, user + "\n\nОтветь только JSON-объектом.", True, max_tokens)
        return parse_json(text)

    def report(self) -> str:
        if not self.usage:
            return "LLM не вызывался."
        lines = []
        for name, u in self.usage.items():
            lines.append(
                f"{name}: {u.input_tokens} вх. / {u.output_tokens} вых. токенов ≈ ${u.cost_usd:.4f}"
            )
        return "\n".join(lines)


def parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            raise LLMError(f"Не удалось разобрать JSON из ответа: {text[:200]}")
        return json.loads(m.group(0))
