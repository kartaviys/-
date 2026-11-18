// Нейросеть: Claude (официальный SDK), DeepSeek и «своя модель» (любой OpenAI-совместимый API: Ollama, LM Studio…).
// Порядок провайдеров и стратегия (fallback / round_robin), учёт расходов, дневной бюджет, остановка при отказе доступа.

class LlmError extends Error {}
/** После такой ошибки продолжать сессию бессмысленно (бюджет, нет доступа). */
class StopSessionError extends LlmError {}

let Anthropic = null;
function anthropicSdk() {
  if (!Anthropic) Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
  return Anthropic;
}

class ClaudeProvider {
  constructor(key, model) {
    const A = anthropicSdk();
    this.name = 'claude'; this.priceIn = 0.10; this.priceOut = 0.50;
    this.client = new A({ apiKey: key });
    this.model = model || 'claude-haiku-5-5';
  }
  isAccessError(e) {
    const A = anthropicSdk();
    return e instanceof A.PermissionDeniedError || e instanceof A.AuthenticationError;
  }
  async complete(system, user, { maxTokens = 4000 } = {}) {
    const r = await this.client.messages.create({
      model: this.model, max_tokens: maxTokens, system,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: user }],
    });
    if (r.stop_reason === 'refusal') throw new LlmError('Claude отказался отвечать');
    const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, input: r.usage.input_tokens, output: r.usage.output_tokens };
  }
  /** Текст резюме из PDF (один раз при загрузке). */
  async pdfText(buffer) {
    const r = await this.client.messages.create({
      model: this.model, max_tokens: 8000, output_config: { effort: 'low' },
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') } },
        { type: 'text', text: 'Перепиши текст этого резюме целиком простым текстом, сохранив все факты, даты, компании, навыки и достижения. Без комментариев.' },
      ] }],
    });
    return r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  }
}

class OpenAiCompatProvider {
  constructor(name, baseUrl, key, model, priceIn, priceOut, timeoutSec = 120) {
    Object.assign(this, { name, key, model, priceIn, priceOut, timeoutSec });
    const b = String(baseUrl).trim().replace(/\/+$/, '');
    this.endpoint = b.endsWith('/chat/completions') ? b : b + '/chat/completions';
    this.jsonMode = true;
  }
  isAccessError(e) { return e.status === 401 || e.status === 403; }
  async send(system, user, json, maxTokens) {
    const body = { model: this.model, max_tokens: maxTokens, stream: false,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (json) body.response_format = { type: 'json_object' };
    const r = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.key ? { Authorization: `Bearer ${this.key}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutSec * 1000),
    });
    const txt = await r.text();
    if (!r.ok) { const e = new LlmError(`${this.name} ${r.status}: ${txt.slice(0, 300)}`); e.status = r.status; throw e; }
    const o = JSON.parse(txt);
    const text = (o.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { text, input: o.usage?.prompt_tokens || 0, output: o.usage?.completion_tokens || 0 };
  }
  async complete(system, user, { json = false, maxTokens = 4000 } = {}) {
    try { return await this.send(system, user, json && this.jsonMode, maxTokens); }
    catch (e) {
      if (json && this.jsonMode && e.status === 400) { this.jsonMode = false; return this.send(system, user, false, maxTokens); }
      throw e;
    }
  }
}

class Llm {
  constructor(store) {
    this.store = store;
    this.providers = [];
    this.turn = 0;
    const order = store.get('providers').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (store.get('custom_base_url') && !order.some(o => o === 'custom' || o === 'local')) order.push('custom');
    for (const name of order) {
      if (name === 'claude' && store.get('anthropic_key')) this.providers.push(new ClaudeProvider(store.get('anthropic_key'), store.get('claude_model')));
      if (name === 'deepseek' && store.get('deepseek_key')) {
        this.providers.push(new OpenAiCompatProvider('deepseek', 'https://api.deepseek.com', store.get('deepseek_key'), store.get('deepseek_model'), 0.28, 0.42));
      }
      if ((name === 'custom' || name === 'local') && store.get('custom_base_url')) {
        const n = k => parseFloat(String(store.get(k)).replace(',', '.')) || 0;
        this.providers.push(new OpenAiCompatProvider(store.get('custom_name') || 'своя модель', store.get('custom_base_url'),
          store.get('custom_key'), store.get('custom_model'), n('custom_price_in'), n('custom_price_out'), store.int('custom_timeout') || 300));
      }
    }
    if (!this.providers.length) throw new LlmError('Не настроена ни одна нейросеть: укажите ключ Claude или DeepSeek, либо адрес своей модели в настройках.');
  }

  get claude() { return this.providers.find(p => p instanceof ClaudeProvider) || null; }

  async complete(system, user, opts = {}) {
    const budget = parseFloat(String(this.store.get('daily_budget')).replace(',', '.')) || 0;
    if (budget > 0 && this.store.dayTotal().cost >= budget) {
      throw new StopSessionError(`Дневной бюджет на нейросеть исчерпан ($${budget}). Увеличьте его в настройках или продолжите завтра.`);
    }
    let order = this.providers;
    if (this.store.get('strategy') === 'round_robin') { const k = this.turn++ % order.length; order = [...order.slice(k), ...order.slice(0, k)]; }
    let last = null; let access = 0;
    for (const p of order) {
      try {
        const r = await p.complete(system, user, opts);
        this.store.addUsage(p.name, r.input, r.output, r.input / 1e6 * p.priceIn + r.output / 1e6 * p.priceOut);
        if (r.text.trim()) return r.text.trim();
        last = new LlmError(`${p.name}: пустой ответ`);
      } catch (e) {
        if (e instanceof StopSessionError) throw e;
        last = e;
        if (p.isAccessError(e)) access++;
        this.store.log(`[llm] ${p.name}: ошибка — ${e.message}`);
      }
    }
    if (access === order.length) {
      const m = String(last?.message || '');
      throw new StopSessionError(/not allowed|forbidden|403/i.test(m)
        ? 'Нейросеть отказала в доступе (403). Для Claude это значит, что запрос пришёл из страны, где Anthropic не работает ' +
          '(в т.ч. Россия): включите VPN на компьютере — или укажите ключ DeepSeek / свою модель в настройках.'
        : `Нейросеть отказала в доступе (${m.slice(0, 120)}). Проверьте ключ и баланс.`);
    }
    throw new LlmError(`Все провайдеры упали: ${last?.message}`);
  }

  async completeJson(system, user, maxTokens = 2000) {
    const text = await this.complete(system, user + '\n\nОтветь только JSON-объектом.', { json: true, maxTokens });
    return parseJson(text);
  }
}

function parseJson(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(t); } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) throw new LlmError('Не удалось разобрать JSON: ' + t.slice(0, 200));
    return JSON.parse(m[0]);
  }
}

module.exports = { Llm, LlmError, StopSessionError, parseJson };
