// Фильтры и разбор текста — те же правила, что в Android-приложении (Text.kt).
// В JS \b не работает с кириллицей, поэтому «начало слова» проверяем через Unicode-классы.

const START = '(?<![\\p{L}\\p{N}])';

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Название проходит фильтр: содержит одно из include (с начала слова) и ни одного из exclude. */
function titleOk(title, include, exclude) {
  const low = (title || '').toLowerCase();
  const hit = w => new RegExp(START + esc(w.toLowerCase()), 'u').test(low);
  if (include.length && !include.some(hit)) return false;
  return !exclude.some(hit);
}

function list(value, sep = /[,\n]/) {
  return String(value || '').split(sep).map(s => s.trim()).filter(Boolean);
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

const TECH = /(?<![\p{L}\p{N}])(python|sql|ml|ai|nlp|cv|llm|pytorch|tensorflow|pandas|numpy|spark|hadoop|airflow|docker|kubernetes|k8s|git|linux|tableau|power\s*bi|clickhouse|postgresql|postgres|mysql|greenplum|kafka|scikit-learn|sklearn|catboost|xgboost|lightgbm|mlops|etl|dwh|bi|api|rest|fastapi|django|flask|aws|gcp|azure|cloud|jupyter|excel|scala|java|go|data|science|scientist|engineer|analyst|senior|middle|junior|lead|team|machine|learning|deep|computer|vision|big|a\/b|it|hr)(?![\p{L}\p{N}])/giu;

/** "en", если латиницы (без технических терминов) >= 60%, иначе "ru". */
function detectLanguage(text) {
  const clean = stripHtml(text).replace(TECH, ' ');
  const c = (clean.match(/[а-яё]/gi) || []).length;
  const l = (clean.match(/[a-z]/gi) || []).length;
  if (c + l === 0) return 'ru';
  return l / (c + l) >= 0.6 ? 'en' : 'ru';
}

const SALARY = /зарплат|заработн|з\/п|оклад|доход|ожидани.*(оплат|вознагр|зарпл)|вознагражден|salary|compensation|pay\s*expectation|expected\s*pay|desired\s*pay/i;
const FORBIDDEN = /парол|password|cvv|cvc|номер\s*карты|card\s*number|паспорт|passport|снилс|(?<![\p{L}])инн(?![\p{L}])/iu;
const CV_TERMS = /computer vision|компьютерн\S* зрени|opencv|yolo|детекци\S* объект|сегментаци\S* изображ|обработк\S* изображ|видеоаналит|image (?:recognition|segmentation|classification)/gi;

/** Вакансия про компьютерное зрение, если CV-терминов в описании много. */
function isCvHeavy(text) { return (stripHtml(text).match(CV_TERMS) || []).length >= 3; }

/** Длительность по-человечески: 45 с, 2 мин 5 с, 1 ч 3 мин. */
function dur(ms) {
  if (!(ms > 0)) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} с` : s < 3600 ? `${Math.floor(s / 60)} мин ${s % 60} с` : `${Math.floor(s / 3600)} ч ${Math.floor((s % 3600) / 60)} мин`;
}

module.exports = { dur, titleOk, list, stripHtml, detectLanguage, SALARY, FORBIDDEN, isCvHeavy };
