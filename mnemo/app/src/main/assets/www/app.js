'use strict';
/*
 * Мнемо — карточки и уроки для запоминания слов.
 * Один файл без сборки: работает и внутри APK (WebView), и как PWA на iPhone.
 * Все данные хранятся локально в localStorage.
 */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 864e5, MIN = 6e4;
const now = () => Date.now();
const pad = n => String(n).padStart(2, '0');
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const rnd = n => Math.floor(Math.random() * n);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[rnd(a.length)];
const uid = () => now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many; };
const nWords = n => `${n} ${plural(n, 'слово', 'слова', 'слов')}`;
const nCards = n => `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`;
const isAndroid = !!window.Android;

/* ───────────────────────── Языки и уровни ───────────────────────── */
const LANGS = {
  en: { name: 'Английский', flag: '🇬🇧', front: 'en-US' },
  it: { name: 'Итальянский', flag: '🇮🇹', front: 'it-IT' },
  uk: { name: 'Украинский', flag: '🇺🇦', front: 'uk-UA' },
  de: { name: 'Немецкий', flag: '🇩🇪', front: 'de-DE' },
  xx: { name: 'Другие', flag: '🌐', front: 'en-US' },
};
const LEVEL_ORDER = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', ''];
const LEVEL_NAMES = { A0: 'Стартовый', A1: 'Начальный', A2: 'Элементарный', B1: 'Средний', B2: 'Выше среднего', C1: 'Продвинутый', C2: 'Свободный', '': 'Без уровня' };
const levelRank = l => { const i = LEVEL_ORDER.indexOf(l || ''); return i < 0 ? 99 : i; };
const langOfCode = code => { const p = String(code || '').slice(0, 2).toLowerCase(); return LANGS[p] && p !== 'xx' ? p : 'xx'; };

/* ───────────────────────── Хранилище ─────────────────────────
 * Встроенные наборы (тысячи слов) не копируются в localStorage — он маленький.
 * Храним только то, что изменил пользователь: правки карточек (cedit),
 * удалённые карточки (removed), скрытые наборы (hidden), переименования и
 * добавленные в встроенный набор карточки (bdeck), а также свои наборы (decks).
 */
const KEY = 'mnemo.v1';
const DEF_SETTINGS = {
  theme: 'dark', goal: 50, autoplay: false, rate: 0.9, dir: 'td', lessonSize: 6,
  newPerDay: 10, typos: true, sound: true, lang: 'en', onlineVoice: true, track: 'words',
};
let db;
let BUILTIN = [];
let srcIdx = new Map();

function buildBuiltin() {
  BUILTIN = []; srcIdx = new Map();
  for (const b of window.MNEMO_DECKS || []) {
    const lang = b.lang || 'en';
    const cards = [];
    for (const line of String(b.cards).split('\n')) {
      if (!line.trim()) continue;
      const [t, d, ex, exT] = line.split('|').map(s => (s || '').trim());
      if (!t || !d) continue;
      const id = `${lang}:${t}`;
      if (srcIdx.has(id)) continue; // одно слово — одна карточка на язык
      const c = { id, t, d, ex: ex || '', exT: exT || '', note: '' };
      srcIdx.set(id, c);
      cards.push(c);
    }
    if (!cards.length) continue;
    BUILTIN.push({ id: b.id, lang, level: b.level || '', title: b.title, emoji: b.emoji, desc: b.desc || '',
      front: b.front || LANGS[lang].front, back: b.back || 'ru-RU', builtin: true, cards });
  }
  // стабильная сортировка по уровню, внутри уровня — порядок файлов
  BUILTIN = BUILTIN.map((d, i) => [d, i]).sort((a, b) => levelRank(a[0].level) - levelRank(b[0].level) || a[1] - b[1]).map(x => x[0]);
}

function load() {
  try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { db = null; }
  if (!db || !Array.isArray(db.decks)) db = { decks: [], created: now() };
  db.settings = { ...DEF_SETTINGS, ...(db.settings || {}) };
  for (const k of ['prog', 'lessons', 'days', 'best', 'removed', 'flags', 'bdeck', 'cedit', 'hidden', 'won', 'gram', 'exams', 'marathon']) db[k] = db[k] || {};
  if (!db.settings.active || typeof db.settings.active !== 'object') db.settings.active = {};
  if (!db.settings.open || typeof db.settings.open !== 'object') db.settings.open = {};
  if (db.settings.activeDeck) { db.settings.active.en = db.settings.active.en || db.settings.activeDeck; delete db.settings.activeDeck; }
  if (db.seeded || db.decks.some(d => d.builtin)) migrateV1();
  if (!LANGS[db.settings.lang]) db.settings.lang = 'en';
  rebuild();
}

// Первая версия копировала встроенные наборы целиком и называла карточки «набор:слово».
function migrateV1() {
  const remap = id => { const m = /^en-[a-z]+:(.*)$/.exec(id); return m ? 'en:' + m[1] : id; };
  const np = {};
  for (const [k, v] of Object.entries(db.prog)) { const nk = remap(k); if (!np[nk] || (v.last || 0) > (np[nk].last || 0)) np[nk] = v; }
  db.prog = np;
  for (const dk of Object.keys(db.lessons)) {
    const o = {};
    for (const [k, v] of Object.entries(db.lessons[dk])) o[k.replace(/^(\w+):en-[a-z]+:/, '$1:en:')] = v;
    db.lessons[dk] = o;
  }
  const nr = {};
  for (const k of Object.keys(db.removed)) nr[remap(k)] = 1;
  db.removed = nr;
  const b0 = new Map(BUILTIN.map(b => [b.id, b]));
  const owner = new Map();
  for (const b of BUILTIN) for (const c of b.cards) owner.set(c.id, b.id);
  for (const d of db.decks.filter(x => x.builtin)) {
    const src = b0.get(d.id);
    const o = {};
    if (src) for (const f of ['title', 'emoji', 'desc', 'front', 'back']) if (d[f] && d[f] !== src[f]) o[f] = d[f];
    for (const c of d.cards) {
      if (/^c/.test(c.id)) { (o.extra = o.extra || []).push(c); continue; }
      const nid = remap(c.id), s = srcIdx.get(nid);
      // слово могло быть в двух наборах — переносим правки только из «своего»
      if (!s || owner.get(nid) !== d.id) continue;
      const e = {};
      for (const f of ['t', 'd', 'ex', 'exT']) if ((c[f] || '') !== (s[f] || '')) e[f] = c[f];
      if (c.note) e.note = c.note;
      if (c.star) e.star = true;
      if (Object.keys(e).length) db.cedit[nid] = e;
    }
    if (Object.keys(o).length) db.bdeck[d.id] = o;
  }
  for (const id of db.seeded || []) if (!db.decks.some(d => d.id === id)) db.hidden[id] = 1;
  db.decks = db.decks.filter(d => !d.builtin);
  delete db.seeded;
}

// Словари языков грузятся по требованию: при запуске — только текущий язык.
const packLoaded = l => !LANGS[l] || l === 'xx' || !!(window.MNEMO_LOADED || {})[l];
const packWait = {};
function ensureLang(l) {
  if (packLoaded(l)) return Promise.resolve();
  return packWait[l] || (packWait[l] = new Promise((ok, fail) => {
    const sc = document.createElement('script');
    sc.src = `data/pack-${l}.js`;
    if (!(window.MNEMO_GRAMMAR || {})[l]) { // грамматика — отдельным файлом, без неё словарь тоже работает
      const g = document.createElement('script');
      g.src = `data/grammar-${l}.js`;
      g.onload = () => { if (db.settings.lang === l && view) render(true); };
      document.head.appendChild(g);
    }
    sc.onload = () => { buildBuiltin(); rebuild(); ok(); };
    sc.onerror = () => { delete packWait[l]; fail(new Error('pack ' + l)); };
    document.head.appendChild(sc);
  }));
}
function switchLang(l) {
  db.settings.lang = l; saveSoon();
  if (packLoaded(l)) { render(); return; }
  view.innerHTML = '<div class="pad"><p class="empty">Загружаю словарь…</p></div>';
  ensureLang(l).then(() => render(), () => { toast('Не удалось загрузить словарь'); render(); });
}

let DECKS = [];
function rebuild() {
  DECKS = [];
  for (const b of BUILTIN) {
    if (db.hidden[b.id]) continue;
    const o = db.bdeck[b.id] || {};
    const cards = [];
    for (const s of b.cards) {
      if (db.removed[s.id]) continue;
      const e = db.cedit[s.id];
      cards.push(e ? { ...s, ...e } : { ...s });
    }
    if (o.extra) cards.push(...o.extra);
    DECKS.push({ ...b, title: o.title || b.title, emoji: o.emoji || b.emoji, desc: o.desc ?? b.desc, front: o.front || b.front, back: o.back || b.back, cards });
  }
  for (const d of db.decks) { d.lang = d.lang || langOfCode(d.front); DECKS.push(d); }
  reindex();
}

let saveT = 0;
function saveSoon() { clearTimeout(saveT); saveT = setTimeout(save, 400); }
function save() {
  clearTimeout(saveT);
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Не удалось сохранить: память переполнена'); }
}
window.appFlush = save;
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

let cardIdx = new Map();
let byLang = {};
function reindex() {
  cardIdx = new Map(); byLang = {};
  for (const d of DECKS) {
    const L = byLang[d.lang] || (byLang[d.lang] = []);
    for (const c of d.cards) { if (cardIdx.has(c.id)) continue; cardIdx.set(c.id, { c, d }); L.push(c); }
  }
}
const curLang = () => db.settings.lang;
const deckById = id => DECKS.find(d => d.id === id);
const langDecks = (l = curLang()) => DECKS.filter(d => d.lang === l);
// Вкладка языка — если для него есть словарь (пакет) или свои наборы.
const langList = () => Object.keys(LANGS).filter(l => (l === 'xx' ? false : !window.MNEMO_PACKS || window.MNEMO_PACKS.includes(l)) || DECKS.some(d => d.lang === l));
const allCards = () => byLang[curLang()] || [];
const everyCard = () => [...cardIdx.values()].map(x => x.c);

// Изменения карточек и наборов: для встроенных записываем только разницу.
function editCard(c, f) {
  Object.assign(c, f);
  if (srcIdx.has(c.id)) db.cedit[c.id] = { ...(db.cedit[c.id] || {}), ...f };
  saveSoon();
}
function addCard(d, c, noIndex) {
  d.cards.push(c);
  if (d.builtin) { const o = db.bdeck[d.id] || (db.bdeck[d.id] = {}); (o.extra = o.extra || []).push(c); }
  if (!noIndex) reindex();
  saveSoon();
}
function removeCard(d, c) {
  d.cards = d.cards.filter(x => x !== c);
  if (d.builtin) {
    if (srcIdx.has(c.id)) db.removed[c.id] = 1;
    else { const o = db.bdeck[d.id]; if (o && o.extra) o.extra = o.extra.filter(x => x !== c); }
  }
  delete db.prog[c.id];
  reindex();
  saveSoon();
}
function editDeck(d, f) {
  Object.assign(d, f);
  if (d.builtin) db.bdeck[d.id] = { ...(db.bdeck[d.id] || {}), ...f };
  saveSoon();
}

const SMART = {
  '@all': { title: 'Все слова', emoji: '📚', desc: 'Все карточки из всех наборов вперемешку.' },
  '@seen': { title: 'Изученные', emoji: '🧠', desc: 'Слова, которые вы уже встречали в занятиях.' },
  '@star': { title: 'Избранное', emoji: '⭐', desc: 'Карточки, отмеченные звёздочкой.' },
  '@hard': { title: 'Трудные слова', emoji: '🎯', desc: 'Слова, в которых вы чаще всего ошибаетесь. Занимайтесь ими отдельно.' },
};
function smartCards(id) {
  const all = allCards();
  if (id === '@all') return all;
  if (id === '@seen') return all.filter(c => db.prog[c.id]?.seen);
  if (id === '@star') return all.filter(c => c.star);
  if (id === '@hard') {
    return all.filter(c => { const p = db.prog[c.id]; return p && p.wrong >= 1 && p.wrong / (p.wrong + p.right) >= 0.25; })
      .sort((a, b) => db.prog[b.id].wrong - db.prog[a.id].wrong).slice(0, 60);
  }
  return [];
}
function getDeck(id) {
  if (id && id[0] === '@') return { id, ...SMART[id], smart: true, cards: smartCards(id) };
  return deckById(id);
}
function langsOf(c) {
  const d = cardIdx.get(c.id)?.d;
  return { fl: d?.front || 'en-US', bl: d?.back || 'ru-RU' };
}

/* ───────────────────────── Интервальные повторения ───────────────────────── */
function prog(id) {
  return db.prog[id] || (db.prog[id] = { ef: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0, right: 0, wrong: 0, seen: 0, last: 0 });
}
function level(id) {
  const p = db.prog[id];
  if (!p || !p.seen) return 0;
  if (p.ivl >= 21) return 4;
  if (p.ivl >= 7) return 3;
  if (p.ivl >= 2) return 2;
  return 1;
}
const LEVELS = ['новое', 'изучаю', 'знакомо', 'знаю', 'выучено'];
const isDue = c => { const p = db.prog[c.id]; return !!(p && p.seen && p.due <= now()); };
const dueCards = (cards = allCards()) => cards.filter(isDue);

// SM-2 с четырьмя кнопками, как в Anki: 0 — снова, 1 — трудно, 2 — хорошо, 3 — легко.
function nextState(p, q) {
  const t = now();
  if (q === 0) return { ivl: 0, ef: Math.max(1.3, p.ef - 0.2), reps: 0, due: t + 10 * MIN };
  let ivl;
  if (p.reps === 0) ivl = q === 3 ? 4 : 1;
  else if (p.reps === 1) ivl = q === 1 ? 2 : q === 2 ? 3 : 6;
  else ivl = Math.round(Math.max(1, p.ivl) * (q === 1 ? 1.2 : q === 2 ? p.ef : p.ef * 1.3));
  ivl = clamp(ivl, 1, 3650);
  const ef = clamp(p.ef + (q === 1 ? -0.15 : q === 3 ? 0.15 : 0), 1.3, 3.2);
  return { ivl, ef, reps: p.reps + 1, due: startOfDay(addDays(t, ivl)) + 3 * 3600e3 };
}
function grade(id, q) {
  const p = prog(id);
  const n = nextState(p, q);
  if (q === 0) { if (p.reps > 0) p.lapses++; p.wrong++; } else p.right++;
  Object.assign(p, n);
  if (!p.seen) { p.seen = now(); dayRec().nw++; }
  p.last = now();
  saveSoon();
}
// Ответ в уроке, тесте или игре: тоже двигает карточку по шкале повторений.
function practice(id, ok) {
  const p = prog(id);
  const d = dayRec();
  ok ? d.ok++ : d.bad++;
  if (ok) {
    if (!p.seen || p.due <= now()) grade(id, 2);
    else { p.right++; p.last = now(); saveSoon(); }
  } else if (p.seen && p.ivl >= 1) {
    grade(id, 0);
  } else {
    if (!p.seen) { p.seen = now(); d.nw++; }
    p.wrong++; p.due = now(); p.last = now(); saveSoon();
  }
}
function fmtIvl(ms) {
  const m = ms / MIN;
  if (m < 60) return `${Math.max(1, Math.round(m))} мин`;
  const days = Math.round(ms / DAY);
  if (days < 1) return `${Math.round(m / 60)} ч`;
  if (days < 14) return `${days} д`;
  if (days < 60) return `${Math.round(days / 7)} нед`;
  if (days < 365) return `${Math.round(days / 30)} мес`;
  return `${(days / 365).toFixed(1).replace('.0', '')} г`;
}

/* ───────────────────────── Статистика дня, XP, серия ───────────────────────── */
function dayRec(k = dayKey(now())) {
  const d = db.days[k] || (db.days[k] = { xp: 0, ok: 0, bad: 0, nw: 0 });
  d.nw = d.nw || 0;
  return d;
}
function addXp(n) {
  const d = dayRec();
  const before = d.xp;
  d.xp += n;
  if (before < db.settings.goal && d.xp >= db.settings.goal) setTimeout(() => toast('🎉 Дневная цель выполнена!'), 250);
  saveSoon();
}
function streak() {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  if (!(db.days[dayKey(d)]?.xp > 0)) d.setDate(d.getDate() - 1);
  let s = 0;
  while (db.days[dayKey(d)]?.xp > 0) { s++; d.setDate(d.getDate() - 1); }
  return s;
}
function bestStreak() {
  const keys = Object.keys(db.days).filter(k => db.days[k].xp > 0).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const t = new Date(k + 'T12:00:00').getTime();
    run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}
const totalXp = () => Object.values(db.days).reduce((s, d) => s + (d.xp || 0), 0);

/* ───────────────────────── Проверка ответов ───────────────────────── */
function norm(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[’`]/g, "'")
    .replace(/\([^)]*\)/g, ' ').replace(/[.,!?;:"«»…\-—–/]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Английские и итальянские артикли не обязательны в ответе.
function stripArticles(s) { return s.replace(/^(to|a|an|the|il|lo|la|i|gli|le|un|uno|una) /, '').replace(/^(l|un)'/, ''); }
function variants(answer) {
  const set = new Set();
  const add = s => { const n = norm(s); if (n) { set.add(n); set.add(stripArticles(n)); } };
  add(answer);
  String(answer).replace(/\([^)]*\)/g, ' ').split(/[,;/]| или /).forEach(add);
  return [...set];
}
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Без диакритики: è→e, ї→і, й→и. Совпадение без неё засчитываем как опечатку.
const loose = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ʼ/g, "'").replace(/ß/g, 'ss');
// Немецкое существительное (der Tisch): без артикля засчитываем, но неверный артикль — ошибка.
const DE_ART = /^(der|die|das) (?=\p{Lu})/u;
function checkAnswer(input, answer) {
  const de = DE_ART.exec(String(answer).trim());
  if (de) {
    const a = /^(der|die|das)\s+/i.exec(String(input).trim());
    if (a && a[1].toLowerCase() !== de[1]) return { ok: false };
    return checkAnswer(String(input).trim().slice(a ? a[0].length : 0), String(answer).trim().slice(de[0].length));
  }
  const n = stripArticles(norm(input));
  if (!n) return { ok: false };
  const v = variants(answer);
  if (v.includes(n) || v.includes(norm(input))) return { ok: true };
  const ln = loose(n);
  if (v.some(x => loose(x) === ln)) return { ok: true, typo: true };
  if (db.settings.typos) {
    for (const x of v) {
      const allowed = x.length >= 8 ? 2 : x.length >= 4 ? 1 : 0;
      if (allowed && lev(ln, loose(x)) <= allowed) return { ok: true, typo: true };
    }
  }
  return { ok: false };
}

/* ───────────────────────── Озвучка, звук, вибрация ───────────────────────── */
function speechText(t) { return String(t).replace(/\s[—–-]\s/g, ', ').replace(/\//g, ' ').replace(/…/g, ' ').replace(/\([^)]*\)/g, ''); }
let voices = [];
function loadVoices() { try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
// Есть ли в устройстве голос для языка: true / false / null (пока неизвестно).
function hasVoice(lang) {
  if (window.Android && Android.voiceStatus) {
    try { const r = Android.voiceStatus(lang); return r < 0 ? null : r === 2; } catch (e) { return null; }
  }
  if (!window.speechSynthesis) return false;
  if (!voices.length) return null;
  const base = lang.slice(0, 2);
  return voices.some(v => v.lang.replace('_', '-').slice(0, 2) === base);
}
// Запасная онлайн-озвучка — если голоса нет (часто так с украинским).
let onlineAudio = null;
function stopOnline() { if (onlineAudio) { try { onlineAudio.pause(); } catch (e) {} onlineAudio = null; } }
function speakOnline(t, lang, rate, fallback) {
  stopOnline();
  const a = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang.slice(0, 2)}&q=${encodeURIComponent(t.slice(0, 200))}`);
  a.playbackRate = clamp(rate, 0.5, 2);
  onlineAudio = a;
  a.play().catch(() => { onlineAudio = null; fallback(); });
}
let voiceWarned = {};
function speak(text, lang = 'en-US', slow = false) {
  if (!text) return;
  const rate = db.settings.rate * (slow ? 0.6 : 1);
  const t = speechText(text);
  const local = () => speakLocal(t, lang, rate);
  if (db.settings.onlineVoice !== false && hasVoice(lang) === false && navigator.onLine !== false) {
    speakOnline(t, lang, rate, () => {
      if (!voiceWarned[lang]) { voiceWarned[lang] = 1; toast('Нет голоса для этого языка — см. Настройки → Голоса'); }
      local();
    });
    return;
  }
  stopOnline();
  local();
}
function speakLocal(t, lang, rate) {
  if (window.Android && Android.speak) { try { Android.speak(t, lang, rate); } catch (e) {} return; }
  if (!window.speechSynthesis) { toast('Озвучка недоступна на этом устройстве'); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = lang; u.rate = rate;
    const base = lang.slice(0, 2);
    const v = voices.find(v => v.lang.replace('_', '-') === lang) || voices.find(v => v.lang.slice(0, 2) === base);
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {}
}
let actx = null;
function beep(ok) {
  if (!db.settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    const notes = ok ? [[660, 0], [880, 0.09]] : [[220, 0], [185, 0.12]];
    for (const [f, dt] of notes) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = ok ? 'sine' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.12, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.18);
      o.connect(g).connect(actx.destination);
      o.start(t + dt); o.stop(t + dt + 0.2);
    }
  } catch (e) {}
  if (!ok) vibrate(60);
}
function vibrate(ms) {
  if (!db.settings.sound) return;
  try { if (window.Android && Android.vibrate) Android.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}

/* ───────────────────────── Общий интерфейс ───────────────────────── */
const I = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  spk: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M3 7h3c5 0 7 10 12 10h3M3 17h3c2 0 3.3-1.6 4.6-3.6M14 9.6C15.2 8 16.5 7 18 7h3M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  turtle: '<svg viewBox="0 0 24 24"><path d="M4 15c0-4 3.5-7 8-7s8 3 8 7z"/><path d="M20 13h2M6 15l-1 3M18 15l1 3M9 9l2 6M15 9l-2 6"/></svg>',
};
function hdr(title, opts = {}) {
  return `<header class="hdr">${opts.root ? '' : `<button class="ib" data-act="back" aria-label="Назад">${I.back}</button>`}
    <h1>${title}</h1><div class="hdr-r">${opts.right || ''}</div></header>`;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 2400);
}
let modalCb = null;
function openModal(html, cls = '') {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet ${cls}">${html}</div>`;
  m.hidden = false;
  requestAnimationFrame(() => m.classList.add('on'));
  const af = $('[autofocus]', m); if (af) setTimeout(() => af.focus(), 60);
}
function closeModal() {
  const m = $('#modal');
  m.classList.remove('on');
  m.hidden = true;
  m.innerHTML = '';
  modalCb = null;
}
function confirmBox(text, okLabel, cb, danger = true) {
  modalCb = cb;
  openModal(`<p class="mtext">${text}</p><div class="row2"><button class="btn ghost" data-act="modal-close">Отмена</button>
    <button class="btn ${danger ? 'danger' : ''}" data-act="modal-ok">${okLabel}</button></div>`);
}
function lvlDot(id) { const l = level(id); return `<i class="lvl-dot l${l}" title="${LEVELS[l]}"></i>`; }
function masteryBar(cards) {
  const n = cards.length || 1;
  const cnt = [0, 0, 0, 0, 0];
  for (const c of cards) cnt[level(c.id)]++;
  return `<div class="mbar">${[4, 3, 2, 1].map(l => cnt[l] ? `<i class="l${l}" style="width:${cnt[l] / n * 100}%"></i>` : '').join('')}</div>`;
}
function spkBtn(text, lang, cls = '') {
  return `<button class="ib spk ${cls}" data-act="speak" data-text="${esc(text)}" data-lang="${esc(lang)}" aria-label="Озвучить">${I.spk}</button>`;
}

/* ───────────────────────── Навигация ───────────────────────── */
const screens = {};
const after = {};
const TABS = ['home', 'decks', 'lessons', 'stats', 'more'];
let stack = [{ name: 'home' }];
let timers = [];
const cur = () => stack[stack.length - 1];
let tickT = 0;
function stopTimers() { timers.forEach(t => clearInterval(t)); timers = []; clearInterval(tickT); stopOnline(); if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) {} }
// Один повторяющийся таймер экрана: повторный рендер не плодит новые интервалы.
function setTick(fn, ms) { clearInterval(tickT); tickT = setInterval(fn, ms); }

function render(keep = false) {
  const c = cur();
  const st = keep ? view.scrollTop : 0;
  view.innerHTML = (screens[c.name] || screens.home)(c);
  const isTab = TABS.includes(c.name);
  document.body.classList.toggle('no-tabs', !isTab);
  document.body.dataset.screen = c.name;
  document.body.dataset.lang = db.settings.lang; // фон страны
  $$('#tabs button').forEach(b => b.classList.toggle('on', isTab && b.dataset.tab === c.name));
  view.scrollTop = st;
  if (after[c.name]) after[c.name](c, keep);
  if (!keep) { const af = $('[autofocus]', view); if (af) af.focus({ preventScroll: true }); }
}
function go(name, params = {}) { stopTimers(); stack.push({ name, ...params }); render(); }
function replace(name, params = {}) { stopTimers(); stack[stack.length - 1] = { name, ...params }; render(); }
function tab(name) { stopTimers(); stack = [{ name }]; render(); }
function back(force) {
  if (!$('#modal').hidden) { closeModal(); return true; }
  const c = cur();
  if (!force && c.name === 'run' && S && !S.finished && S.ok + S.bad > 2) {
    confirmBox('Выйти из занятия? Ответы уже засчитаны в повторение, но урок не будет отмечен пройденным.', 'Выйти', () => back(true));
    return true;
  }
  if (stack.length > 1) { stopTimers(); stack.pop(); render(); return true; }
  if (c.name !== 'home') { tab('home'); return true; }
  return false;
}
window.appBack = () => back();

/* ───────────────────────── Главная ───────────────────────── */
function greet() {
  const h = new Date().getHours();
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}
function ring(pct, size = 64, stroke = 7) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-fg"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - clamp(pct, 0, 1))}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function wordOfDay() {
  const all = allCards().filter(c => c.ex);
  if (!all.length) return null;
  return all[hashStr(dayKey(now())) % all.length];
}
function activeDeck() {
  const d = deckById(db.settings.active[curLang()]);
  return d && d.lang === curLang() && d.cards.length >= 3 ? d : langDecks().find(x => x.cards.length >= 3) || null;
}
function setActive(id) { const d = deckById(id); if (d) { db.settings.active[d.lang] = id; saveSoon(); } }
const deckDone = d => lessonNodes(d).every(n => nodeDone(d, n));
function nextDeckAfter(d) {
  const list = langDecks().filter(x => x.cards.length >= 3);
  const i = list.indexOf(d);
  return list.slice(i + 1).find(x => !deckDone(x)) || list.find(x => x !== d && !deckDone(x)) || null;
}
// Набор для «Продолжить курс»: текущий, а если он пройден — следующий непройденный.
function courseDeck() { const d = activeDeck(); return d && deckDone(d) ? nextDeckAfter(d) || d : d; }
function nextDue() {
  let min = Infinity;
  for (const c of allCards()) { const p = db.prog[c.id]; if (p && p.seen && p.due > now()) min = Math.min(min, p.due); }
  return min;
}

screens.home = () => {
  const st = streak(), d = dayRec(), goal = db.settings.goal;
  const due = dueCards().length;
  const ad = courseDeck();
  let lessonCard = '';
  if (ad) {
    const nodes = lessonNodes(ad);
    const ni = nodes.findIndex(n => !nodeDone(ad, n));
    const done = nodes.filter(n => nodeDone(ad, n)).length;
    const n = nodes[ni];
    lessonCard = `<div class="card cta">
      <div class="cta-ico">${esc(ad.emoji || '📘')}</div>
      <div class="cta-body"><div class="cta-t">${n ? esc(n.title) : 'Все уроки пройдены!'}</div>
        <div class="cta-s">${esc(ad.title)} · ${done}/${nodes.length} уроков</div>
        <div class="pbar sm"><i style="width:${nodes.length ? done / nodes.length * 100 : 0}%"></i></div></div>
      ${n ? `<button class="btn" data-act="lesson-start" data-deck="${esc(ad.id)}" data-n="${ni}">Начать</button>`
        : `<button class="btn ghost" data-act="tab" data-tab="lessons">Выбрать</button>`}
    </div>`;
  }
  const nd = nextDue();
  const w = wordOfDay();
  const tips = window.MNEMO_TIPS || [];
  const tip = tips.length ? tips[hashStr('t' + dayKey(now())) % tips.length] : '';
  const seenN = smartCards('@seen').length;
  const qdeck = seenN >= 8 ? '@seen' : '@all';
  return `<div class="pad home">
    <div class="home-top">
      <div><div class="hello">${greet()}!</div><div class="logo">Мнемо</div></div>
      <div class="streak ${d.xp > 0 ? 'on' : ''}" title="Серия дней">🔥<b>${st}</b></div>
    </div>
    ${langBar()}
    <div class="card goal">
      <div class="goal-ring">${ring(d.xp / goal, 72, 8)}<span>${Math.min(100, Math.round(d.xp / goal * 100))}%</span></div>
      <div><div class="cta-t">Цель дня</div><div class="cta-s">${d.xp} из ${goal} XP · ${d.ok + d.bad} ответов сегодня</div>
      <div class="cta-s">${d.xp >= goal ? 'Отлично! Цель выполнена 🎉' : 'Урок ≈ 150–250 XP, повторение — 10 XP за слово'}</div></div>
    </div>
    <div class="card cta ${due ? 'hot' : ''}">
      <div class="cta-ico">🔁</div>
      <div class="cta-body"><div class="cta-t">Повторение</div>
        <div class="cta-s">${due ? `${nCards(due)} ждут повторения` : nd < Infinity ? `Всё повторено. Следующее через ${fmtIvl(nd - now())}` : 'Пройдите первый урок — слова появятся здесь'}</div></div>
      ${due ? `<button class="btn" data-act="mode" data-mode="review" data-deck="@due">Повторить</button>` : ''}
    </div>
    ${lessonCard}
    <h2 class="sec">Быстрая тренировка</h2>
    <div class="quick">
      <button class="qt" data-act="mode" data-mode="sprint" data-deck="${qdeck}"><b>⚡</b><span>Спринт</span><small>60 секунд</small></button>
      <button class="qt" data-act="mode" data-mode="match" data-deck="${qdeck}"><b>🧩</b><span>Подбор</span><small>на время</small></button>
      <button class="qt" data-act="open-deck" data-id="@hard"><b>🎯</b><span>Трудные</span><small>${nWords(smartCards('@hard').length)}</small></button>
      <button class="qt" data-act="mode" data-mode="learn" data-deck="${qdeck}"><b>🎓</b><span>Смешанное</span><small>заучивание</small></button>
    </div>
    ${w ? `<h2 class="sec">Слово дня</h2>
    <div class="card wotd">
      <div class="wotd-t">${esc(w.t)} ${spkBtn(w.t, langsOf(w).fl)}</div>
      <div class="wotd-d">${esc(w.d)}</div>
      ${w.ex ? `<div class="ex-line">${esc(w.ex)}<br><span>${esc(w.exT)}</span></div>` : ''}
      <button class="lnk" data-act="star" data-id="${esc(w.id)}">${w.star ? '★ В избранном' : '☆ В избранное'}</button>
    </div>` : ''}
    ${tip ? `<div class="tip">💡 ${esc(tip)}</div>` : ''}
  </div>`;
};

/* ───────────────────────── Наборы ───────────────────────── */
function deckRow(d) {
  const cards = d.cards;
  const due = dueCards(cards).length;
  const known = cards.filter(c => level(c.id) >= 2).length;
  return `<button class="deck" data-act="open-deck" data-id="${esc(d.id)}">
    <span class="deck-e">${esc(d.emoji || '📘')}</span>
    <span class="deck-b"><span class="deck-t">${!d.builtin && d.level ? `<span class="lvl-tag">${esc(d.level)}</span> ` : ''}${esc(d.title)}</span>
      <span class="deck-s">${d.builtin && jour(d.lang) && cityOf(d) ? `${db.won[d.id] ? '🏰' : '📍'} ${esc(cityOf(d).n)} · ` : ''}${nWords(cards.length)}${d.level && d.builtin ? ' · ' + esc(d.level) : ''} · знаю ${known}</span>
      ${masteryBar(cards)}</span>
    ${due ? `<span class="badge">${due}</span>` : ''}
  </button>`;
}
function langBar() {
  const L = curLang();
  const ls = langList();
  return `<div class="langbar ${ls.length > 3 ? 'many' : ''}">${ls.map(l => `<button class="lb ${l === L ? 'on' : ''}" data-act="lang" data-l="${l}"><b>${LANGS[l].flag}</b><span>${LANGS[l].name}</span></button>`).join('')}</div>`;
}
function byLevel(decks) {
  const m = new Map();
  for (const d of decks) { const k = d.level || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(d); }
  return [...m.entries()].sort((a, b) => levelRank(a[0]) - levelRank(b[0]));
}
function levelOpen(lv) {
  const v = db.settings.open[curLang() + ':' + lv];
  if (v !== undefined) return v;
  const ad = activeDeck();
  return !!ad && (ad.level || '') === lv;
}
function levelHead(lv, list, act = 'lvl-toggle', open = levelOpen(lv)) {
  const cards = list.flatMap(d => d.cards);
  const known = cards.filter(c => level(c.id) >= 2).length;
  return `<button class="lvl-h ${open ? 'open' : ''}" data-act="${act}" data-l="${esc(lv)}">
    <span class="lvl-b">${esc(lv || '—')}</span>
    <span class="lvl-t"><b>${LEVEL_NAMES[lv] || esc(lv)}</b><small>${list.length} ${plural(list.length, 'набор', 'набора', 'наборов')} · ${nWords(cards.length)} · знаю ${known}</small>${masteryBar(cards)}</span>${I.chev}</button>`;
}
function decksHtml(q) {
  const ds = langDecks();
  if (q) {
    const list = ds.filter(d => d.title.toLowerCase().includes(q));
    return (list.map(deckRow).join('') || '') + wordSearch(q) || '<p class="empty">Ничего не найдено</p>';
  }
  const mine = ds.filter(d => !d.builtin).map((d, i) => [d, i]).sort((a, b) => levelRank(a[0].level) - levelRank(b[0].level) || a[1] - b[1]).map(x => x[0]);
  let h = mine.length ? `<h2 class="sec">Мои наборы</h2>${mine.map(deckRow).join('')}` : '';
  for (const [lv, list] of byLevel(ds.filter(d => d.builtin))) {
    const open = levelOpen(lv);
    h += levelHead(lv, list, 'lvl-toggle', open) + (open ? `<div class="lvl-list">${list.map(deckRow).join('')}<button class="gexam sm ${db.exams[examKey(curLang(), lv)]?.passed ? 'ok' : ''}" data-act="exam" data-lv="${lv}"><b>${examBadge(curLang(), lv)}</b><span>Экзамен уровня ${lv}</span></button></div>` : '');
  }
  return h || `<p class="empty">Для этого языка пока нет наборов. Создайте свой или импортируйте список слов.</p>`;
}
screens.decks = c => {
  const q = (c.q || '').toLowerCase();
  const smart = Object.keys(SMART).map(id => `<button class="chip big" data-act="open-deck" data-id="${id}">${SMART[id].emoji} ${SMART[id].title} <small>${smartCards(id).length}</small></button>`).join('');
  return `${hdr('Наборы', { root: true, right: `<button class="ib" data-act="deck-add" aria-label="Добавить">${I.plus}</button>` })}
  <div class="pad">
    ${langBar()}
    <label class="search">${I.search}<input type="search" placeholder="Поиск по наборам и словам" value="${esc(c.q || '')}" data-in="dsearch"></label>
    <div class="chips scroll">${smart}</div>
    <div id="dlist">${decksHtml(q)}</div>
    <button class="btn ghost wide" data-act="deck-add">＋ Новый набор или импорт</button>
  </div>`;
};
function wordSearch(q) {
  const hits = allCards().filter(x => x.t.toLowerCase().includes(q) || x.d.toLowerCase().includes(q)).slice(0, 40);
  if (!hits.length) return '';
  return `<h2 class="sec">Слова</h2>${hits.map(cardRow).join('')}`;
}

const MODES = [
  ['flash', '🃏', 'Карточки', 'Переворачивайте и сортируйте'],
  ['learn', '🎓', 'Заучивание', 'Выбор → письмо, до полного знания'],
  ['review', '🔁', 'Повторение', 'Интервальные повторения'],
  ['test', '📝', 'Тест', 'Проверка с оценкой'],
  ['match', '🧩', 'Подбор', 'Найдите пары на время'],
  ['write', '✍️', 'Письмо', 'Пишите перевод сами'],
  ['listen', '👂', 'Диктант', 'Слушайте и записывайте'],
  ['scramble', '🔤', 'Собери слово', 'Слово из букв'],
  ['sprint', '⚡', 'Спринт', 'Верно или нет за 60 с'],
  ['cloze', '🧷', 'Пропуски', 'Слово в контексте фразы'],
  ['gravity', '🌠', 'Гравитация', 'Успейте ответить, пока слово падает'],
  ['audio', '🎧', 'Аудиоплеер', 'Слушайте слова без рук — в дороге'],
  ['lessons', '🗺️', 'Уроки', 'Пошаговый курс по набору'],
];
// Направление: td — показываем иностранное слово, отвечаем по-русски; dt — наоборот.
const DIR_ORDER = ['td', 'dt', 'mix'];
function dirLabels(lang) {
  const L = LANGS[lang] || LANGS[curLang()] || LANGS.xx;
  const from = L === LANGS.xx ? 'С иностранного' : 'С ' + L.name.toLowerCase().replace(/ий$/, 'ого');
  return { td: [`${L.flag} → 🇷🇺`, from], dt: [`🇷🇺 → ${L.flag}`, 'С русского'], mix: ['🔀', 'Вперемешку'] };
}
function dirSeg(lang) {
  const L = dirLabels(lang);
  return `<div class="seg dirseg">${DIR_ORDER.map(k => `<button class="${db.settings.dir === k ? 'on' : ''}" data-act="set" data-k="dir" data-v="${k}"><b>${L[k][0]}</b><small>${L[k][1]}</small></button>`).join('')}</div>`;
}
// Быстрый переключатель прямо в карточках и повторении.
function dirChip(lang) {
  const L = dirLabels(lang)[db.settings.dir] || dirLabels(lang).td;
  return `<button class="chip dirchip" data-act="dir-cycle" data-l="${esc(lang || '')}">⇄ ${L[0]}</button>`;
}
function cardRow(c) {
  const { fl } = langsOf(c);
  return `<div class="crow" data-act="edit-card" data-id="${esc(c.id)}">
    ${lvlDot(c.id)}
    <div class="crow-b"><div class="crow-t">${esc(c.t)}</div><div class="crow-d">${esc(c.d)}</div></div>
    ${spkBtn(c.t, fl)}
    <button class="ib star ${c.star ? 'on' : ''}" data-act="star" data-id="${esc(c.id)}" aria-label="Избранное">${I.star}</button>
  </div>`;
}
screens.deck = c => {
  const d = getDeck(c.id);
  if (!d) return hdr('Набор') + '<p class="empty">Набор не найден</p>';
  const cards = d.cards;
  const f = c.f || 'all';
  const filtered = cards.filter(x => f === 'all' || (f === 'star' && x.star) || (f === 'new' && level(x.id) === 0) || (f === 'learn' && level(x.id) > 0 && level(x.id) < 3) || (f === 'known' && level(x.id) >= 3));
  const cnt = [0, 0, 0, 0, 0]; cards.forEach(x => cnt[level(x.id)]++);
  const due = dueCards(cards).length;
  const modes = MODES.filter(m => !(d.smart && m[0] === 'lessons'));
  return `${hdr(`${esc(d.emoji || '📘')} ${esc(d.title)}`, { right: d.smart ? '' : `<button class="ib" data-act="deck-menu" data-id="${esc(d.id)}" aria-label="Меню">${I.more}</button>` })}
  <div class="pad">
    ${d.desc ? `<p class="desc">${esc(d.desc)}</p>` : ''}
    ${deckCity(d)}
    ${deckExtras(d)}
    <div class="stats3">
      <div><b>${cards.length}</b><span>${plural(cards.length, 'слово', 'слова', 'слов')}</span></div>
      <div><b>${cnt[3] + cnt[4]}</b><span>знаю</span></div>
      <div><b>${due}</b><span>к повторению</span></div>
    </div>
    ${masteryBar(cards)}
    <div class="legend">${LEVELS.map((l, i) => `<span><i class="lvl-dot l${i}"></i>${l} ${cnt[i]}</span>`).join('')}</div>
    ${cards.length ? `<div class="lbl">Как спрашивать</div>${dirSeg(d.lang)}
    <div class="modes">${modes.map(([k, e, t, s]) => `<button class="mode" data-act="mode" data-mode="${k}" data-deck="${esc(d.id)}"><b>${e}</b><span>${t}</span><small>${s}</small></button>`).join('')}</div>` : `<p class="empty">${d.smart ? 'Здесь пока пусто.' : 'В наборе пока нет карточек.'}</p>`}
    <div class="list-h"><h2 class="sec">Карточки</h2>${d.smart ? '' : `<button class="btn sm" data-act="card-new" data-deck="${esc(d.id)}">＋ Карточка</button>`}</div>
    <div class="chips">${[['all', 'Все'], ['star', '⭐'], ['new', 'Новые'], ['learn', 'Изучаю'], ['known', 'Знаю']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="deck-filter" data-f="${k}">${l}</button>`).join('')}</div>
    ${filtered.map(cardRow).join('') || '<p class="empty">Нет карточек</p>'}
  </div>`;
};

const VOICE_LANGS = [['en-US', 'Английский (США)'], ['en-GB', 'Английский (Брит.)'], ['ru-RU', 'Русский'], ['de-DE', 'Немецкий'], ['fr-FR', 'Французский'], ['es-ES', 'Испанский'], ['it-IT', 'Итальянский'], ['pt-BR', 'Португальский'], ['tr-TR', 'Турецкий'], ['pl-PL', 'Польский'], ['uk-UA', 'Украинский'], ['zh-CN', 'Китайский'], ['ja-JP', 'Японский'], ['ko-KR', 'Корейский'], ['ar-SA', 'Арабский'], ['he-IL', 'Иврит'], ['sr-RS', 'Сербский'], ['cs-CZ', 'Чешский'], ['fi-FI', 'Финский'], ['el-GR', 'Греческий']];
const langSel = (name, v) => `<select name="${name}">${VOICE_LANGS.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const levelSel = (name, v) => `<select name="${name}">${LEVEL_ORDER.map(l => `<option value="${l}" ${l === v ? 'selected' : ''}>${l ? `${l} — ${LEVEL_NAMES[l]}` : 'Без уровня'}</option>`).join('')}</select>`;
function deckForm(d) {
  d = d || { title: '', emoji: '📘', desc: '', front: LANGS[curLang()].front, back: 'ru-RU' };
  openModal(`<h3>${d.id ? 'Набор' : 'Новый набор'}</h3>
    <form class="form" data-form="deck" data-id="${esc(d.id || '')}">
      <div class="row-e"><input name="emoji" value="${esc(d.emoji || '📘')}" maxlength="4" class="emoji-in"><input name="title" placeholder="Название" value="${esc(d.title)}" required ${d.id ? '' : 'autofocus'}></div>
      <textarea name="desc" rows="2" placeholder="Описание (необязательно)">${esc(d.desc || '')}</textarea>
      ${d.builtin ? '' : `<label>Уровень${levelSel('level', d.level || '')}</label>`}
      <label>Язык слов (лицевая сторона)${langSel('front', d.front)}</label>
      <label>Язык перевода (оборот)${langSel('back', d.back)}</label>
      <div class="row2"><button type="button" class="btn ghost" data-act="modal-close">Отмена</button><button class="btn">${d.id ? 'Сохранить' : 'Создать'}</button></div>
    </form>`);
}
function cardForm(c, deckId) {
  const isNew = !c;
  c = c || { t: '', d: '', ex: '', exT: '', note: '' };
  const p = !isNew && db.prog[c.id];
  openModal(`<h3>${isNew ? 'Новая карточка' : 'Карточка'}</h3>
    <form class="form" data-form="card" data-id="${esc(c.id || '')}" data-deck="${esc(deckId || '')}">
      <input name="t" placeholder="Слово или фраза" value="${esc(c.t)}" required ${isNew ? 'autofocus' : ''}>
      <input name="d" placeholder="Перевод" value="${esc(c.d)}" required>
      <input name="ex" placeholder="Пример (необязательно)" value="${esc(c.ex)}">
      <input name="exT" placeholder="Перевод примера" value="${esc(c.exT)}">
      <textarea name="note" rows="2" placeholder="Подсказка-ассоциация: как запомнить">${esc(c.note || '')}</textarea>
      ${p ? `<p class="hint">Уровень: ${LEVELS[level(c.id)]} · верно ${p.right}, ошибок ${p.wrong}${p.seen ? ` · повтор через ${p.due > now() ? fmtIvl(p.due - now()) : 'сейчас'}` : ''}</p>` : ''}
      <div class="row2">${isNew ? `<button type="button" class="btn ghost" data-act="modal-close">Закрыть</button>` : `<button type="button" class="btn ghost danger-t" data-act="card-del" data-id="${esc(c.id)}">Удалить</button>`}
      <button class="btn">${isNew ? 'Добавить' : 'Сохранить'}</button></div>
      ${isNew ? '<p class="hint">После добавления форма останется открытой для следующей карточки.</p>' : ''}
    </form>`);
}

/* ───────────────────────── Импорт и экспорт ───────────────────────── */
const SEPS = [['auto', 'Авто'], ['tab', 'Табуляция'], ['dash', 'Тире'], ['semi', ';'], ['comma', ','], ['pipe', '|'], ['eq', '=']];
function splitLine(line, sep) {
  const bySep = { tab: '\t', semi: ';', comma: ',', pipe: '|', eq: '=' };
  if (sep === 'dash') { const m = line.match(/\s+[-—–]\s+|[—–]/); return m ? [line.slice(0, m.index), line.slice(m.index + m[0].length)] : null; }
  if (sep !== 'auto') { const p = line.split(bySep[sep]); return p.length > 1 ? p : null; }
  if (line.includes('\t')) return line.split('\t');
  if (line.includes('|')) return line.split('|');
  if (/\s[-—–]\s|[—–]/.test(line)) return splitLine(line, 'dash');
  if (line.includes(';')) return line.split(';');
  if (line.includes('=')) return line.split('=');
  if (line.includes(',')) { const i = line.indexOf(','); return [line.slice(0, i), line.slice(i + 1)]; }
  if (/\s-\s?|-\s/.test(line)) { const i = line.indexOf('-'); return [line.slice(0, i), line.slice(i + 1)]; }
  return null;
}
function parseImport(text, sep, swap) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const p = splitLine(line, sep);
    if (!p) continue;
    let [t, d, ex, exT, note] = p.map(s => (s || '').trim());
    if (swap) [t, d] = [d, t];
    if (t && d) out.push({ t, d, ex: ex || '', exT: exT || '', note: note || '' });
  }
  return out;
}
screens.import = c => {
  const d = c.deck ? deckById(c.deck) : null;
  return `${hdr(d ? `Импорт в «${esc(d.title)}»` : 'Импорт слов')}
  <div class="pad form">
    <p class="desc">По одной карточке на строку: <b>слово - перевод</b>. Подходит экспорт из Quizlet (табуляция), Excel, заметок. Можно добавить пример и его перевод через «|».</p>
    ${d ? '' : `<input id="imp-title" placeholder="Название нового набора" value="${esc(c.title || '')}">`}
    <textarea id="imp-text" rows="10" placeholder="apple - яблоко&#10;pear - груша&#10;to run — бегать">${esc(c.text || '')}</textarea>
    <label class="file-btn btn ghost">📄 Загрузить из файла (.txt, .csv)<input type="file" accept=".txt,.csv,.tsv,text/*" data-file="import"></label>
    <div class="lbl">Разделитель</div>
    <div class="chips">${SEPS.map(([k, l]) => `<button class="chip ${(c.sep || 'auto') === k ? 'on' : ''}" data-act="imp-sep" data-v="${k}">${l}</button>`).join('')}</div>
    <label class="tgl"><input type="checkbox" id="imp-swap" ${c.swap ? 'checked' : ''}> Поменять стороны местами</label>
    ${d ? '' : `<div class="row2"><label>Язык слов${langSel('imp-front', c.front || LANGS[curLang()].front)}</label><label>Язык перевода${langSel('imp-back', c.back || 'ru-RU')}</label></div>
    <label>Уровень набора${levelSel('imp-level', c.level || '')}</label>`}
    <div id="imp-prev" class="imp-prev"></div>
    <button class="btn wide" data-act="imp-do">Импортировать</button>
  </div>`;
};
after.import = c => { updateImportPreview(c); };
function readImportForm(c) {
  c.text = $('#imp-text')?.value || '';
  c.title = $('#imp-title')?.value || c.title;
  c.swap = !!$('#imp-swap')?.checked;
  const f = $('select[name="imp-front"]'), b = $('select[name="imp-back"]');
  if (f) c.front = f.value;
  if (b) c.back = b.value;
  const lv = $('select[name="imp-level"]');
  if (lv) c.level = lv.value;
}
function updateImportPreview(c) {
  readImportForm(c);
  const items = parseImport(c.text, c.sep || 'auto', c.swap);
  const el = $('#imp-prev');
  if (!el) return;
  el.innerHTML = c.text.trim() ? `<div class="lbl">Распознано: ${nCards(items.length)}</div>` +
    items.slice(0, 6).map(x => `<div class="crow sm"><div class="crow-b"><div class="crow-t">${esc(x.t)}</div><div class="crow-d">${esc(x.d)}</div></div></div>`).join('') +
    (items.length > 6 ? `<div class="hint">…и ещё ${items.length - 6}</div>` : '') : '';
}
function exportDeckText(d) {
  return d.cards.map(c => [c.t, c.d, c.ex, c.exT].filter((x, i) => i < 2 || x).join('\t')).join('\n');
}
function shareText(text, title) {
  if (window.Android && Android.share) { Android.share(text, title || 'Мнемо'); return; }
  if (navigator.share) { navigator.share({ title, text }).catch(() => {}); return; }
  copyText(text);
}
function copyText(text) {
  const done = () => toast('Скопировано в буфер обмена');
  if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done)); }
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { toast('Не удалось скопировать'); }
  ta.remove();
}
function saveFile(name, text, mime = 'application/json') {
  if (window.Android && Android.saveFile) {
    const res = Android.saveFile(name, text);
    toast(res ? `Сохранено: ${res}` : 'Не удалось сохранить файл');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Файл сохранён');
}

/* ───────────────────────── Уроки ───────────────────────── */
function lessonNodes(deck) {
  const L = db.settings.lessonSize;
  const cards = deck.cards;
  const groups = [];
  for (let i = 0; i < cards.length; i += L) groups.push(cards.slice(i, i + L));
  if (groups.length > 1 && groups[groups.length - 1].length < 3) groups[groups.length - 2].push(...groups.pop());
  const nodes = [];
  let unit = [], u = 1;
  groups.forEach((g, gi) => {
    nodes.push({ kind: 'learn', cards: g, unit: u, title: `Урок ${gi + 1}: ${g.slice(0, 3).map(x => x.t).join(', ')}${g.length > 3 ? '…' : ''}` });
    unit.push(...g);
    if ((gi + 1) % 3 === 0 || gi === groups.length - 1) {
      if (groups.length > 1 && unit.length >= 6) nodes.push({ kind: 'review', cards: unit, unit: u, title: `Повторение раздела ${u}` });
      unit = []; u++;
    }
  });
  if (cards.length >= 12) nodes.push({ kind: 'exam', cards, unit: u, title: 'Итоговый экзамен по набору' });
  return nodes;
}
const nodeKey = n => `${n.kind}:${n.cards[0]?.id}:${n.cards.length}`;
const nodeDone = (deck, n) => !!(db.lessons[deck.id] || {})[nodeKey(n)];
const nodeStars = (deck, n) => (db.lessons[deck.id] || {})[nodeKey(n)] || 0;

screens.lessons = () => (db.settings.track === 'gram' ? lessonsGram() : lessonsWords());
function lessonsWords() {
  const deck = activeDeck();
  if (!deck) return `${hdr('Уроки', { root: true })}<div class="pad">${langBar()}${trackSeg()}<p class="empty">Добавьте набор хотя бы из 3 слов — и из него соберутся уроки.</p></div>`;
  const nodes = lessonNodes(deck);
  const firstOpen = nodes.findIndex(n => !nodeDone(deck, n));
  let html = '', lastUnit = 0;
  nodes.forEach((n, i) => {
    if (n.unit !== lastUnit && n.kind !== 'exam') {
      lastUnit = n.unit;
      const un = nodes.filter(x => x.unit === n.unit);
      const ud = un.filter(x => nodeDone(deck, x)).length;
      html += `<div class="unit"><b>Раздел ${n.unit}</b><span>${ud}/${un.length}</span></div>`;
    }
    const done = nodeDone(deck, n), stars = nodeStars(deck, n);
    const state = done ? 'done' : i === firstOpen ? 'cur' : 'lock';
    const off = Math.round(Math.sin(i * 0.9) * 70);
    const ico = n.kind === 'exam' ? '🏆' : n.kind === 'review' ? '🔁' : done ? '✓' : i === firstOpen ? '▶' : (i + 1);
    html += `<div class="node-wrap ${i === firstOpen ? 'has-lbl' : ''}" style="transform:translateX(${off}px)">
      <button class="node ${state} ${n.kind}" data-act="node" data-n="${i}">${state === 'lock' && n.kind === 'learn' ? `<small>${ico}</small>` : ico}</button>
      <div class="stars">${done ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : ''}</div>
      ${i === firstOpen ? '<div class="node-lbl">Начать</div>' : ''}
    </div>`;
  });
  const doneN = nodes.filter(n => nodeDone(deck, n)).length;
  const nx = doneN === nodes.length ? nextDeckAfter(deck) : null;
  const pos = langDecks().filter(x => x.cards.length >= 3);
  return `${hdr('Уроки', { root: true })}
  <div class="pad">
    ${langBar()}${trackSeg()}
    ${journeyStrip()}
    ${journeyOn() && histOf(curLang()).length ? `<button class="chip big hchip" data-act="history" data-l="${curLang()}">📜 Карта истории · ${histOpen(curLang())}/${histOf(curLang()).length}</button>` : ''}
    <button class="card path-head" data-act="pick-deck"><div class="cta-ico">${esc(deck.emoji || '📘')}</div><div class="cta-body"><div class="cta-t">${deck.level ? `<span class="lvl-tag">${esc(deck.level)}</span> ` : ''}${esc(deck.title)}</div>
      <div class="cta-s">${journeyOn() && cityOf(deck) ? `📍 ${esc(cityOf(deck).n)} · ` : ''}${doneN} из ${nodes.length} уроков · ${nWords(deck.cards.length)} · набор ${pos.indexOf(deck) + 1} из ${pos.length}</div><div class="pbar sm"><i style="width:${doneN / nodes.length * 100}%"></i></div></div><span class="lnk">Сменить</span></button>
    <p class="hint">Курс идёт от A0 к C2: пройдите уроки набора — и переходите к следующему. Каждый урок знакомит с ${db.settings.lessonSize} словами и закрепляет их 7 видами упражнений.</p>
    <div class="path">${html}</div>
    ${nx ? `<div class="card cta"><div class="cta-ico">${esc(nx.emoji || '📘')}</div><div class="cta-body"><div class="cta-t">Набор пройден! Дальше:</div><div class="cta-s">${esc(nx.level)} · ${esc(nx.title)}</div></div><button class="btn" data-act="set-active" data-id="${esc(nx.id)}">Перейти</button></div>` : ''}
  </div>`;
};
/* ───────────────────────── Путешествия ─────────────────────────
 * Курс языка — это путешествие по стране: каждый встроенный набор — город.
 * Итальянский: от малоизвестных борго до Рима. Английский: по США до Вашингтона.
 * Украинский: по городам и сёлам Украины до Киева.
 * Города идут от малоизвестных к самым красивым, последний набор — столица.
 * Набор «покорён», когда пройдены все его уроки и экзамен; тогда открывается
 * открытка: фото города (из Википедии) и интересный факт на языке курса. */
const JOURNEYS = {
  it: { data: window.MNEMO_ITALY, flag: '🇮🇹', title: 'Путешествие в Рим', goal: 'Рим', goalTo: 'Рима', wiki: 'it', voice: 'it-IT', thanks: 'Grazie!', bravo: 'Complimenti!', what: 'по Италии' },
  uk: { data: window.MNEMO_UKRAINE, flag: '🇺🇦', title: 'Дорога в Киев', goal: 'Киев', goalTo: 'Киева', wiki: 'uk', voice: 'uk-UA', thanks: 'Дякую!', bravo: 'Вітаю!', what: 'по Украине' },
  de: { data: window.MNEMO_GERMANY, flag: '🇩🇪', title: 'Дорога в Берлин', goal: 'Берлин', goalTo: 'Берлина', wiki: 'de', voice: 'de-DE', thanks: 'Danke!', bravo: 'Herzlichen Glückwunsch!', what: 'по Германии' },
  en: { data: window.MNEMO_USA, flag: '🇺🇸', title: 'Дорога в Вашингтон', goal: 'Вашингтон', goalTo: 'Вашингтона', wiki: 'en', voice: 'en-US', thanks: 'Thank you!', bravo: 'Congratulations!', what: 'по США' },
};
// Звания: за каждый покорённый город — звание; чем дальше по пути, тем выше. [звание, перевод]
const RANKS = {
  it: [['Mendicante', 'нищий'], ['Vagabondo', 'бродяга'], ['Garzone', 'мальчик на побегушках'], ['Contadino', 'крестьянин'], ['Pastore', 'пастух'],
    ['Pescatore', 'рыбак'], ['Apprendista', 'подмастерье'], ['Artigiano', 'ремесленник'], ['Bottegaio', 'лавочник'], ['Mercante', 'купец'],
    ['Banchiere', 'банкир'], ['Notaio', 'нотариус'], ['Scudiero', 'оруженосец'], ['Cavaliere', 'рыцарь'], ['Condottiero', 'кондотьер'],
    ['Podestà', 'подеста, градоначальник'], ['Gonfaloniere', 'гонфалоньер'], ['Signore', 'синьор, правитель города'], ['Barone', 'барон'], ['Visconte', 'виконт'],
    ['Conte', 'граф'], ['Marchese', 'маркиз'], ['Duca', 'герцог'], ['Granduca', 'великий герцог'], ['Doge', 'дож'],
    ['Principe', 'князь'], ['Re', 'король'], ['Cesare', 'Цезарь'], ['Imperatore', 'император']],
  en: [['Hobo', 'бродяга'], ['Drifter', 'скиталец'], ['Dishwasher', 'посудомойщик'], ['Farmhand', 'батрак'], ['Cowboy', 'ковбой'],
    ['Gold Prospector', 'золотоискатель'], ['Trucker', 'дальнобойщик'], ['Shopkeeper', 'лавочник'], ['Deputy Sheriff', 'помощник шерифа'], ['Sheriff', 'шериф'],
    ['Small-Town Mayor', 'мэр городка'], ['Tycoon', 'магнат'], ['Millionaire', 'миллионер'], ['City Council Member', 'член городского совета'], ['Mayor', 'мэр'],
    ['State Senator', 'сенатор штата'], ['Congressman', 'конгрессмен'], ['Governor', 'губернатор'], ['U.S. Senator', 'сенатор США'], ['Speaker of the House', 'спикер Палаты представителей'],
    ['Secretary of State', 'госсекретарь'], ['Vice President', 'вице-президент'], ['President', 'президент']],
  uk: [['Жебрак', 'нищий'], ['Волоцюга', 'бродяга'], ['Наймит', 'батрак'], ['Селянин', 'крестьянин'], ['Чумак', 'чумак'],
    ['Ремісник', 'ремесленник'], ['Купець', 'купец'], ['Козак', 'казак'], ['Джура', 'джура, оруженосец'], ['Десятник', 'десятник'],
    ['Курінний отаман', 'куренной атаман'], ['Осавул', 'есаул'], ['Сотник', 'сотник'], ['Хорунжий', 'хорунжий'], ['Полковник', 'полковник'],
    ['Генеральний писар', 'генеральный писарь'], ['Генеральний суддя', 'генеральный судья'], ['Кошовий отаман', 'кошевой атаман'], ['Гетьман', 'гетман'], ['Князь', 'князь'],
    ['Великий князь київський', 'великий князь киевский']],
  de: [['Bettler', 'нищий'], ['Landstreicher', 'бродяга'], ['Tagelöhner', 'подёнщик'], ['Knecht', 'батрак'], ['Bauer', 'крестьянин'],
    ['Lehrling', 'ученик ремесленника'], ['Geselle', 'подмастерье'], ['Handwerksmeister', 'мастер цеха'], ['Krämer', 'лавочник'], ['Kaufmann', 'купец'],
    ['Hansekaufmann', 'ганзейский купец'], ['Ratsherr', 'член городского совета'], ['Bürgermeister', 'бургомистр'], ['Knappe', 'оруженосец'], ['Ritter', 'рыцарь'],
    ['Vogt', 'фогт, наместник'], ['Freiherr', 'барон'], ['Graf', 'граф'], ['Landgraf', 'ландграф'], ['Markgraf', 'маркграф'],
    ['Pfalzgraf', 'пфальцграф'], ['Herzog', 'герцог'], ['Kurfürst', 'курфюрст'], ['König', 'король'], ['Kaiser', 'император']],
};
// Картинка звания: эмодзи (работает без интернета) и статья английской Википедии для иллюстрации.
const RANK_ART = {
  it: [['🥣', 'Begging'], ['🎒', 'Vagrancy'], ['🧺', 'Errand boy'], ['🌾', 'Peasant'], ['🐑', 'Shepherd'], ['🎣', 'Fisherman'], ['🔨', 'Apprenticeship'],
    ['🏺', 'Artisan'], ['🧀', 'Shopkeeper'], ['⚖️', 'Merchant'], ['🏦', 'Banker'], ['📜', 'Notary'], ['🛡️', 'Squire'], ['⚔️', 'Knight'], ['🐎', 'Condottieri'],
    ['🏛️', 'Podestà'], ['🚩', 'Gonfaloniere'], ['🏰', 'Signoria'], ['🎖️', 'Baron'], ['🦅', 'Viscount'], ['🍷', 'Count'], ['🎩', 'Marquess'], ['🦁', 'Duke'],
    ['💎', 'Grand duke'], ['⛵', 'Doge of Venice'], ['🤴', 'Prince'], ['👑', 'King'], ['🌿', 'Caesar (title)'], ['🏛', 'Roman emperor']],
  en: [['🎒', 'Hobo'], ['🚶', 'Drifter (person)'], ['🍽️', 'Dishwasher (occupation)'], ['🌽', 'Farmworker'], ['🤠', 'Cowboy'], ['⛏️', 'Prospecting'], ['🚚', 'Truck driver'],
    ['🏪', 'Shopkeeper'], ['⭐', 'Deputy sheriff'], ['🌟', 'Sheriffs in the United States'], ['🏘️', 'Mayor'], ['🛢️', 'Business magnate'], ['💰', 'Millionaire'], ['🗳️', 'City council'],
    ['🏙️', 'Mayor'], ['📜', 'State legislature (United States)'], ['🏛️', 'United States House of Representatives'], ['🏢', 'Governor (United States)'], ['🦅', 'United States Senate'],
    ['🔨', 'Speaker of the United States House of Representatives'], ['🌐', 'United States Secretary of State'], ['🎖️', 'Vice President of the United States'], ['🇺🇸', 'President of the United States']],
  uk: [['🥣', 'Begging'], ['🎒', 'Vagrancy'], ['🌾', 'Day labourer'], ['🧑‍🌾', 'Peasant'], ['🐂', 'Chumaks'], ['🔨', 'Artisan'], ['🧺', 'Merchant'], ['🐎', 'Zaporozhian Cossacks'],
    ['🛡️', 'Dzhura'], ['🔟', 'Cossack ranks'], ['🏕️', 'Kurin'], ['📯', 'Yesaul'], ['⚔️', 'Sotnik'], ['🚩', 'Khorunzhy'], ['🎖️', 'Polkovnyk'], ['✒️', 'General Military Chancellery'],
    ['⚖️', 'Cossack Hetmanate'], ['🏹', 'Kosh otaman'], ['🏵️', 'Hetman'], ['👑', 'Kniaz'], ['🔱', 'Grand Prince of Kiev']],
  de: [['🥣', 'Begging'], ['🎒', 'Vagrancy'], ['🌾', 'Day labourer'], ['🐄', 'Farmworker'], ['🧑‍🌾', 'Peasant'], ['🪚', 'Apprenticeship'], ['🧳', 'Journeyman years'],
    ['🔨', 'Master craftsman'], ['🧺', 'Shopkeeper'], ['⚖️', 'Merchant'], ['⛵', 'Hanseatic League'], ['📜', 'City council'], ['🏛️', 'Mayor'], ['🛡️', 'Squire'],
    ['⚔️', 'Knight'], ['🏰', 'Vogt'], ['🎖️', 'Freiherr'], ['🍷', 'Count'], ['🌲', 'Landgrave'], ['🗺️', 'Margrave'], ['🍇', 'Count palatine'], ['🦁', 'Duke'],
    ['🗳️', 'Prince-elector'], ['👑', 'King'], ['🦅', 'German Emperor']],
};
const rankTier = (k, of) => (k >= of - 1 ? 'top' : k / of < 0.25 ? 'bronze' : k / of < 0.5 ? 'silver' : k / of < 0.75 ? 'gold' : 'royal');
// Значок звания; big — с иллюстрацией из Википедии поверх эмодзи (если загрузится).
function rankBadge(r, lang, big) {
  const a = (RANK_ART[lang] || [])[r.k] || ['🎖', ''];
  return `<span class="rbadge ${rankTier(r.k, r.of)} ${big ? 'big' : ''}"${big && a[1] ? ` data-photo="${esc(['en', a[1], a[1], '', ''].join('|'))}"` : ''}><i>${a[0]}</i></span>`;
}
// Лестница всех званий курса.
function rankLadder(lang, cur) {
  const L = RANKS[lang] || [];
  return `<div class="rladder">${L.map(([t, ru], k) => { const r = { k, of: L.length }; return `<div class="rstep ${cur && k <= cur.k ? 'got' : ''} ${cur && k === cur.k ? 'now' : ''}">${rankBadge(r, lang)}<b>${esc(t)}</b><small>${esc(ru.toLowerCase() === t.toLowerCase() ? '' : ru)}</small></div>`; }).join('')}</div>`;
}
// Звание за город с номером i; пишется на языке курса: «Conte di Lucca», «Sheriff of Regent», «Сотник · Глодоси».
function rankOf(i, lang) {
  const J = jour(lang), L = RANKS[lang];
  if (!J || !L || i < 0) return null;
  const M = J.data.cities.length, c = J.data.cities[i];
  const k = i >= M - 1 ? L.length - 1 : Math.min(L.length - 2, Math.floor(i * (L.length - 1) / Math.max(1, M - 1)));
  const [t, ru0] = L[k];
  const ru = ru0.toLowerCase() === t.toLowerCase() ? '' : ru0; // «Сотник — сотник» не повторяем
  let full;
  if (lang === 'it') full = `${t} ${/^[aeiouAEIOU]/.test(c.n) ? "d'" : 'di '}${c.n}`;
  else if (lang === 'en') full = i >= M - 1 ? 'President of the United States' : `${t} ${k < 9 ? 'from' : 'of'} ${c.n}`; // «Hobo from…», но «Sheriff of…»
  else if (lang === 'de') full = i >= M - 1 ? 'Deutscher Kaiser' : `${t} ${k < 11 ? 'aus' : 'von'} ${c.n}`; // «Bettler aus…», «Graf von…»
  else full = i >= M - 1 ? 'Великий князь київський' : `${t} · ${c.n}`;
  return { t, ru, full, k, of: L.length };
}
// Высшее звание из покорённых городов.
function topRank(st) {
  const best = st.wonIdx.length ? Math.max(...st.wonIdx) : -1;
  return best < 0 ? null : rankOf(best, st.lang);
}
// Ссылка на город в Google Картах.
const MAP_COUNTRY = { it: 'Italia', en: 'USA', uk: 'Україна', de: 'Deutschland' };
const mapsUrl = (c, lang) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.n}, ${c.r}, ${MAP_COUNTRY[lang] || ''}`)}`;
const jour = lang => { const J = JOURNEYS[lang]; return J && J.data && J.data.cities.length ? J : null; };
const journeyOn = () => !!jour(curLang());
const factOf = c => c.it || c.en || c.uk || c.de || c.f || '';
const jIdx = {};
function journeyList(lang) {
  const J = jour(lang);
  if (!J) return [];
  let x = jIdx[lang];
  if (!x || x.decks !== DECKS) {
    const list = DECKS.filter(d => d.lang === lang && d.builtin && d.cards.length >= 3);
    const byName = x ? x.byName : new Map(J.data.cities.map((c, i) => [c.n, i]));
    x = jIdx[lang] = { decks: DECKS, list, pos: new Map(list.map((d, i) => [d.id, i])), byName };
  }
  return x.list;
}
// Номер города для набора: покорённый набор хранит свой город, остальные
// распределяются равномерно от первого города списка до столицы.
function cityIdx(d) {
  const J = d && jour(d.lang);
  if (!J) return -1;
  const list = journeyList(d.lang), x = jIdx[d.lang];
  const w = db.won[d.id];
  if (w && x.byName.has(w.c)) return x.byName.get(w.c);
  const i = x.pos.get(d.id);
  if (i === undefined) return -1;
  const M = J.data.cities.length, n = list.length;
  return n <= 1 ? M - 1 : Math.min(M - 1, Math.round(i * (M - 1) / (n - 1)));
}
const cityOf = d => { const i = cityIdx(d); return i < 0 ? null : jour(d.lang).data.cities[i]; };
// Отмечаем покорённые наборы (в том числе пройденные до появления путешествия).
function syncWon(lang) {
  if (!jour(lang)) return;
  let changed = false;
  for (const d of journeyList(lang)) {
    if (db.won[d.id] || !deckDone(d)) continue;
    db.won[d.id] = { c: cityOf(d).n, at: now() };
    changed = true;
  }
  if (changed) saveSoon();
}
function journeyState(lang) {
  syncWon(lang);
  const list = journeyList(lang), pos = jIdx[lang].pos;
  const won = Object.entries(db.won).filter(([id]) => pos.has(id)).sort((a, b) => a[1].at - b[1].at);
  const wonIdx = won.map(([id]) => cityIdx(deckById(id)));
  const ad = activeDeck();
  const curDeck = ad && ad.lang === lang && pos.has(ad.id) && !db.won[ad.id] ? ad : list.find(d => !db.won[d.id]) || null;
  return { lang, J: jour(lang), list, won, wonIdx, wonSet: new Set(wonIdx), curDeck, cur: curDeck ? cityIdx(curDeck) : -1 };
}
function journeyMap(st, big) {
  const D = st.J.data, C = D.cities, fin = C.length - 1;
  // линия маршрута — только последние переезды, иначе она перечёркивает всю карту
  const route = [...st.wonIdx.slice(-6), ...(st.cur >= 0 ? [st.cur] : [])].map(i => `${C[i].x},${C[i].y}`).join(' ');
  const s = D.w / 360; // размер точек относительно ширины карты
  // сначала «впереди», поверх — покорённые, чтобы их было легко нажать
  const order = [...C.keys()].sort((a, b) => st.wonSet.has(a) - st.wonSet.has(b));
  const dots = order.map(i => {
    const c = C[i];
    if (i === fin) return '';
    const k = st.wonSet.has(i) ? 'won' : i === st.cur ? '' : 'todo';
    if (!k) return '';
    return `<circle class="jd ${k}" cx="${c.x}" cy="${c.y}" r="${((k === 'won' ? 3.4 : 2) * s).toFixed(1)}"${big && k === 'won' ? ` data-act="postcard" data-l="${st.lang}" data-i="${i}"` : ''}/>`;
  }).join('');
  const cur = st.cur >= 0 && st.cur !== fin ? `<circle class="jd-pulse" cx="${C[st.cur].x}" cy="${C[st.cur].y}" r="${(6 * s).toFixed(1)}"/><circle class="jd cur" cx="${C[st.cur].x}" cy="${C[st.cur].y}" r="${(4.5 * s).toFixed(1)}"${big ? ` data-act="postcard" data-l="${st.lang}" data-i="${st.cur}"` : ''}/>` : '';
  const F = C[fin];
  const finCls = st.wonSet.has(fin) ? 'won' : st.cur === fin ? 'cur' : '';
  return `<svg class="italy ${big ? 'big' : ''}" viewBox="0 0 ${D.w} ${D.h}" role="img" aria-label="Карта ${st.J.what}" style="--s:${s.toFixed(2)}">
    ${D.regions.map(([n, d]) => `<path class="reg" d="${d}"><title>${esc(n)}</title></path>`).join('')}
    ${route.includes(' ') ? `<polyline class="jroute" points="${route}"/>` : ''}
    ${dots}${cur}
    ${big ? `<g class="jlbls">${[...st.wonSet, st.cur].filter(i => i >= 0 && i !== fin).map(i => `<text class="jlbl" x="${C[i].x}" y="${C[i].y}" data-fs="${(5 * s).toFixed(1)}">${esc(C[i].n)}</text>`).join('')}</g>` : ''}
    <g class="rome ${finCls}"${big ? ` data-act="postcard" data-l="${st.lang}" data-i="${fin}"` : ''}><circle cx="${F.x}" cy="${F.y}" r="${(7 * s).toFixed(1)}"/><text x="${F.x}" y="${(F.y + 3.6 * s).toFixed(1)}" text-anchor="middle" font-size="${(9 * s).toFixed(1)}">★</text></g>
  </svg>`;
}
function journeyStrip() {
  if (!journeyOn()) return '';
  const st = journeyState(curLang());
  const C = st.J.data.cities, n = st.list.length, w = st.won.length;
  const c = st.cur >= 0 ? C[st.cur] : null;
  return `<button class="card jstrip" data-act="journey">
    <div class="js-b"><div class="js-t">${st.J.flag} ${st.J.title}</div>
      ${c ? `<div class="js-c">📍 ${esc(c.n)}<small>${esc(c.r)}</small></div>` : `<div class="js-c">🏛 ${st.J.goal} покорён!</div>`}
      <div class="js-s">Покорено ${w} из ${n} городов</div>
      ${(() => { const r = topRank(st); return r ? `<div class="js-r">${rankBadge(r, st.lang)} ${esc(r.t)}${r.ru ? ` <small>${esc(r.ru)}</small>` : ''}</div>` : ''; })()}
      <div class="pbar sm"><i style="width:${n ? w / n * 100 : 0}%"></i></div></div>
    <div class="js-map ${st.lang}">${journeyMap(st, false)}</div>
  </button>`;
}
screens.journey = c0 => {
  const lang = c0.lang || curLang();
  if (!jour(lang)) return hdr('Путешествие') + '<p class="empty">Карта недоступна</p>';
  const st = journeyState(lang), J = st.J;
  const C = J.data.cities, n = st.list.length, w = st.won.length;
  const c = st.cur >= 0 ? C[st.cur] : null;
  const cards = [...st.won].reverse().map(([id]) => {
    const i = cityIdx(deckById(id));
    return `<button class="pc" data-act="postcard" data-l="${lang}" data-i="${i}"><span class="pc-img" data-photo="${esc([J.wiki, C[i].w, C[i].n, C[i].r, C[i].p || ''].join('|'))}"></span><b>${esc(C[i].n)}</b><small>${esc(C[i].r)}</small></button>`;
  }).join('');
  return `${hdr(J.title)}<div class="pad">
    ${histOf(lang).length ? `<button class="btn ghost wide hbtn" data-act="history" data-l="${lang}">📜 Карта истории · открыто ${histOpen(lang)} из ${histOf(lang).length}</button>` : ''}
    <div class="jmap" id="jmap">${journeyMap(st, true)}
      <div class="jzoom"><button class="ib" data-z="in" aria-label="Приблизить">＋</button><button class="ib" data-z="out" aria-label="Отдалить">−</button><button class="ib" data-z="reset" aria-label="Вся карта">⟲</button></div>
      <div class="jhint">Двумя пальцами — приблизить</div></div>
    <div class="legend center"><span><i class="lvl-dot l4"></i>покорено ${w}</span><span><i class="lvl-dot jcur"></i>сейчас</span><span><i class="lvl-dot l0"></i>впереди ${n - w}</span><span>★ ${J.goal}</span></div>
    <div class="pbar"><i style="width:${n ? w / n * 100 : 0}%"></i></div>
    ${(() => { const r = topRank(st), nx = c ? rankOf(st.cur, lang) : null;
      return `<div class="card rank-card">${r ? rankBadge(r, lang, true) : '<div class="rk-e">🎖</div>'}<div class="rk-b"><div class="rk-l">Ваше звание</div>
        <div class="rk-t">${r ? esc(r.full) : 'Пока без звания'}</div><div class="rk-s">${r ? `${r.ru ? esc(r.ru) + ' · ' : ''}ступень ${r.k + 1} из ${r.of}` : 'Покорите первый город — и получите первое звание'}</div>
        ${nx && (!r || nx.k > r.k) ? `<div class="rk-n">Следующее: ${esc(nx.t)}${nx.ru ? ` (${esc(nx.ru)})` : ''} — за ${esc(c.n)}</div>` : ''}</div></div>
        <details class="rk-all"><summary>Все звания (${RANKS[lang].length})</summary>${rankLadder(lang, r)}</details>`; })()}
    ${c ? `<div class="card cta"><div class="cta-ico">📍</div><div class="cta-body"><div class="cta-t">${esc(c.n)} · ${esc(c.r)}</div>
      <div class="cta-s">Набор «${esc(st.curDeck.title)}» (${esc(st.curDeck.level)}). Пройдите все уроки и экзамен — и город покорён.</div></div>
      <button class="btn" data-act="journey-go" data-id="${esc(st.curDeck.id)}">Вперёд</button></div>` : `<div class="card cta"><div class="cta-ico">🏛</div><div class="cta-body"><div class="cta-t">Вы дошли до ${J.goalTo}!</div><div class="cta-s">Все города покорены. ${J.bravo}</div></div></div>`}
    <p class="hint">Каждый набор курса — город. Путь начинается в малоизвестных городках и ведёт ко всё более красивым местам, а финиш — ${J.goal}. За каждый покорённый город вы получаете открытку: фото и интересный факт на изучаемом языке.</p>
    <h2 class="sec">Открытки ${w ? `(${w})` : ''}</h2>
    ${cards ? `<div class="pcs">${cards}</div>` : '<p class="empty">Пока нет открыток. Покорите первый город!</p>'}
    ${extrasList(st)}
  </div>`;
};
after.journey = () => { loadPhotos(); mapZoom($('#jmap')); };
after.done = () => loadPhotos();

// Приближение карты: щипок, колёсико, двойной тап, кнопки; при приближении карту можно двигать.
function mapZoom(box) {
  const svg = box && box.querySelector('svg');
  if (!svg) return;
  const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
  let v = { x: 0, y: 0, w: W, h: H };
  const dots = [...svg.querySelectorAll('circle')].map(c => [c, +c.getAttribute('r')]);
  const lbls = [...svg.querySelectorAll('.jlbl')];
  const star = svg.querySelector('.rome text'), starFs = star ? +star.getAttribute('font-size') : 0;
  let raf = 0;
  const apply = () => {
    raf = 0;
    const z = W / v.w;
    svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    const k = 1 / Math.pow(z, 0.9); // точки почти не растут при приближении
    for (const [c, r] of dots) c.setAttribute('r', (r * k).toFixed(2));
    if (star) star.setAttribute('font-size', (starFs * k).toFixed(2));
    for (const t of lbls) { t.setAttribute('font-size', (+t.dataset.fs / z * 1.6).toFixed(2)); t.setAttribute('dy', (-6 * k * W / 360).toFixed(2)); }
    svg.classList.toggle('zoomed', z > 1.6);
    box.classList.toggle('zin', z > 1.05);
  };
  const set = (nx, ny, nw) => {
    nw = clamp(nw, W / 8, W);
    const nh = nw * H / W;
    v = { x: clamp(nx, 0, W - nw), y: clamp(ny, 0, H - nh), w: nw, h: nh };
    if (!raf) raf = requestAnimationFrame(apply);
  };
  // точка экрана → координаты карты
  const toMap = (cx, cy) => { const r = svg.getBoundingClientRect(); return [v.x + (cx - r.left) / r.width * v.w, v.y + (cy - r.top) / r.height * v.h]; };
  const zoomAt = (cx, cy, f) => { const [mx, my] = toMap(cx, cy); const nw = clamp(v.w / f, W / 8, W); set(mx - (mx - v.x) * nw / v.w, my - (my - v.y) * nw / v.w, nw); };
  const center = () => { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  box.querySelector('.jzoom').addEventListener('click', e => {
    const b = e.target.closest('[data-z]'); if (!b) return;
    e.stopPropagation();
    if (b.dataset.z === 'reset') set(0, 0, W); else zoomAt(...center(), b.dataset.z === 'in' ? 1.8 : 1 / 1.8);
  });
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0025)); }, { passive: false });
  const pts = new Map();
  let start = null, moved = false, lastTap = 0;
  const snap = () => {
    const p = [...pts.values()];
    if (p.length >= 2) {
      const [a, b] = p;
      start = { v: { ...v }, d: Math.hypot(a.x - b.x, a.y - b.y), m: toMap((a.x + b.x) / 2, (a.y + b.y) / 2), c: [(a.x + b.x) / 2, (a.y + b.y) / 2] };
    } else if (p.length === 1) start = { v: { ...v }, p: { ...p[0] } };
  };
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) moved = false; snap(); });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect(), p = [...pts.values()];
    if (p.length >= 2 && start.d) {
      const [a, b] = p;
      const f = Math.hypot(a.x - b.x, a.y - b.y) / start.d;
      const nw = clamp(start.v.w / f, W / 8, W);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      set(start.m[0] - (cx - r.left) / r.width * nw, start.m[1] - (cy - r.top) / r.height * nw * H / W, nw);
      moved = true;
    } else if (p.length === 1 && start.p) {
      const dx = p[0].x - start.p.x, dy = p[0].y - start.p.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved && start.v.w < W) set(start.v.x - dx / r.width * start.v.w, start.v.y - dy / r.height * start.v.h, start.v.w);
    }
  });
  const up = e => {
    pts.delete(e.pointerId); snap();
    if (e.type === 'pointerup' && !moved && pts.size === 0) {
      const t = now();
      if (t - lastTap < 300) { zoomAt(e.clientX, e.clientY, v.w < W / 4 ? 1 / 3 : 2); lastTap = 0; } else lastTap = t;
    }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  // после перетаскивания не открываем открытку
  svg.addEventListener('click', e => {
    if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; return; }
    if (e.target.closest('[data-act]')) return;
    // промах мимо маленькой точки — открываем ближайший покорённый город
    let best = null, bd = 22;
    for (const el of svg.querySelectorAll('[data-act=postcard]')) {
      const r = el.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
      if (d < bd) { bd = d; best = el; }
    }
    if (best) { e.stopPropagation(); postcard(Number(best.dataset.i), best.dataset.l); }
  }, true);
}

// Фото: главное изображение города из Викиданных (P18), запасной вариант — картинка статьи Википедии.
const PHOTO_KEY = 'mnemo.photos2'; // v2: новые правила поиска фото
let photoMap = null;
function photoStore() {
  if (!photoMap) { try { photoMap = JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}'); } catch (e) { photoMap = {}; } }
  return photoMap;
}
const photoWait = {};
// Не больше трёх запросов к Википедии одновременно — иначе на странице открыток она начинает отказывать.
let netBusy = 0;
const netQueue = [];
function getJSON(url) {
  return new Promise((ok, fail) => {
    const run = () => {
      netBusy++;
      fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(ok, fail)
        .finally(() => { netBusy--; const next = netQueue.shift(); if (next) next(); });
    };
    netBusy < 3 ? run() : netQueue.push(run);
  });
}
const COUNTRY = { it: ['Q38', 'Italia'], en: ['Q30', 'United States'], uk: ['Q212', 'Україна'], de: ['Q183', 'Deutschland'] };
// Отбрасываем гербы, флаги, карты и логотипы — нужен снимок города.
const notPhoto = u => {
  if (!u) return true;
  let f = u; try { f = decodeURIComponent(u); } catch (e) {}
  return /\.svg\b/i.test(f) || /coat[_ ]of[_ ]arms|герб|прапор|(^|[\s_/(-])(flag|logo|locator|map)([\s_.)-]|$)|location[_ ]map|карта/i.test(f);
};
// Латиница для украинских названий — так подписаны многие снимки на Commons (Глодоси → Hlodosy).
const UK_LAT = { а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', "'": '', 'ʼ': '' };
const ukLatin = t => t.toLowerCase().split('').map(ch => UK_LAT[ch] ?? ch).join('').replace(/(^|\s|-)(\S)/g, (m, a, b) => a + b.toUpperCase());
// key = «вики|статья|город|регион|статья для фото». Порядок поиска:
// 1) статья из данных; 2) название города; 3) статья о достопримечательности из факта;
// 4) поиск по Википедии «город регион»; 5) снимки на Wikimedia Commons;
// 6) поиск по Викиданным с проверкой страны; 7) английская Википедия;
// 8) другой источник — Openverse (свободные фото с Flickr и др.).
// Каждый шаг возвращает список ссылок; для открытки берём первую, кнопка «Другое фото» листает все.
function photoSteps(key) {
  const [wiki, w, n, r, alt] = key.split('|');
  const region = (r || '').replace(/ область$/, '');
  const regShort = region.replace(/(ська|цька|зька)$/, '').replace(/^Автономна Республіка /, '');
  const latin = wiki === 'uk' ? ukLatin(n) : n;
  const country = COUNTRY[wiki] ? ({ uk: 'Ukraine', de: 'Germany' }[wiki] || COUNTRY[wiki][1]) : '';
  const one = pr => pr.then(u => (u ? [u] : []));
  return [
    () => one(photoFor(wiki, w)),
    () => n && n !== w ? one(photoFor(wiki, n)) : [],
    () => alt ? one(photoFor(wiki, alt)) : [],
    () => searchPhotos(wiki, `${n} ${region}`.trim()),
    () => commonsPhotos(`"${n}" ${wiki === 'uk' ? '' : regShort}`.trim()),
    () => wiki === 'uk' ? commonsPhotos(`"${latin}"`) : [],
    () => one(wikidataSearch(wiki, n)),
    () => wiki !== 'en' ? searchPhotos('en', `${latin} ${country}`.trim()) : [],
    () => openversePhotos(`${latin} ${wiki === 'en' ? region : country}`.trim()),
    () => openversePhotos(latin),
  ];
}
function cityPhoto(key) {
  const st = photoStore();
  if (st[key]) return Promise.resolve(st[key]);
  if (photoWait[key]) return photoWait[key];
  const save = url => { if (url) { st[key] = url; try { localStorage.setItem(PHOTO_KEY, JSON.stringify(st)); } catch (e) {} } return url; };
  let chain = Promise.resolve(null);
  for (const f of photoSteps(key)) chain = chain.then(u => u || Promise.resolve().then(f).then(l => (l && l[0]) || null).catch(() => null));
  return (photoWait[key] = chain.then(save).finally(() => { delete photoWait[key]; }));
}
// Все найденные варианты — для кнопки «Другое фото».
const photoAll = {};
function cityPhotos(key) {
  if (photoAll[key]) return photoAll[key];
  return (photoAll[key] = Promise.all(photoSteps(key).map(f => Promise.resolve().then(f).catch(() => [])))
    .then(ls => [...new Set(ls.flat().filter(Boolean))]));
}
function setCityPhoto(key, url) {
  const st = photoStore();
  if (url) st[key] = url; else delete st[key];
  try { localStorage.setItem(PHOTO_KEY, JSON.stringify(st)); } catch (e) {}
}
const filePath = file => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=800`;
function photoFor(wiki, title) {
  if (!title) return Promise.resolve(null);
  const viaWikidata = () => getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&sites=${wiki}wiki&titles=${encodeURIComponent(title)}&props=claims&format=json&origin=*`)
    .then(j => {
      const e = Object.values(j.entities || {})[0];
      const file = e && e.claims && e.claims.P18 && e.claims.P18[0].mainsnak.datavalue.value;
      return file && !notPhoto(file) ? filePath(file) : null;
    });
  const viaSummary = () => getJSON(`https://${wiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
    .then(j => { const u = (j.originalimage && j.originalimage.source) || (j.thumbnail && j.thumbnail.source) || ''; return notPhoto(u) ? null : (j.thumbnail ? j.thumbnail.source.replace(/\/\d+px-/, '/800px-') : u); });
  return viaWikidata().catch(() => null).then(u => u || viaSummary()).catch(() => null);
}
// Поиск статьи по тексту и её главной картинки (pageimages).
function searchPhotos(wiki, q) {
  if (!q) return Promise.resolve([]);
  return getJSON(`https://${wiki}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=3&prop=pageimages&piprop=thumbnail&pithumbsize=800&format=json&origin=*`)
    .then(j => {
      const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
      return pages.filter(p => p.thumbnail && !notPhoto(p.thumbnail.source)).map(p => p.thumbnail.source);
    });
}
// Поиск снимков на Wikimedia Commons по названию (только растровые фото).
function commonsPhotos(q) {
  if (!q || q === '""') return Promise.resolve([]);
  return getJSON(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrlimit=8&prop=imageinfo&iiprop=url|size&iiurlwidth=800&format=json&origin=*`)
    .then(j => {
      const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
      const out = [];
      for (const p of pages) {
        const ii = p.imageinfo && p.imageinfo[0];
        if (!ii || notPhoto(p.title) || /\.(tiff?|pdf|djvu)$/i.test(p.title) || ii.width < 400 || ii.width < ii.height * 0.6) continue;
        out.push(ii.thumburl || ii.url);
      }
      return out;
    });
}
// Другой источник — Openverse: открытый поиск свободных фотографий (Flickr и др.), без ключа.
function openversePhotos(q) {
  if (!q) return Promise.resolve([]);
  return getJSON(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=12&mature=false`)
    .then(j => (j.results || []).filter(x => !notPhoto(x.title || '') && (!x.width || (x.width >= 400 && x.width >= x.height * 0.6)))
      .map(x => (x.width && x.width > 2400) || !x.url ? x.thumbnail : x.url).filter(Boolean));
}
// Поиск объекта в Викиданных по названию: берём первый из нужной страны с фотографией.
function wikidataSearch(wiki, name) {
  if (!name || !COUNTRY[wiki]) return Promise.resolve(null);
  const lang = ['uk', 'it', 'de'].includes(wiki) ? wiki : 'en';
  return getJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=${lang}&type=item&limit=7&format=json&origin=*`)
    .then(j => {
      const ids = (j.search || []).map(x => x.id);
      if (!ids.length) return null;
      return getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims&format=json&origin=*`).then(e => {
        for (const id of ids) {
          const c = (e.entities[id] || {}).claims || {};
          const country = c.P17 && c.P17.some(x => x.mainsnak.datavalue && x.mainsnak.datavalue.value.id === COUNTRY[wiki][0]);
          const file = c.P18 && c.P18[0].mainsnak.datavalue && c.P18[0].mainsnak.datavalue.value;
          if (country && file && !notPhoto(file)) return filePath(file);
        }
        return null;
      });
    });
}
function loadPhotos() {
  for (const el of $$('[data-photo]')) {
    if (el.dataset.done) continue;
    el.dataset.done = 1;
    cityPhoto(el.dataset.photo).then(url => {
      if (!url) { el.classList.add('none'); return; }
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.alt = '';
      img.onload = () => { el.style.backgroundImage = `url("${url}")`; el.classList.add('ok'); };
      img.onerror = () => el.classList.add('none');
      img.src = url;
    });
  }
}
function postcard(i, lang) {
  const J = jour(lang);
  const c = J && J.data.cities[i];
  if (!c) return;
  syncWon(lang);
  const deck = journeyList(lang).find(d => cityIdx(d) === i);
  const won = deck && db.won[deck.id];
  if (!won) {
    openModal(`<h3>📍 ${esc(c.n)}</h3><p class="desc">${esc(c.r)}</p>
      <p>${deck ? `Чтобы покорить этот город и открыть открытку, пройдите все уроки и экзамен набора <b>«${esc(deck.title)}»</b>.` : 'Этот город ещё впереди.'}</p>
      ${(() => { const r = rankOf(i, lang); return r ? `<p class="hint">🎖 Награда: ${esc(r.full)}${r.ru ? ` — ${esc(r.ru)}` : ''}</p>` : ''; })()}
      <button class="btn ghost wide" data-act="ph-ext" data-u="${esc(mapsUrl(c, lang))}">🗺 Показать на Google Картах</button>
      <div class="row2"><button class="btn ghost" data-act="modal-close">Закрыть</button>${deck ? `<button class="btn" data-act="journey-go" data-id="${esc(deck.id)}">К урокам</button>` : ''}</div>`);
    return;
  }
  const f = factOf(c);
  openModal(`<div class="postcard">
    <div class="pc-photo" data-photo="${esc(photoKeyOf(J, c))}"><span class="pc-stamp">${i === J.data.cities.length - 1 ? '🏛' : '✉️'}</span></div>
    <h3>${esc(c.n)}</h3><p class="desc">${esc(c.r)} · набор «${esc(deck.title)}»</p>
    ${(() => { const r = rankOf(i, lang); return r ? `<div class="pc-rank">${rankBadge(r, lang, true)}<span>${esc(r.full)}${r.ru ? ` <small>— ${esc(r.ru)}</small>` : ''} ${spkBtn(r.full, J.voice)}</span></div>` : ''; })()}
    <div class="pc-fact">${esc(f)} ${spkBtn(f, J.voice)}</div>
    <button class="btn ghost wide pc-map" data-act="ph-ext" data-u="${esc(mapsUrl(c, lang))}">🗺 Показать на Google Картах</button>
    ${(() => { const k = cultureOf(i, lang); return k ? `<div class="pc-cult"><div class="x-l">🏛 Культура страны</div><div>${esc(k.x)} ${spkBtn(k.x, J.voice)}</div><details class="pc-ru"><summary>Перевод</summary>${esc(k.ru)}</details></div>` : ''; })()}
    ${deckExtras(deck)}
    <details class="pc-ru"><summary>Перевод</summary>${esc(c.ru)}</details>
    <div class="pc-src"><span class="hint">Фото: Wikimedia / Openverse</span><button class="lnk" data-act="pc-photo" data-l="${lang}" data-i="${i}">📷 Другое фото</button></div>
    <button class="btn wide" data-act="modal-close">${J.thanks}</button></div>`, 'pc-modal');
  loadPhotos();
}
const photoKeyOf = (J, c) => [J.wiki, c.w, c.n, c.r, c.p || ''].join('|');
// Смена фото: следующий найденный вариант, поиск в Google/Яндекс Картинках, своя ссылка.
function photoSheet(i, lang) {
  const J = jour(lang), c = J.data.cities[i], key = photoKeyOf(J, c);
  const q = encodeURIComponent(`${c.n} ${c.r}`);
  openModal(`<h3>📷 Фото: ${esc(c.n)}</h3>
    <div class="pc-photo" data-photo="${esc(key)}"></div>
    <div class="form">
      <button class="btn wide" data-act="ph-next" data-l="${lang}" data-i="${i}">↻ Следующее найденное фото</button>
      <div class="row2"><button class="btn ghost" data-act="ph-ext" data-u="https://www.google.com/search?tbm=isch&q=${q}">Google Картинки</button>
      <button class="btn ghost" data-act="ph-ext" data-u="https://yandex.ru/images/search?text=${q}">Яндекс Картинки</button></div>
      <p class="hint">Найдите снимок, нажмите на него и удерживайте → «Копировать адрес изображения», затем вставьте ссылку сюда:</p>
      <input id="ph-url" type="url" placeholder="https://…/photo.jpg" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="row2"><button class="btn ghost" data-act="ph-reset" data-l="${lang}" data-i="${i}">Сбросить</button><button class="btn" data-act="ph-save" data-l="${lang}" data-i="${i}">Сохранить ссылку</button></div>
    </div>`);
  loadPhotos();
}
function openExternal(url) {
  if (window.Android && Android.openUrl) { try { Android.openUrl(url); return; } catch (e) {} }
  window.open(url, '_blank', 'noopener');
}
function photoActions() {
  const keyFor = el => { const J = jour(el.dataset.l); return [J, J.data.cities[Number(el.dataset.i)]]; };
  const reopen = el => { closeModal(); postcard(Number(el.dataset.i), el.dataset.l); };
  return {
    'pc-photo': el => photoSheet(Number(el.dataset.i), el.dataset.l),
    'ph-ext': el => openExternal(el.dataset.u),
    'ph-next': el => {
      const [J, c] = keyFor(el), key = photoKeyOf(J, c);
      el.disabled = true; el.textContent = 'Ищу…';
      cityPhotos(key).then(list => {
        const curUrl = photoStore()[key];
        if (!list.length) { toast('Других фото не нашлось — попробуйте Google или Яндекс'); el.disabled = false; el.textContent = '↻ Следующее найденное фото'; return; }
        const next = list[(list.indexOf(curUrl) + 1) % list.length];
        setCityPhoto(key, next);
        const box = $('#modal .pc-photo');
        if (box) { delete box.dataset.done; box.style.backgroundImage = ''; box.classList.remove('ok', 'none'); loadPhotos(); }
        el.disabled = false; el.textContent = `↻ Следующее найденное фото (${list.indexOf(next) + 1}/${list.length})`;
      });
    },
    'ph-save': el => {
      const url = ($('#ph-url')?.value || '').trim();
      if (!/^https?:\/\/\S+$/i.test(url)) { toast('Вставьте ссылку на картинку (начинается с https://)'); return; }
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.onload = () => { const [J, c] = keyFor(el); setCityPhoto(photoKeyOf(J, c), url); toast('Фото сохранено'); reopen(el); };
      img.onerror = () => toast('По этой ссылке не открывается картинка — скопируйте именно «адрес изображения»');
      img.src = url;
    },
    'ph-reset': el => { const [J, c] = keyFor(el); const key = photoKeyOf(J, c); setCityPhoto(key, null); delete photoAll[key]; reopen(el); },
  };
}
// Проверка после урока: если набор только что покорён — возвращаем его город.
function checkWon(deck) {
  if (!jour(deck.lang) || !deck.builtin || db.won[deck.id] || !deckDone(deck)) return null;
  const i = cityIdx(deck);
  if (i < 0) return null;
  db.won[deck.id] = { c: jour(deck.lang).data.cities[i].n, at: now() };
  saveSoon();
  return i;
}
function wonHtml(i, lang) {
  const J = jour(lang), c = J.data.cities[i];
  const last = i === J.data.cities.length - 1;
  return `<div class="card won-card pop"><div class="big-emoji">${last ? '🏛' : '🏰'}</div>
    <h2>${last ? `Вы дошли до ${J.goalTo}!` : 'Город покорён!'}</h2><p class="desc">${esc(c.n)} · ${esc(c.r)}</p>
    ${(() => { const r = rankOf(i, lang); return r ? `<div class="pc-rank">${rankBadge(r, lang, true)}<span>Новое звание: <b>${esc(r.full)}</b>${r.ru ? ` <small>— ${esc(r.ru)}</small>` : ''}</span></div>` : ''; })()}
    <button class="btn wide" data-act="postcard" data-l="${lang}" data-i="${i}">✉️ Открыть открытку</button></div>`;
}

/* ───────── Культура, песни, книги ─────────
 * К каждой открытке — заметка о культуре страны; на каждую 10-ю тему курса — песня;
 * на последнем наборе каждого уровня — книга, которую уже можно прочитать. */
const EXTRAS = window.MNEMO_EXTRAS || {};
const LYRICS = { it: 'testo', en: 'lyrics', uk: 'текст пісні', de: 'Songtext' };
function cultureOf(i, lang) { const E = EXTRAS[lang]; return E && E.culture.length && i >= 0 ? E.culture[i % E.culture.length] : null; }
function songOfDeck(d) {
  const E = EXTRAS[d.lang];
  if (!E || !E.songs.length || !d.builtin || !jour(d.lang)) return null;
  journeyList(d.lang);
  const pos = jIdx[d.lang].pos.get(d.id);
  if (pos === undefined || (pos + 1) % 10) return null;
  const k = (pos + 1) / 10 - 1;
  return E.songs[k] ? { s: E.songs[k], n: k + 1 } : null;
}
function bookOfDeck(d) {
  const E = EXTRAS[d.lang];
  if (!E || !d.builtin || !E.books[d.level] || !jour(d.lang)) return null;
  const same = journeyList(d.lang).filter(x => x.level === d.level);
  return same[same.length - 1] === d ? E.books[d.level] : null;
}
const extBtn = (label, url, cls = 'sm') => `<button class="btn ${cls}" data-act="ph-ext" data-u="${esc(url)}">${label}</button>`;
function songCard(x, lang) {
  const s = x.s, q = `${s.t} ${s.a}`;
  return `<div class="card xcard"><div class="x-ico">🎵</div><div class="x-b"><div class="x-l">Песня этапа ${x.n}</div>
    <div class="x-t">«${esc(s.t)}» — ${esc(s.a)}${s.y ? ` (${s.y})` : ''}</div><div class="x-s">${esc(s.ru)}</div>
    <div class="x-btns">${extBtn('▶ YouTube', `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`)}${extBtn('📝 Текст', `https://www.google.com/search?q=${encodeURIComponent(q + ' ' + (LYRICS[lang] || 'lyrics'))}`, 'sm ghost')}</div></div></div>`;
}
function bookCard(b, level) {
  return `<div class="card xcard book"><div class="x-ico">📚</div><div class="x-b"><div class="x-l">Книга уровня ${esc(level)}</div>
    <div class="x-t">«${esc(b.t)}» — ${esc(b.a)}${b.y ? ` (${b.y})` : ''}</div><div class="x-s">${esc(b.ru)}</div>
    <div class="x-btns">${extBtn('🔎 Найти книгу', `https://www.google.com/search?q=${encodeURIComponent(`«${b.t}» ${b.a}`)}`)}</div></div></div>`;
}
function deckExtras(d) {
  const so = songOfDeck(d), bo = bookOfDeck(d);
  return (so ? songCard(so, d.lang) : '') + (bo ? `<p class="hint">Это последний набор уровня ${esc(d.level)} — после него вы готовы к книге:</p>` + bookCard(bo, d.level) : '');
}
// Награды за покорённый набор — для экрана «Урок пройден».
function extrasWonHtml(d) {
  const so = songOfDeck(d), bo = bookOfDeck(d);
  return (so ? `<h2 class="sec">🎵 Новая песня</h2>${songCard(so, d.lang)}` : '') + (bo ? `<h2 class="sec">📚 Уровень ${esc(d.level)} пройден!</h2>${bookCard(bo, d.level)}` : '');
}
// Все песни и книги пути — для экрана путешествия.
function extrasList(st) {
  const E = EXTRAS[st.lang];
  if (!E) return '';
  const rows = [];
  E.songs.forEach((s, k) => {
    const d = st.list[(k + 1) * 10 - 1];
    if (!d) return;
    const ok = !!db.won[d.id];
    rows.push(`<div class="xrow ${ok ? 'ok' : ''}"><b>${ok ? '🎵' : '🔒'}</b><span>«${esc(s.t)}» — ${esc(s.a)}<small>${ok ? esc(s.ru) : `откроется за набор ${(k + 1) * 10}: «${esc(d.title)}»`}</small></span>
      ${ok ? extBtn('▶', `https://www.youtube.com/results?search_query=${encodeURIComponent(s.t + ' ' + s.a)}`, 'sm ghost') : ''}</div>`);
  });
  const levels = [...new Set(st.list.map(d => d.level))].filter(lv => E.books[lv]);
  const books = levels.map(lv => {
    const same = st.list.filter(d => d.level === lv), last = same[same.length - 1], ok = same.every(d => db.won[d.id]), b = E.books[lv];
    return `<div class="xrow ${ok ? 'ok' : ''}"><b>${ok ? '📚' : '🔒'}</b><span>${esc(lv)} · «${esc(b.t)}» — ${esc(b.a)}<small>${ok ? esc(b.ru) : `после уровня ${esc(lv)} (последний набор — «${esc(last.title)}»)`}</small></span>
      ${extBtn('🔎', `https://www.google.com/search?q=${encodeURIComponent(`«${b.t}» ${b.a}`)}`, 'sm ghost')}</div>`;
  }).join('');
  return `<h2 class="sec">📚 Книги по уровням</h2>${books}<h2 class="sec">🎵 Песни пути — каждая 10-я тема</h2>${rows.join('')}`;
}

/* ───────── Карта истории ─────────
 * 50 станций истории страны по хронологии. Станции открываются по мере покорения городов,
 * тексты усложняются от A2 к C1. Слова из словаря подсвечены: выученные, изучаемые и новые (с переводом по нажатию). */
const HIST_N = 50;
const histOf = lang => (EXTRAS[lang] && EXTRAS[lang].history) || [];
function histOpen(lang) {
  const H = histOf(lang);
  if (!H.length || !jour(lang)) return 0;
  const st = journeyState(lang), N = Math.max(1, st.list.length);
  return Math.min(H.length, 1 + Math.floor(st.won.length * H.length / N));
}
// сколько покорённых городов нужно для станции k
const histNeed = (lang, k) => { const N = journeyList(lang).length, H = histOf(lang).length || HIST_N; return Math.ceil(k * N / H); };
// Словарь языка для подсветки: точное совпадение или общая основа (для склонений и спряжений).
const ARTICLES = /^(il|lo|la|i|gli|le|un|uno|una|the|a|an|to)\s+|^(l|un|dell|dall|nell|sull)'/i;
let histDict = { lang: null, decks: null };
function histDictionary(lang) {
  if (histDict.lang === lang && histDict.decks === DECKS) return histDict;
  const exact = new Map(), pre = new Map();
  for (const c of byLang[lang] || []) {
    const t = c.t.toLowerCase().replace(/\([^)]*\)/g, '').replace(ARTICLES, '').trim();
    if (!t || /\s/.test(t) || t.length < 2) continue;
    if (!exact.has(t)) exact.set(t, c);
    if (t.length >= 4) { const k = t.slice(0, 4); if (!pre.has(k)) pre.set(k, []); pre.get(k).push([t, c]); }
  }
  return (histDict = { lang, decks: DECKS, exact, pre });
}
function histMatch(D, w) {
  const t = w.toLowerCase();
  if (D.exact.has(t)) return D.exact.get(t);
  if (t.length < 4) return null;
  let best = null, bl = 0;
  for (const [term, c] of D.pre.get(t.slice(0, 4)) || []) {
    let l = 0; while (l < term.length && l < t.length && term[l] === t[l]) l++;
    if (l >= Math.max(4, Math.min(term.length, t.length) - 3) && l / term.length >= 0.6 && l > bl) { bl = l; best = c; }
  }
  return best;
}
function histText(lang, text) {
  const D = histDictionary(lang), seen = new Map();
  const html = text.split(/([\p{L}\p{M}'’ʼ-]+)/u).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    const c = histMatch(D, part.replace(/^['’ʼ]+|['’ʼ]+$/g, ''));
    if (!c) return esc(part);
    const lv = level(c.id), cls = lv >= 2 ? 'hk' : lv === 1 ? 'hl' : 'hn';
    seen.set(c.id, lv);
    return `<span class="hw ${cls}" data-act="hist-word" data-id="${esc(c.id)}">${esc(part)}</span>`;
  }).join('');
  const vals = [...seen.values()];
  return { html, total: vals.length, known: vals.filter(v => v >= 2).length, learning: vals.filter(v => v === 1).length };
}
screens.history = c0 => {
  const lang = c0.lang || curLang(), H = histOf(lang), J = jour(lang);
  if (!H.length || !J) return hdr('Карта истории') + '<p class="empty">История пока недоступна</p>';
  const open = histOpen(lang), won = journeyState(lang).won.length;
  return `${hdr(`📜 История ${J.what.replace('по ', '')}`)}<div class="pad">
    <p class="desc">50 станций истории — от древности до наших дней. Новые станции открываются, пока вы покоряете города; тексты становятся сложнее вместе с вами.</p>
    <div class="pbar"><i style="width:${open / H.length * 100}%"></i></div><p class="hint center">Открыто ${open} из ${H.length}</p>
    <div class="htl">${H.map((h, k) => k < open
      ? `<button class="hst" data-act="hist-open" data-l="${lang}" data-k="${k}"><span class="hdot">${h.e}</span><span class="hb"><small>${esc(h.y)}</small><b>${esc(h.t)}</b></span></button>`
      : `<div class="hst lock"><span class="hdot">🔒</span><span class="hb"><small>${esc(h.y)}</small><b>${k === open ? esc(h.t) : '· · ·'}</b><small>откроется после ${histNeed(lang, k)} покорённых городов (сейчас ${won})</small></span></div>`).join('')}</div>
  </div>`;
};
screens.station = c0 => {
  const lang = c0.lang, k = c0.k, H = histOf(lang), h = H[k], J = jour(lang);
  if (!h || k >= histOpen(lang)) return hdr('Станция') + '<p class="empty">Станция ещё закрыта</p>';
  const r = histText(lang, h.x);
  const pct = r.total ? Math.round(r.known / r.total * 100) : 0;
  return `${hdr(`${h.e} ${esc(h.y)}`)}<div class="pad">
    <div class="hnum">Станция ${k + 1} из ${H.length}</div>
    <h1 class="htitle">${esc(h.t)} ${spkBtn(h.t, J.voice)}</h1>
    <div class="card htext">${r.html}</div>
    <div class="row2"><button class="btn ghost" data-act="speak" data-text="${esc(h.x)}" data-lang="${J.voice}">🔊 Слушать</button><button class="btn ghost" data-act="speak-slow" data-text="${esc(h.x)}" data-lang="${J.voice}">🐢 Медленно</button></div>
    <div class="hstat"><div class="pbar"><i style="width:${pct}%"></i></div>
      Вы знаете <b>${r.known}</b> из ${r.total} слов словаря в этом тексте${r.learning ? ` · изучаете ещё ${r.learning}` : ''}</div>
    <div class="legend"><span><i class="hw hk">слово</i> выучено</span><span><i class="hw hl">слово</i> изучаю</span><span><i class="hw hn">слово</i> новое — нажмите</span></div>
    <details class="pc-ru"><summary>Перевод</summary>${esc(h.ru)}</details>
    <div class="row2">${k > 0 ? `<button class="btn ghost" data-act="hist-open" data-l="${lang}" data-k="${k - 1}" data-replace="1">← Раньше</button>` : '<span></span>'}
      ${k + 1 < histOpen(lang) ? `<button class="btn" data-act="hist-open" data-l="${lang}" data-k="${k + 1}" data-replace="1">Дальше →</button>` : '<span></span>'}</div>
  </div>`;
};
// Новая станция истории открылась при покорении набора?
function histNewHtml(d) {
  const H = histOf(d.lang);
  if (!H.length || !jour(d.lang)) return '';
  const st = journeyState(d.lang), N = Math.max(1, st.list.length), w = st.won.length;
  const now = Math.min(H.length, 1 + Math.floor(w * H.length / N)), before = Math.min(H.length, 1 + Math.floor((w - 1) * H.length / N));
  if (now <= before) return '';
  const h = H[now - 1];
  return `<div class="card xcard"><div class="x-ico">📜</div><div class="x-b"><div class="x-l">Открыта станция истории ${now}</div><div class="x-t">${h.e} ${esc(h.y)} · ${esc(h.t)}</div>
    <div class="x-btns"><button class="btn sm" data-act="hist-open" data-l="${d.lang}" data-k="${now - 1}">Читать</button></div></div></div>`;
}

function deckCity(d) {
  if (!jour(d.lang) || !d.builtin) return '';
  const i = cityIdx(d);
  if (i < 0) return '';
  const c = jour(d.lang).data.cities[i];
  if (db.won[d.id] || deckDone(d)) return `<button class="chip big jchip won" data-act="postcard" data-l="${d.lang}" data-i="${i}">🏰 ${esc(c.n)} покорён · ✉️ открытка</button>`;
  const nodes = lessonNodes(d), dn = nodes.filter(n => nodeDone(d, n)).length;
  return `<button class="chip big jchip" data-act="postcard" data-l="${d.lang}" data-i="${i}">📍 ${esc(c.n)} · уроки ${dn}/${nodes.length} — пройдите все и экзамен</button>`;
}
/* ───────────────────────── Грамматика и экзамены уровней ─────────────────────────
 * Параллельная ветка уроков: на каждом уровне темы как в учебнике (теория + 12 упражнений).
 * В конце уровня — экзамен: слова (нужно ≥ 90%), правила и предложения (≥ 80%).
 * Отдельно — «марафон»: все слова уровня с сохранением прогресса. */
const LVS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const gramOf = lang => (window.MNEMO_GRAMMAR || {})[lang] || [];
const gnorm = s => String(s || '').toLowerCase().replace(/[’`ʼ]/g, "'").replace(/[.,!?;:"«»…¿¡()–—]/g, ' ').replace(/\s+/g, ' ').trim();
const gramCheck = (input, acc) => { const n = gnorm(input); return !!n && acc.some(a => gnorm(a) === n); };
// Латиница без диакритики (perche вместо perché) — засчитываем как опечатку; кириллицу (й, ї) не трогаем.
const deAcc = s => s.normalize('NFD').replace(/([a-z])[\u0300-\u036f]+/g, '$1').normalize('NFC');
const gramFix = (input, acc) => { const n = deAcc(gnorm(input)); return n ? acc.find(a => deAcc(gnorm(a)) === n) : undefined; };
// Теория: **жирный**, строки «- » — список, строки «| … |» — таблица (первая строка — заголовок).
function mdLite(x) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const out = [];
  let list = null, table = null, para = [];
  const flush = () => {
    if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; }
    if (list) { out.push(`<ul>${list.map(l => `<li>${inline(l)}</li>`).join('')}</ul>`); list = null; }
    if (table) {
      const rows = table.filter(r => !/^\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      out.push(`<div class="gtable"><table>${rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('')}</table></div>`);
      table = null;
    }
  };
  for (const raw of String(x).split('\n')) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    if (l.startsWith('|')) { if (!table) { flush(); table = []; } table.push(l); continue; }
    if (/^[-•]\s+/.test(l)) { if (!list) { flush(); list = []; } list.push(l.replace(/^[-•]\s+/, '')); continue; }
    if (list || table) flush();
    para.push(l);
  }
  flush();
  return out.join('');
}
const gramEx = q => ({ type: { mc: 'gmc', type: 'gtype', order: 'gorder', tr: 'gtr' }[q.k], q });
function trackSeg() {
  const t = db.settings.track === 'gram' ? 'gram' : 'words';
  return `<div class="seg track"><button class="${t === 'words' ? 'on' : ''}" data-act="set" data-k="track" data-v="words">📗 Слова и города</button><button class="${t === 'gram' ? 'on' : ''}" data-act="set" data-k="track" data-v="gram">📐 Грамматика</button></div>`;
}
const examKey = (lang, lv) => `${lang}:${lv}`;
function examBadge(lang, lv) {
  const e = db.exams[examKey(lang, lv)];
  return e && e.passed ? '✅' : '🎓';
}
function lessonsGram() {
  const lang = curLang(), T = gramOf(lang);
  let h = '';
  for (const lv of LVS) {
    const ts = T.filter(t => t.lv === lv);
    const hasWords = langDecks(lang).some(d => d.builtin && d.level === lv);
    if (!ts.length && !hasWords) continue;
    const done = ts.filter(t => db.gram[t.id]).length;
    h += `<div class="unit"><b>${lv} · ${LEVEL_NAMES[lv]}</b><span>${done}/${ts.length}</span></div>`;
    h += ts.map(t => { const st = db.gram[t.id] || 0; return `<button class="gtop ${st ? 'done' : ''}" data-act="gtopic" data-id="${esc(t.id)}"><b>${t.e || '📘'}</b><span>${esc(t.t)}<small>${st ? '★'.repeat(st) + '☆'.repeat(3 - st) : `${t.q.length} упражнений`}</small></span></button>`; }).join('');
    const e = db.exams[examKey(lang, lv)];
    h += `<button class="gexam ${e && e.passed ? 'ok' : ''}" data-act="exam" data-lv="${lv}"><b>${examBadge(lang, lv)}</b><span>Экзамен уровня ${lv}<small>${e ? `лучший результат: слова ${e.w}% · правила ${e.g ?? '—'}% · предложения ${e.s ?? '—'}%${e.all ? ' · 🏅 все слова' : ''}` : 'слова ≥ 90% · правила и предложения ≥ 80%'}</small></span></button>`;
  }
  return `${hdr('Уроки', { root: true })}<div class="pad">${langBar()}${trackSeg()}
    <p class="hint">Грамматика идёт параллельно словам: на каждом уровне — темы как в учебнике и экзамен в конце.</p>
    ${T.length ? h : '<p class="empty">Грамматика для этого языка загружается…</p>'}</div>`;
}
screens.gtopic = c => {
  const t = gramOf(curLang()).find(x => x.id === c.id) || Object.values(window.MNEMO_GRAMMAR || {}).flat().find(x => x.id === c.id);
  if (!t) return hdr('Тема') + '<p class="empty">Тема не найдена</p>';
  const st = db.gram[t.id] || 0;
  return `${hdr(`${t.e || '📘'} ${esc(t.lv)}`)}<div class="pad">
    <h1 class="htitle">${esc(t.t)}</h1>
    <div class="card gtheory">${mdLite(t.x)}</div>
    ${st ? `<p class="center big-stars sm">${'★'.repeat(st)}<span>${'★'.repeat(3 - st)}</span></p>` : ''}
    <button class="btn wide" data-act="gstart" data-id="${esc(t.id)}">✍️ Упражнения (${t.q.length})</button>
  </div>`;
};
function startGramTopic(id) {
  const all = Object.values(window.MNEMO_GRAMMAR || {}).flat();
  const t = all.find(x => x.id === id);
  if (!t) return;
  let queue = shuffle(t.q).map(gramEx), retry = [], done = 0;
  const total = queue.length;
  startRun({
    kind: 'gram', deckId: null, pool: [], again: () => startGramTopic(id),
    nextEx() {
      if (queue.length) return queue.shift();
      if (retry.length) { queue = retry.map(q => gramEx(q)); retry = []; return { type: 'round', title: 'Работа над ошибками', sub: 'Повторим задания с ошибками.', emoji: '🎯', noGrade: true }; }
      return null;
    },
    onAnswer(ex, ok) { if (!ex.g) return; ok ? done++ : retry.push(ex.g); },
    onOverride(ex) { const i = retry.lastIndexOf(ex.g); if (i >= 0) retry.splice(i, 1); done++; },
    progress() { return done / total; },
    counter() { return `${done}/${total}`; },
    finish() {
      const acc = S.ok + S.bad ? S.ok / (S.ok + S.bad) : 1;
      const stars = acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : 1;
      db.gram[id] = Math.max(db.gram[id] || 0, stars);
      addXp(30); saveSoon();
      const same = all.filter(x => x.lv === t.lv && x.id.split('-')[0] === t.id.split('-')[0]);
      const nx = same[same.indexOf(t) + 1];
      return { title: 'Тема пройдена!', emoji: '📐', stars, bonus: 30, next: nx ? () => { replace('gtopic', { id: nx.id }); } : null };
    },
  });
}
// Детерминированное перемешивание — для марафона, который можно продолжать в другой день.
function seededShuffle(a, seed) {
  a = [...a];
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const levelCards = (lang, lv) => langDecks(lang).filter(d => d.builtin && d.level === lv).flatMap(d => d.cards);
screens.exam = c => {
  const lang = curLang(), lv = c.lv, key = examKey(lang, lv), e = db.exams[key];
  const words = levelCards(lang, lv), T = gramOf(lang).filter(t => t.lv === lv);
  const gq = T.flatMap(t => t.q.filter(q => q.k !== 'tr')).length, sq = T.flatMap(t => t.q.filter(q => q.k === 'tr')).length;
  const m = db.marathon[key];
  return `${hdr(`🎓 Экзамен ${lv}`)}<div class="pad">
    <p class="desc">Итоговый экзамен уровня ${lv} (${LEVEL_NAMES[lv]}). Три части:</p>
    <div class="card"><ol class="exparts">
      <li><b>Слова</b> — напишите на ${LANGS[lang].name.toLowerCase().replace(/ий$/, 'ом')} ${Math.min(100, words.length)} слов уровня по переводу. Нужно <b>≥ 90%</b>.</li>
      ${gq ? `<li><b>Правила</b> — ${Math.min(20, gq)} заданий по грамматике уровня. Нужно <b>≥ 80%</b>.</li>` : ''}
      ${sq ? `<li><b>Предложения</b> — переведите ${Math.min(10, sq)} предложений. Нужно <b>≥ 80%</b>.</li>` : ''}
    </ol></div>
    ${e ? `<p class="center">${e.passed ? '✅ Уровень подтверждён' : '❌ Пока не сдан'} · лучший: слова ${e.w}% · правила ${e.g ?? '—'}% · предложения ${e.s ?? '—'}%</p>` : ''}
    <button class="btn wide" data-act="exam-start" data-lv="${lv}">Начать экзамен</button>
    <h2 class="sec">📝 Марафон: все ${words.length} слов уровня</h2>
    <p class="hint">Напишите все слова уровня ${lv} — можно в несколько подходов, прогресс сохраняется. Если верно ≥ 90%, получите медаль 🏅.</p>
    ${m ? `<div class="pbar"><i style="width:${m.i / words.length * 100}%"></i></div><p class="hint center">Пройдено ${m.i} из ${words.length} · верно ${m.i ? Math.round(m.ok / m.i * 100) : 0}%</p>` : ''}
    <button class="btn ghost wide" data-act="marathon" data-lv="${lv}">${m && m.i ? (m.i >= words.length ? 'Пройти заново' : 'Продолжить марафон') : 'Начать марафон'}</button>
    ${e && e.all ? '<p class="center">🏅 Марафон пройден</p>' : ''}
  </div>`;
};
function startExam(lv) {
  const lang = curLang(), key = examKey(lang, lv);
  const words = shuffle(levelCards(lang, lv)).slice(0, 100);
  const T = gramOf(lang).filter(t => t.lv === lv);
  const gram = shuffle(T.flatMap(t => t.q.filter(q => q.k !== 'tr'))).slice(0, 20);
  const sent = shuffle(T.flatMap(t => t.q.filter(q => q.k === 'tr'))).slice(0, 10);
  if (!words.length) { toast('На этом уровне пока нет слов'); return; }
  const queue = [
    { type: 'round', title: `Часть 1 · Слова (${words.length})`, sub: 'Напишите слово на изучаемом языке. Нужно ≥ 90%.', emoji: '✍️', noGrade: true },
    ...words.map(c => ({ type: 'type', c, dir: 'dt', part: 'w' })),
    ...(gram.length ? [{ type: 'round', title: `Часть 2 · Правила (${gram.length})`, sub: 'Задания по грамматике уровня. Нужно ≥ 80%.', emoji: '📐', noGrade: true }, ...gram.map(q => ({ ...gramEx(q), part: 'g' }))] : []),
    ...(sent.length ? [{ type: 'round', title: `Часть 3 · Предложения (${sent.length})`, sub: 'Переведите предложения. Нужно ≥ 80%.', emoji: '🗣', noGrade: true }, ...sent.map(q => ({ ...gramEx(q), part: 's' }))] : []),
  ];
  const res = { w: [0, 0], g: [0, 0], s: [0, 0] };
  let pos = 0;
  startRun({
    kind: 'exam', deckId: null, pool: words, again: () => startExam(lv),
    nextEx() { return queue[pos++] || null; },
    onAnswer(ex, ok) { if (ex.part) res[ex.part][ok ? 0 : 1]++; },
    onOverride(ex) { if (ex.part) { res[ex.part][0]++; res[ex.part][1]--; } },
    progress() { return (pos - 1) / queue.length; },
    counter() { return `${Math.max(0, pos - 1)}/${queue.length}`; },
    finish() {
      const pc = p => (res[p][0] + res[p][1] ? Math.round(res[p][0] / (res[p][0] + res[p][1]) * 100) : null);
      const w = pc('w'), g = pc('g'), s = pc('s');
      const passed = w >= 90 && (g === null || g >= 80) && (s === null || s >= 80);
      const prev = db.exams[key] || {};
      db.exams[key] = { ...prev, w: Math.max(prev.w || 0, w), g: g === null ? prev.g : Math.max(prev.g || 0, g), s: s === null ? prev.s : Math.max(prev.s || 0, s), passed: !!(prev.passed || passed), at: now() };
      if (passed) addXp(300);
      saveSoon();
      const row = (n, v, need) => v === null ? '' : `<div class="xrow ${v >= need ? 'ok' : ''}"><b>${v >= need ? '✅' : '❌'}</b><span>${n}<small>нужно ${need}%</small></span><b>${v}%</b></div>`;
      return { title: passed ? `Уровень ${lv} сдан!` : `Экзамен ${lv} не сдан`, emoji: passed ? '🎓' : '📚', bonus: passed ? 300 : 0,
        extra: `<div class="card">${row('Слова', w, 90)}${row('Правила', g, 80)}${row('Предложения', s, 80)}</div>${passed ? '' : '<p class="hint center">Повторите слова и темы уровня — и попробуйте снова.</p>'}` };
    },
  });
}
function startMarathon(lv) {
  const lang = curLang(), key = examKey(lang, lv);
  const all = levelCards(lang, lv);
  if (!all.length) return;
  let m = db.marathon[key];
  if (!m || m.i >= all.length || m.n !== all.length) m = db.marathon[key] = { seed: (Math.random() * 2 ** 31) | 0, i: 0, ok: 0, n: all.length };
  const order = seededShuffle(all, m.seed);
  startRun({
    kind: 'marathon', deckId: null, pool: all, again: () => startMarathon(lv),
    nextEx() { return m.i < order.length ? { type: 'type', c: order[m.i], dir: 'dt' } : null; },
    onAnswer(ex, ok) { if (!ex.c) return; m.i++; if (ok) m.ok++; saveSoon(); },
    onOverride() { m.ok++; saveSoon(); },
    progress() { return m.i / order.length; },
    counter() { return `${m.i}/${order.length}`; },
    finish() {
      const pct = Math.round(m.ok / order.length * 100);
      if (pct >= 90) { db.exams[key] = { ...(db.exams[key] || { w: 0 }), all: true }; addXp(500); }
      saveSoon();
      return { title: pct >= 90 ? '🏅 Марафон пройден!' : 'Марафон завершён', emoji: pct >= 90 ? '🏅' : '📝', extra: `<p class="center">Верно ${pct}% из ${order.length} слов${pct >= 90 ? '' : ' — нужно 90%'}</p>` };
    },
  });
}

function deckPicker() {
  const ad = activeDeck();
  let h = '';
  for (const [lv, list] of byLevel(langDecks().filter(d => d.cards.length >= 3))) {
    h += `<div class="pick-lv">${esc(lv || 'Мои')} · ${LEVEL_NAMES[lv] || ''}</div>` + list.map(d => {
      const nodes = lessonNodes(d), dn = nodes.filter(n => nodeDone(d, n)).length;
      return `<button class="mrow ${ad && d.id === ad.id ? 'on' : ''}" data-act="set-active" data-id="${esc(d.id)}"><b>${esc(d.emoji || '📘')}</b><span>${esc(d.title)}<small>${nWords(d.cards.length)} · уроков ${dn}/${nodes.length}${dn === nodes.length ? ' ✓' : ''}</small></span></button>`;
    }).join('');
  }
  openModal(`<h3>Выберите набор для уроков</h3>${h}`);
  const on = $('#modal .mrow.on'); if (on) on.scrollIntoView({ block: 'center' });
}
function nodeSheet(deck, i) {
  const n = lessonNodes(deck)[i];
  if (!n) return;
  const kindTxt = n.kind === 'learn' ? 'Новые слова: знакомство и закрепление' : n.kind === 'review' ? 'Повторение всех слов раздела' : 'Экзамен: случайные слова из всего набора';
  const shown = n.kind === 'exam' ? '' : `<div class="words">${n.cards.map(c => `<div class="crow sm">${lvlDot(c.id)}<div class="crow-b"><div class="crow-t">${esc(c.t)}</div><div class="crow-d">${esc(c.d)}</div></div></div>`).join('')}</div>`;
  const stars = nodeStars(deck, n);
  openModal(`<h3>${esc(n.title)}</h3><p class="hint">${kindTxt}${stars ? ` · лучший результат ${'★'.repeat(stars)}` : ''}</p>${shown}
    <button class="btn wide" data-act="lesson-start" data-deck="${esc(deck.id)}" data-n="${i}">${nodeDone(deck, n) ? 'Пройти ещё раз' : 'Начать урок'}</button>`);
}

function clozeOf(c) {
  if (!c.ex) return null;
  const t = c.t.trim();
  if (t.length < 2 || /[—/…]/.test(t)) return null;
  const exl = c.ex.toLowerCase(), tl = t.toLowerCase();
  const isL = ch => !!ch && /[\p{L}\p{N}']/u.test(ch);
  if (t.includes(' ')) {
    const i = exl.indexOf(tl);
    if (i >= 0 && !isL(c.ex[i - 1]) && !isL(c.ex[i + t.length])) return { before: c.ex.slice(0, i), word: c.ex.slice(i, i + t.length), after: c.ex.slice(i + t.length) };
    return null;
  }
  const parts = c.ex.split(/([\p{L}\p{N}']+)/u);
  const stem = tl.slice(0, Math.max(3, tl.length - 2));
  for (let k = 1; k < parts.length; k += 2) {
    const w = parts[k].toLowerCase();
    if (w === tl || (tl.length >= 4 && w.startsWith(stem) && w.length <= tl.length + 3)) {
      return { before: parts.slice(0, k).join(''), word: parts[k], after: parts.slice(k + 1).join('') };
    }
  }
  return null;
}
const letterCount = t => [...t].filter(ch => /[\p{L}\p{N}]/u.test(ch)).length;
function variedEx(c, i) {
  const opts = ['mcRev', 'listen', 'tf'];
  if (letterCount(c.t) <= 16) opts.push('scramble');
  if (clozeOf(c)) opts.push('cloze', 'cloze');
  return { type: opts[(i + rnd(opts.length)) % opts.length], c };
}
function buildLesson(n) {
  const W = n.cards;
  const ex = [];
  if (n.kind === 'learn') {
    W.forEach(c => { ex.push({ type: 'intro', c }); ex.push({ type: 'mc', c, dir: 'td' }); });
    if (W.length >= 3) ex.push({ type: 'match', cards: shuffle(W).slice(0, 5) });
    shuffle(W).forEach((c, i) => ex.push(variedEx(c, i)));
    shuffle(W).slice(0, Math.min(4, W.length)).forEach((c, i) => ex.push({ type: i % 3 === 2 && letterCount(c.t) <= 14 ? 'dict' : 'type', c, dir: 'dt' }));
  } else {
    const pool = n.kind === 'exam' ? shuffle(W).slice(0, 20) : shuffle(W);
    for (let i = 0; i + 3 <= Math.min(pool.length, 10); i += 5) ex.push({ type: 'match', cards: pool.slice(i, i + 5) });
    shuffle(pool).slice(0, 8).forEach((c, i) => ex.push(variedEx(c, i)));
    shuffle(pool).slice(0, 6).forEach((c, i) => ex.push({ type: i % 2 ? 'scramble' : 'type', c, dir: 'dt' }));
    for (let i = ex.length - 1; i > 0; i--) if (ex[i].type === 'scramble' && letterCount(ex[i].c.t) > 16) ex[i].type = 'type';
  }
  return ex;
}

/* ───────────────────────── Движок упражнений ───────────────────────── */
let S = null;

function qa(c, dir) {
  const { fl, bl } = langsOf(c);
  if (dir === 'mix') dir = Math.random() < 0.5 ? 'td' : 'dt';
  return dir === 'dt' ? { q: c.d, a: c.t, ql: bl, al: fl, dir } : { q: c.t, a: c.d, ql: fl, al: bl, dir };
}
function distractors(c, n, field, pool) {
  const seen = new Set([norm(c[field])]);
  const out = [];
  const tryFrom = list => {
    const cands = shuffle(list.filter(x => x.id !== c.id));
    const L = c[field].length;
    cands.sort((a, b) => Math.abs(a[field].length - L) - Math.abs(b[field].length - L) + (Math.random() - 0.5) * 8);
    for (const x of cands) {
      if (out.length >= n) break;
      const k = norm(x[field]);
      if (k && !seen.has(k)) { seen.add(k); out.push(x[field]); }
    }
  };
  tryFrom(pool || []);
  if (out.length < n) {
    const { fl } = langsOf(c);
    tryFrom(allCards().filter(x => langsOf(x).fl === fl));
  }
  return out;
}
function prep(ex) {
  if (ex.ready) return ex;
  ex.ready = true;
  const c = ex.c;
  const pool = S.pool;
  const dir = ex.dir || S.dir || db.settings.dir;
  if (ex.q && ex.type[0] === 'g' && typeof ex.q === 'object') {
    const q = ex.q;
    ex.g = q; ex.q = q.s || q.ru || '';
    if (ex.type === 'gmc') { ex.a = q.o[q.a]; ex.opts = shuffle([...q.o]); }
    else { ex.acc = q.a; ex.a = q.a[0]; }
    if (ex.type === 'gorder') { ex.tiles = shuffle([...q.w]); ex.fill = []; }
    return ex;
  }
  switch (ex.type) {
    case 'mc': case 'mcRev': {
      Object.assign(ex, qa(c, ex.type === 'mcRev' ? 'dt' : dir));
      ex.opts = shuffle([ex.a, ...distractors(c, 3, ex.dir === 'td' ? 'd' : 't', pool)]);
      break;
    }
    case 'listen': {
      Object.assign(ex, qa(c, 'td'));
      ex.opts = shuffle([c.d, ...distractors(c, 3, 'd', pool)]);
      break;
    }
    case 'tf': {
      Object.assign(ex, qa(c, dir));
      const wrong = distractors(c, 1, ex.dir === 'td' ? 'd' : 't', pool)[0];
      ex.truth = !wrong || Math.random() < 0.5;
      ex.shown = ex.truth ? ex.a : wrong;
      break;
    }
    case 'type': Object.assign(ex, qa(c, dir)); ex.hint = 0; break;
    case 'dict': Object.assign(ex, qa(c, 'dt')); ex.hint = 0; break;
    case 'scramble': {
      Object.assign(ex, qa(c, 'dt'));
      const chars = [...c.t];
      ex.chars = chars;
      ex.slots = chars.map((ch, i) => /[\p{L}\p{N}]/u.test(ch) ? i : -1).filter(i => i >= 0);
      let order = shuffle(ex.slots);
      for (let k = 0; k < 5 && ex.slots.length > 1 && order.every((v, i) => chars[v].toLowerCase() === chars[ex.slots[i]].toLowerCase()); k++) order = shuffle(ex.slots);
      ex.tiles = order.map(i => chars[i].toLowerCase()); // без заглавной — иначе видно первую букву
      ex.fill = [];
      break;
    }
    case 'cloze': {
      const z = clozeOf(c);
      if (!z) { ex.type = 'mcRev'; ex.ready = false; return prep(ex); }
      // слово в начале фразы пишется с большой буквы — в вариантах приводим к общему виду,
      // иначе правильный ответ выделяется заглавной буквой
      const low = w => (c.t[0] === c.t[0].toLowerCase() ? w.charAt(0).toLowerCase() + w.slice(1) : w);
      Object.assign(ex, qa(c, 'dt'), { z, a: low(z.word) });
      ex.opts = shuffle([ex.a, ...distractors(c, 3, 't', pool).map(low)]);
      break;
    }
    case 'match': {
      ex.left = shuffle(ex.cards).map(x => ({ id: x.id, text: x.t }));
      ex.right = shuffle(ex.cards).map(x => ({ id: x.id, text: x.d }));
      ex.sel = null; ex.done = []; ex.errors = 0; ex.badIds = [];
      break;
    }
  }
  return ex;
}

function startRun(opts) {
  stopTimers();
  S = Object.assign({ ok: 0, bad: 0, xp: 0, tok: 0, start: now(), mist: new Set(), fb: null, finished: false, dir: db.settings.dir }, opts);
  S.cur = S.nextEx();
  if (!S.cur) { toast('Нечего тренировать'); S = null; return; }
  prep(S.cur);
  go('run');
  autoSpeak(S.cur);
}
function autoSpeak(ex) {
  if (!ex) return;
  if (ex.type === 'listen' || ex.type === 'dict') { setTimeout(() => speak(ex.c.t, langsOf(ex.c).fl), 250); return; }
  if (ex.type === 'intro') { setTimeout(() => speak(ex.c.t, langsOf(ex.c).fl), 250); return; }
  if (db.settings.autoplay && ex.q && ex.ql && ex.type !== 'tf') setTimeout(() => speak(ex.q, ex.ql), 250);
}
function nextEx() {
  if (!S) return;
  S.tok++;
  S.fb = null;
  S.cur = S.nextEx();
  if (!S.cur) { finishRun(); return; }
  prep(S.cur);
  render();
  autoSpeak(S.cur);
}
function answer(ok, extra = {}) {
  if (!S || S.fb) return;
  const ex = S.cur;
  S.fb = { ok, ...extra };
  if (ok) { S.ok++; S.xp += 10; addXp(10); } else { S.bad++; if (ex.c) S.mist.add(ex.c.id); }
  if (ex.c && !ex.noGrade) practice(ex.c.id, ok);
  beep(ok);
  S.onAnswer && S.onAnswer(ex, ok);
  render(true);
  if (!ok && ex.c && ex.type !== 'tf') setTimeout(() => speak(ex.c.t, langsOf(ex.c).fl), 200);
  if (ok && ['mc', 'mcRev', 'listen', 'tf', 'cloze', 'match', 'gmc', 'gorder'].includes(ex.type) && !extra.stay) {
    const tok = S.tok;
    setTimeout(() => { if (S && S.tok === tok && S.fb) nextEx(); }, 850);
  }
}
function overrideAnswer() {
  if (!S || !S.fb || S.fb.ok) return;
  const ex = S.cur;
  S.fb.ok = true; S.fb.over = true;
  S.bad--; S.ok++; S.xp += 10; addXp(10);
  if (ex.c) { S.mist.delete(ex.c.id); practice(ex.c.id, true); }
  S.onOverride && S.onOverride(ex);
  render(true);
}

function exPrompt(ex, label) {
  return `<div class="ex-lbl">${label}</div><div class="ex-q ${ex.q.length > 40 ? 'long' : ''}">${esc(ex.q)} ${spkBtn(ex.q, ex.ql)}</div>`;
}
function optBtns(ex, act) {
  return `<div class="opts">${ex.opts.map((o, i) => {
    let cls = '';
    if (S.fb) { if (o === ex.a) cls = 'good'; else if (i === ex.picked) cls = 'bad'; else cls = 'dim'; }
    return `<button class="opt ${cls}" data-act="${act}" data-i="${i}" ${S.fb ? 'disabled' : ''}><kbd>${i + 1}</kbd>${esc(o)}</button>`;
  }).join('')}</div>`;
}
function hintFor(c) { return c.note ? `<div class="note-h">💡 ${esc(c.note)}</div>` : ''; }
const EX = {
  intro(ex) {
    const c = ex.c, { fl, bl } = langsOf(c);
    return `<div class="ex-lbl">Новое слово</div>
      <div class="intro card">
        <div class="intro-t">${esc(c.t)} ${spkBtn(c.t, fl)} ${spkBtn(c.t, fl, 'slow').replace('data-act="speak"', 'data-act="speak-slow"').replace(I.spk, I.turtle)}</div>
        <div class="intro-d">${esc(c.d)}</div>
        ${c.ex ? `<div class="ex-line">${esc(c.ex)} ${spkBtn(c.ex, fl, 'sm')}<br><span>${esc(c.exT)}</span></div>` : ''}
        ${c.note ? `<div class="note-h">💡 ${esc(c.note)}</div>` : `<button class="lnk" data-act="edit-card" data-id="${esc(c.id)}">＋ Придумать ассоциацию</button>`}
      </div>
      <p class="hint center">Произнесите слово вслух вместе с диктором.</p>
      <div class="ex-foot"><button class="btn wide" data-act="ex-next">Запомнил, дальше</button></div>`;
  },
  mc(ex) {
    return `${exPrompt(ex, ex.dir === 'td' ? 'Выберите перевод' : 'Выберите слово')}${optBtns(ex, 'ex-opt')}
      ${S.fb ? '' : `<div class="ex-foot"><button class="lnk" data-act="ex-dunno">Не знаю</button></div>`}`;
  },
  mcRev(ex) { return EX.mc(ex); },
  listen(ex) {
    return `<div class="ex-lbl">Послушайте и выберите перевод</div>
      <div class="listen-btns"><button class="big-spk" data-act="speak" data-text="${esc(ex.c.t)}" data-lang="${esc(ex.ql)}">${I.spk}</button>
      <button class="big-spk sm" data-act="speak-slow" data-text="${esc(ex.c.t)}" data-lang="${esc(ex.ql)}">${I.turtle}</button></div>
      ${S.fb ? `<div class="ex-q center">${esc(ex.c.t)}</div>` : ''}
      ${optBtns(ex, 'ex-opt')}`;
  },
  tf(ex) {
    const btn = (v, l) => {
      let cls = '';
      if (S.fb) cls = v === ex.truth ? 'good' : ex.picked === v ? 'bad' : 'dim';
      return `<button class="opt tf ${cls}" data-act="ex-tf" data-v="${v ? 1 : 0}" ${S.fb ? 'disabled' : ''}>${l}</button>`;
    };
    return `<div class="ex-lbl">Верно ли переведено?</div>
      <div class="tf-card card"><div class="ex-q">${esc(ex.q)} ${spkBtn(ex.q, ex.ql)}</div><div class="tf-eq">=</div><div class="ex-q alt">${esc(ex.shown)}</div></div>
      <div class="opts two">${btn(false, '✗ Неверно')}${btn(true, '✓ Верно')}</div>`;
  },
  type(ex) {
    const hint = ex.hint ? `<div class="hint center">Подсказка: <b>${esc(ex.a.slice(0, ex.hint))}${ex.hint < ex.a.length ? '…' : ''}</b></div>` : '';
    return `${exPrompt(ex, ex.dir === 'td' ? 'Напишите перевод' : 'Напишите слово')}
      ${hint}
      <input class="ans ${S.fb ? (S.fb.ok ? 'good' : 'bad') : ''}" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Ваш ответ" value="${esc(ex.typed || '')}" ${S.fb ? 'readonly' : 'autofocus'} data-enter="ex-check">
      ${S.fb ? '' : `<div class="ex-foot"><button class="lnk" data-act="ex-hint">Подсказка</button><button class="lnk" data-act="ex-dunno">Не знаю</button><button class="btn" data-act="ex-check">Проверить</button></div>`}`;
  },
  dict(ex) {
    const hint = ex.hint ? `<div class="hint center">Подсказка: <b>${esc(ex.a.slice(0, ex.hint))}…</b></div>` : '';
    return `<div class="ex-lbl">Диктант: напишите услышанное</div>
      <div class="listen-btns"><button class="big-spk" data-act="speak" data-text="${esc(ex.c.t)}" data-lang="${esc(ex.al)}">${I.spk}</button>
      <button class="big-spk sm" data-act="speak-slow" data-text="${esc(ex.c.t)}" data-lang="${esc(ex.al)}">${I.turtle}</button></div>
      ${S.fb || ex.showTr ? `<div class="hint center">${esc(ex.c.d)}</div>` : ''}
      ${hint}
      <input class="ans ${S.fb ? (S.fb.ok ? 'good' : 'bad') : ''}" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Что прозвучало?" value="${esc(ex.typed || '')}" ${S.fb ? 'readonly' : 'autofocus'} data-enter="ex-check">
      ${S.fb ? '' : `<div class="ex-foot"><button class="lnk" data-act="ex-tr">Перевод</button><button class="lnk" data-act="ex-hint">Подсказка</button><button class="btn" data-act="ex-check">Проверить</button></div>`}`;
  },
  scramble(ex) {
    let k = 0;
    const slotHtml = ex.chars.map((ch, i) => {
      if (!ex.slots.includes(i)) return ch === ' ' ? '<span class="gap"></span>' : `<span class="fixed">${esc(ch)}</span>`;
      const ti = ex.fill[k++];
      return ti === undefined ? '<span class="slot"></span>' : `<button class="slot full" data-act="scr-del" data-k="${k - 1}">${esc(ex.tiles[ti])}</button>`;
    }).join('');
    const tiles = ex.tiles.map((ch, i) => `<button class="tile ${ex.fill.includes(i) ? 'used' : ''}" data-act="scr-add" data-i="${i}" ${ex.fill.includes(i) || S.fb ? 'disabled' : ''}>${esc(ch)}</button>`).join('');
    return `${exPrompt(ex, 'Соберите слово из букв')}
      <div class="slots ${S.fb ? (S.fb.ok ? 'good' : 'bad') : ''}">${slotHtml}</div>
      <div class="tiles">${tiles}</div>
      ${S.fb ? '' : `<div class="ex-foot"><button class="lnk" data-act="scr-hint">Подсказка</button><button class="lnk" data-act="scr-clear">Стереть</button><button class="lnk" data-act="ex-dunno">Не знаю</button></div>`}`;
  },
  cloze(ex) {
    const blank = S.fb ? `<b class="${S.fb.ok ? 'good-t' : 'bad-t'}">${esc(ex.z.word)}</b>` : '<span class="blank">_____</span>';
    return `<div class="ex-lbl">Вставьте пропущенное слово</div>
      <div class="cloze card"><div class="cloze-s">${esc(ex.z.before)}${blank}${esc(ex.z.after)}</div><div class="hint">${esc(ex.c.exT || ex.c.d)}</div></div>
      ${optBtns(ex, 'ex-opt')}`;
  },
  match(ex) {
    const col = (arr, side) => arr.map((x, i) => {
      const done = ex.done.includes(x.id);
      const sel = ex.sel && ex.sel.side === side && ex.sel.i === i;
      const bad = ex.flash && ex.flash.some(f => f.side === side && f.i === i);
      return `<button class="mt ${done ? 'done' : ''} ${sel ? 'sel' : ''} ${bad ? 'bad' : ''}" data-act="ex-match" data-side="${side}" data-i="${i}" ${done ? 'disabled' : ''}>${esc(x.text)}</button>`;
    }).join('');
    return `<div class="ex-lbl">Соедините пары</div><div class="mgrid"><div>${col(ex.left, 'L')}</div><div>${col(ex.right, 'R')}</div></div>`;
  },
  gmc(ex) {
    const g = ex.g, blank = S.fb ? `<b class="${S.fb.ok ? 'good-t' : 'bad-t'}">${esc(ex.a)}</b>` : '<span class="blank">___</span>';
    return `<div class="ex-lbl">Выберите верный вариант</div>
      <div class="cloze card"><div class="cloze-s">${esc(g.s).split('___').join(blank)}</div>${g.ru ? `<div class="hint">${esc(g.ru)}</div>` : ''}</div>
      ${optBtns(ex, 'ex-opt')}
      ${S.fb ? '' : '<div class="ex-foot"><button class="lnk" data-act="ex-dunno">Не знаю</button></div>'}`;
  },
  gtype(ex) {
    const g = ex.g;
    return `<div class="ex-lbl">Вставьте пропущенную форму</div>
      <div class="cloze card"><div class="cloze-s">${esc(g.s).replace('___', S.fb ? `<b class="${S.fb.ok ? 'good-t' : 'bad-t'}">${esc(S.fb.ok ? ex.typed : ex.a)}</b>` : '<span class="blank">___</span>')}</div>${g.ru ? `<div class="hint">${esc(g.ru)}</div>` : ''}</div>
      <input class="ans ${S.fb ? (S.fb.ok ? 'good' : 'bad') : ''}" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Пропущенное слово" value="${esc(ex.typed || '')}" ${S.fb ? 'readonly' : 'autofocus'} data-enter="ex-check">
      ${S.fb ? '' : '<div class="ex-foot"><button class="lnk" data-act="ex-dunno">Не знаю</button><button class="btn" data-act="ex-check">Проверить</button></div>'}`;
  },
  gtr(ex) {
    return `<div class="ex-lbl">Переведите предложение</div>
      <div class="ex-q long">${esc(ex.g.ru)}</div>
      <textarea class="ans ${S.fb ? (S.fb.ok ? 'good' : 'bad') : ''}" id="ans" rows="2" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Перевод" ${S.fb ? 'readonly' : 'autofocus'} data-enter="ex-check">${esc(ex.typed || '')}</textarea>
      ${S.fb ? '' : '<div class="ex-foot"><button class="lnk" data-act="ex-dunno">Не знаю</button><button class="btn" data-act="ex-check">Проверить</button></div>'}`;
  },
  gorder(ex) {
    const built = ex.fill.map((ti, k) => `<button class="wtile in" data-act="go-del" data-k="${k}" ${S.fb ? 'disabled' : ''}>${esc(ex.tiles[ti])}</button>`).join('');
    const tiles = ex.tiles.map((w, i) => `<button class="wtile ${ex.fill.includes(i) ? 'used' : ''}" data-act="go-add" data-i="${i}" ${ex.fill.includes(i) || S.fb ? 'disabled' : ''}>${esc(w)}</button>`).join('');
    return `<div class="ex-lbl">Составьте предложение</div>
      ${ex.g.ru ? `<div class="ex-q long">${esc(ex.g.ru)}</div>` : ''}
      <div class="wline ${S.fb ? (S.fb.ok ? 'good' : 'bad') : ''}">${built || '<span class="hint">Нажимайте на слова по порядку</span>'}</div>
      <div class="wtiles">${tiles}</div>
      ${S.fb ? '' : '<div class="ex-foot"><button class="lnk" data-act="scr-clear">Стереть</button><button class="lnk" data-act="ex-dunno">Не знаю</button></div>'}`;
  },
  round(ex) {
    return `<div class="round card">
      <div class="big-emoji">${ex.emoji || '💪'}</div><h2>${esc(ex.title)}</h2><p class="desc">${esc(ex.sub || '')}</p>
      ${ex.html || ''}
      <button class="btn wide" data-act="ex-next">Продолжить</button></div>`;
  },
};
function fbHtml() {
  const ex = S.cur, fb = S.fb;
  if (!fb || ex.type === 'round' || ex.type === 'intro') return '';
  const c = ex.c;
  let body;
  if (fb.ok) {
    body = `<b>${fb.over ? 'Засчитано' : pick(['Верно!', 'Отлично!', 'Так держать!', 'Правильно!', 'Супер!'])}</b>${fb.typo ? `<div>Опечатка — правильно: <b>${esc(ex.a)}</b></div>` : ''}`;
  } else {
    const alt = ex.acc && ex.acc.length > 1 ? `<div class="fb-ex">Также верно: ${ex.acc.slice(1, 4).map(esc).join(' · ')}</div>` : '';
    const full = ex.g && ex.g.s && ex.type !== 'gtr' ? `<div class="fb-ex">${esc(ex.g.s.replace('___', ex.a))}</div>` : '';
    body = `<b>${fb.dunno ? 'Запомните:' : 'Правильный ответ:'}</b><div class="fb-a">${esc(ex.type === 'match' ? 'ошибок: ' + ex.errors : ex.a)}</div>${full}${alt}
      ${c && c.ex && ex.type !== 'cloze' ? `<div class="fb-ex">${esc(c.ex)}</div>` : ''}${c ? hintFor(c) : ''}`;
  }
  const canOver = !fb.ok && !fb.dunno && ['type', 'dict', 'gtype', 'gtr'].includes(ex.type) && ex.typed;
  return `<div class="fb ${fb.ok ? 'ok' : 'no'}"><div class="fb-b">${body}</div>
    <div class="fb-btns">${canOver ? '<button class="lnk" data-act="ex-over">Я был прав</button>' : ''}
    <button class="btn" data-act="ex-next" id="fb-next">Дальше</button></div></div>`;
}
screens.run = () => {
  if (!S) return '';
  const ex = S.cur;
  const pct = clamp(S.progress() * 100, 0, 100);
  return `<div class="run ${S.fb ? 'has-fb' : ''}">
    <div class="run-top"><button class="ib" data-act="back" aria-label="Выйти">${I.close}</button>
      <div class="pbar"><i style="width:${pct}%"></i></div><div class="run-cnt">${S.counter ? S.counter() : ''}</div></div>
    <div class="ex ex-${ex.type}">${EX[ex.type](ex)}</div>
    ${fbHtml()}
  </div>`;
};
after.run = (c, keep) => {
  if (S && S.fb) { const b = $('#fb-next'); if (b && !keep) b.focus(); }
};

function finishRun() {
  if (!S) return;
  S.finished = true;
  const res = S.finish ? S.finish() : {};
  const total = S.ok + S.bad;
  const acc = total ? Math.round(S.ok / total * 100) : 100;
  const mist = [...S.mist].map(id => cardIdx.get(id)?.c).filter(Boolean);
  replace('done', { res: { acc, ok: S.ok, bad: S.bad, xp: S.xp + (res.bonus || 0), time: now() - S.start, mist, title: res.title || 'Готово!', emoji: res.emoji || '🎉', stars: res.stars, extra: res.extra || '', again: S.again, next: res.next, deck: S.deckId } });
}
function fmtTime(ms) { const s = Math.round(ms / 1000); return s < 60 ? `${s} с` : `${Math.floor(s / 60)} мин ${s % 60} с`; }
screens.done = c => {
  const r = c.res;
  return `<div class="pad done">
    <div class="big-emoji pop">${r.emoji}</div>
    <h1 class="center">${esc(r.title)}</h1>
    ${r.stars ? `<div class="big-stars">${'★'.repeat(r.stars)}<span>${'★'.repeat(3 - r.stars)}</span></div>` : ''}
    <div class="stats3">
      <div><b>${r.acc}%</b><span>точность</span></div>
      <div><b>+${r.xp}</b><span>XP</span></div>
      <div><b>${fmtTime(r.time)}</b><span>время</span></div>
    </div>
    ${r.extra}
    ${r.mist.length ? `<h2 class="sec">Над этим стоит поработать</h2>${r.mist.map(cardRow).join('')}` : `<p class="center desc">Без единой ошибки — великолепно!</p>`}
    <div class="done-btns">
      ${r.next ? `<button class="btn wide" data-act="done-next">Следующий урок</button>` : ''}
      ${r.mist.length >= 2 ? `<button class="btn ghost wide" data-act="done-mist">Повторить ошибки</button>` : ''}
      ${r.again ? `<button class="btn ghost wide" data-act="done-again">Ещё раз</button>` : ''}
      <button class="btn ghost wide" data-act="back">Готово</button>
    </div>
  </div>`;
};

/* ───────────────────────── Запуск режимов ───────────────────────── */
function sessionCards(deckId) {
  const d = getDeck(deckId);
  return d ? d.cards : [];
}
function startMode(mode, deckId, cardsOverride) {
  const d = getDeck(deckId) || { id: deckId, title: 'Тренировка', cards: [] };
  let cards = cardsOverride || d.cards;
  if (mode === 'lessons') { setActive(deckId); tab('lessons'); return; }
  if (mode === 'review') return startReview(deckId);
  if (!cards.length) { toast('В наборе нет карточек'); return; }
  const again = () => startMode(mode, deckId, cardsOverride);
  switch (mode) {
    case 'flash': return startFlash(d, cards);
    case 'learn': return startLearn(d, cards, again);
    case 'write': return startQueueMode(d, cards, 'type', 'Письмо', again);
    case 'listen': return startQueueMode(d, cards, 'dict', 'Диктант', again);
    case 'scramble': {
      const ok = cards.filter(c => letterCount(c.t) <= 18);
      if (!ok.length) { toast('Слова в наборе слишком длинные для этого режима'); return; }
      return startQueueMode(d, ok, 'scramble', 'Собери слово', again);
    }
    case 'test': return go('testsetup', { deck: deckId, ids: cardsOverride ? cards.map(c => c.id) : null });
    case 'match': return startMatchGame(d, cards);
    case 'sprint': return startSprint(d, cards);
    case 'cloze': {
      const ok = cards.filter(c => clozeOf(c));
      if (!ok.length) { toast('В этом наборе нет примеров с пропуском слова'); return; }
      return startQueueMode(d, ok, 'cloze', 'Пропуски', again);
    }
    case 'gravity': return startGravity(d, cards);
    case 'audio': return startAudio(d, cards);
  }
}

// Заучивание: каждое слово проходит «выбор ответа» → «письменный ответ», раундами по 7.
function startLearn(d, cards, again) {
  const list = cards.length > 40 ? [...cards].sort((a, b) => level(a.id) - level(b.id)).slice(0, 40) : cards;
  const st = {};
  list.forEach(c => { st[c.id] = level(c.id) >= 3 ? 1 : 0; });
  let round = [], rpos = 0, rn = 0;
  const byId = new Map(list.map(c => [c.id, c]));
  const newRound = () => {
    const left = list.filter(c => st[c.id] < 2);
    left.sort((a, b) => st[b.id] - st[a.id]);
    round = shuffle(left.slice(0, 7)).map(c => c.id);
    rpos = 0; rn++;
  };
  newRound();
  startRun({
    kind: 'learn', deckId: d.id, pool: list, again,
    nextEx() {
      if (rpos < round.length) {
        const c = byId.get(round[rpos++]);
        return st[c.id] === 0 ? { type: 'mc', c } : { type: 'type', c };
      }
      if (list.every(c => st[c.id] >= 2)) return null;
      const doneN = list.filter(c => st[c.id] >= 2).length;
      const html = `<div class="pbar"><i style="width:${doneN / list.length * 100}%"></i></div><p class="hint center">Освоено ${doneN} из ${list.length}</p>
        <div class="words">${round.map(id => byId.get(id)).map(c => `<div class="crow sm"><span class="lstage s${st[c.id]}">${st[c.id] >= 2 ? '✓' : st[c.id] === 1 ? '½' : '·'}</span><div class="crow-b"><div class="crow-t">${esc(c.t)}</div><div class="crow-d">${esc(c.d)}</div></div></div>`).join('')}</div>`;
      newRound();
      return { type: 'round', title: `Раунд ${rn - 1} пройден`, sub: 'Слова, которые ещё не освоены, вернутся в следующем раунде.', emoji: pick(['💪', '🚀', '🌟', '🔥']), html, noGrade: true };
    },
    onAnswer(ex, ok) { if (ex.c && ok) st[ex.c.id]++; },
    onOverride(ex) { if (ex.c) st[ex.c.id]++; },
    progress() { return list.reduce((s, c) => s + Math.min(2, st[c.id]), 0) / (list.length * 2); },
    counter() { return `${list.filter(c => st[c.id] >= 2).length}/${list.length}`; },
    finish() { return { title: 'Всё выучено!', emoji: '🎓', bonus: 0 }; },
  });
}

// Письмо, диктант, собери слово: проход по всем словам, ошибки — повторно в конце.
function startQueueMode(d, cards, type, title, again) {
  let queue = shuffle(cards).slice(0, 40).map(c => ({ type, c }));
  const total = queue.length;
  let retry = [], done = 0, round = 1;
  startRun({
    kind: type, deckId: d.id, pool: d.cards.length >= 4 ? d.cards : cards, again,
    nextEx() {
      if (queue.length) return queue.shift();
      if (retry.length) {
        queue = shuffle(retry).map(c => ({ type, c }));
        retry = [];
        round++;
        return { type: 'round', title: 'Работа над ошибками', sub: `Осталось ${nWords(queue.length)} — попробуем их ещё раз.`, emoji: '🎯', noGrade: true };
      }
      return null;
    },
    onAnswer(ex, ok) { if (!ex.c) return; ok ? done++ : retry.push(ex.c); },
    onOverride(ex) { const i = retry.lastIndexOf(ex.c); if (i >= 0) retry.splice(i, 1); done++; },
    progress() { return done / total; },
    counter() { return `${done}/${total}`; },
    finish() { return { title: `${title}: готово!`, emoji: type === 'dict' ? '👂' : type === 'scramble' ? '🔤' : type === 'cloze' ? '🧷' : '✍️' }; },
  });
}

function startLesson(deckId, n) {
  const deck = deckById(deckId);
  if (!deck) return;
  const nodes = lessonNodes(deck);
  const node = nodes[n];
  if (!node) return;
  setActive(deckId);
  closeModal();
  const queue = buildLesson(node);
  let pos = 0;
  const retried = new Set();
  startRun({
    kind: 'lesson', deckId, pool: deck.cards, dir: 'td', again: () => startLesson(deckId, n),
    nextEx() { return queue[pos++] || null; },
    onAnswer(ex, ok) {
      if (ok || ex.type === 'match' || !ex.c) return;
      const k = ex.c.id + ex.type;
      if (retried.has(k)) return;
      retried.add(k);
      queue.push({ type: ex.type === 'type' || ex.type === 'dict' ? 'type' : 'mc', c: ex.c, dir: ex.dir === 'dt' ? 'dt' : 'td' });
    },
    progress() { return (pos - 1) / queue.length; },
    counter() { return `${Math.max(0, pos - 1)}/${queue.length}`; },
    finish() {
      const total = S.ok + S.bad;
      const acc = total ? S.ok / total : 1;
      const stars = acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : 1;
      const rec = db.lessons[deckId] || (db.lessons[deckId] = {});
      const key = nodeKey(node);
      rec[key] = Math.max(rec[key] || 0, stars);
      const bonus = node.kind === 'exam' ? 100 : node.kind === 'review' ? 40 : 30;
      addXp(bonus);
      saveSoon();
      const city = checkWon(deck);
      return { title: node.kind === 'exam' ? 'Экзамен сдан!' : 'Урок пройден!', emoji: node.kind === 'exam' ? '🏆' : pick(['🎉', '🌟', '🥳', '🎯']), stars, bonus, next: nodes[n + 1] ? () => startLesson(deckId, n + 1) : null, extra: city !== null ? wonHtml(city, deck.lang) + extrasWonHtml(deck) + histNewHtml(deck) : '' };
    },
  });
}

/* ───────────────────────── Повторение (SRS) ───────────────────────── */
let R = null;
function startReview(deckId) {
  const base = deckId === '@due' ? allCards() : sessionCards(deckId);
  let due = dueCards(base).sort((a, b) => db.prog[a.id].due - db.prog[b.id].due);
  const left = Math.max(0, db.settings.newPerDay - dayRec().nw);
  const fresh = deckId === '@due' ? [] : base.filter(c => !db.prog[c.id]?.seen).slice(0, left);
  const queue = [...due.slice(0, 200), ...fresh].map(c => c.id);
  if (!queue.length) {
    const nd = nextDue();
    toast(fresh.length === 0 && left === 0 && deckId !== '@due' ? 'Лимит новых слов на сегодня исчерпан' : `Повторять пока нечего${nd < Infinity ? ' — следующее через ' + fmtIvl(nd - now()) : ''}`);
    return;
  }
  R = { deckId, queue, total: queue.length, done: 0, shown: false, start: now(), cnt: [0, 0, 0, 0], fresh: new Set(fresh.map(c => c.id)), dir: db.settings.dir };
  R.qa = qa(cardIdx.get(queue[0]).c, R.dir);
  go('review');
  if (db.settings.autoplay) speak(R.qa.q, R.qa.ql);
}
screens.review = () => {
  if (!R) return '';
  const id = R.queue[0];
  const c = cardIdx.get(id)?.c;
  if (!c) return '';
  const p = db.prog[id] || { ef: 2.5, ivl: 0, reps: 0 };
  const lbl = q => { const n = nextState(p, q); return q === 0 ? '10 мин' : fmtIvl(n.ivl * DAY); };
  const x = R.qa;
  return `<div class="run review">
    <div class="run-top"><button class="ib" data-act="back" aria-label="Выйти">${I.close}</button>
      <div class="pbar"><i style="width:${R.done / (R.done + R.queue.length) * 100}%"></i></div><div class="run-cnt">${R.queue.length}</div></div>
    <div class="ex">
      <div class="fl-tools">${dirChip(cardIdx.get(id)?.d.lang)}</div>
      <div class="ex-lbl">${R.fresh.has(id) ? '🆕 Новое слово' : `Повторение · ${LEVELS[level(id)]}`}</div>
      <div class="rv card ${R.shown ? 'open' : ''}">
        <div class="ex-q">${esc(x.q)} ${spkBtn(x.q, x.ql)}</div>
        ${R.shown ? `<hr><div class="ex-q alt">${esc(x.a)} ${spkBtn(x.a, x.al)}</div>
          ${c.ex ? `<div class="ex-line">${esc(c.ex)}<br><span>${esc(c.exT)}</span></div>` : ''}${hintFor(c)}` : ''}
      </div>
    </div>
    <div class="rv-foot">${R.shown ? `<div class="grades">
      <button class="g0" data-act="rv-grade" data-q="0"><b>Снова</b><small>${lbl(0)}</small></button>
      <button class="g1" data-act="rv-grade" data-q="1"><b>Трудно</b><small>${lbl(1)}</small></button>
      <button class="g2" data-act="rv-grade" data-q="2"><b>Хорошо</b><small>${lbl(2)}</small></button>
      <button class="g3" data-act="rv-grade" data-q="3"><b>Легко</b><small>${lbl(3)}</small></button></div>`
      : `<button class="btn wide" data-act="rv-show" id="rv-show">Показать ответ</button>`}</div>
  </div>`;
};
function reviewGrade(q) {
  const id = R.queue.shift();
  grade(id, q);
  R.cnt[q]++;
  const d = dayRec();
  q ? d.ok++ : d.bad++;
  if (q > 0) { R.done++; addXp(10); } else { R.queue.splice(Math.min(R.queue.length, 4), 0, id); }
  R.shown = false;
  if (!R.queue.length) {
    const total = R.cnt.reduce((a, b) => a + b, 0);
    replace('done', { res: { acc: total ? Math.round((total - R.cnt[0]) / total * 100) : 100, xp: R.done * 10, time: now() - R.start, mist: [], title: 'Повторение завершено', emoji: '✅',
      extra: `<div class="legend center">Снова ${R.cnt[0]} · Трудно ${R.cnt[1]} · Хорошо ${R.cnt[2]} · Легко ${R.cnt[3]}</div>` } });
    R = null;
    return;
  }
  R.qa = qa(cardIdx.get(R.queue[0]).c, R.dir);
  render();
  if (db.settings.autoplay) speak(R.qa.q, R.qa.ql);
}

/* ───────────────────────── Карточки ───────────────────────── */
let F = null;
function startFlash(d, cards) {
  F = { deckId: d.id, all: cards, cards: [...cards], i: 0, flip: false, know: [], learn: [], hist: [], shuffled: false, auto: false, dir: db.settings.dir };
  F.qa = F.cards.map(c => qa(c, F.dir));
  go('flash');
}
screens.flash = () => {
  if (!F) return '';
  if (F.i >= F.cards.length) {
    return `${hdr('Карточки')}<div class="pad done">
      <div class="big-emoji pop">🃏</div><h1 class="center">Набор пройден</h1>
      <div class="stats3"><div><b class="good-t">${F.know.length}</b><span>знаю</span></div><div><b class="bad-t">${F.learn.length}</b><span>ещё учу</span></div><div><b>${F.cards.length}</b><span>всего</span></div></div>
      <div class="done-btns">
        ${F.learn.length ? `<button class="btn wide" data-act="fl-relearn">Повторить «ещё учу» (${F.learn.length})</button>` : ''}
        <button class="btn ghost wide" data-act="fl-restart">Начать заново</button>
        ${F.learn.length ? `<button class="btn ghost wide" data-act="fl-learnmode">Заучивать трудные</button>` : ''}
        <button class="btn ghost wide" data-act="back">Готово</button></div></div>`;
  }
  const c = F.cards[F.i], x = F.qa[F.i];
  return `<div class="flash">
    <div class="run-top"><button class="ib" data-act="back">${I.close}</button>
      <div class="pbar"><i style="width:${F.i / F.cards.length * 100}%"></i></div><div class="run-cnt">${F.i + 1}/${F.cards.length}</div></div>
    <div class="fl-tools">
      <button class="chip ${F.shuffled ? 'on' : ''}" data-act="fl-shuffle">${I.shuffle} Перемешать</button>
      <button class="chip ${F.auto ? 'on' : ''}" data-act="fl-auto">${F.auto ? I.pause : I.play} Авто</button>
      ${dirChip(getDeck(F.deckId)?.lang)}
    </div>
    <div class="fc-wrap"><div class="fc ${F.flip ? 'flip' : ''}" id="fc" data-act="fl-flip">
      <div class="fc-face fc-front">
        <button class="ib star ${c.star ? 'on' : ''}" data-act="star" data-id="${esc(c.id)}">${I.star}</button>
        <div class="fc-txt ${x.q.length > 40 ? 'long' : ''}">${esc(x.q)}</div>
        ${spkBtn(x.q, x.ql, 'fc-spk')}
        <div class="fc-hint">нажмите, чтобы перевернуть</div>
      </div>
      <div class="fc-face fc-back">
        <div class="fc-txt ${x.a.length > 40 ? 'long' : ''}">${esc(x.a)}</div>
        ${c.ex ? `<div class="ex-line">${esc(c.ex)}<br><span>${esc(c.exT)}</span></div>` : ''}
        ${hintFor(c)}
        ${spkBtn(x.a, x.al, 'fc-spk')}
      </div>
    </div>
    <div class="swipe-l">Ещё учу</div><div class="swipe-r">Знаю</div></div>
    <div class="fl-btns">
      <button class="fl-no" data-act="fl-mark" data-v="0">✗<small>Ещё учу ${F.learn.length}</small></button>
      <button class="ib" data-act="fl-undo" ${F.hist.length ? '' : 'disabled'} aria-label="Назад">${I.undo}</button>
      <button class="fl-yes" data-act="fl-mark" data-v="1">✓<small>Знаю ${F.know.length}</small></button>
    </div>
    <p class="hint center">Свайп вправо — знаю, влево — ещё учу</p>
  </div>`;
};
after.flash = () => {
  const el = $('#fc');
  if (!el) return;
  let x0 = null, y0 = 0, dx = 0, moved = false;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; moved = false; el.style.transition = 'none'; }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (x0 === null) return;
    dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) moved = true;
    if (!moved) return;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)${F.flip ? ' rotateY(180deg)' : ''}`;
    el.parentElement.classList.toggle('to-r', dx > 60);
    el.parentElement.classList.toggle('to-l', dx < -60);
  }, { passive: true });
  el.addEventListener('touchend', () => {
    el.style.transition = '';
    el.parentElement.classList.remove('to-r', 'to-l');
    if (moved && Math.abs(dx) > 90) { flMark(dx > 0); }
    else el.style.transform = '';
    if (moved) { el.dataset.swiped = '1'; setTimeout(() => { delete el.dataset.swiped; }, 50); }
    x0 = null;
  });
  if (F && F.auto) {
    const c = F.cards[F.i];
    if (!c) { F.auto = false; return; }
    if (!F.flip) speak(F.qa[F.i].q, F.qa[F.i].ql);
    clearTimeout(tickT);
    tickT = setTimeout(() => {
      if (!F || !F.auto || cur().name !== 'flash') return;
      if (!F.flip) { F.flip = true; render(true); speak(F.qa[F.i].a, F.qa[F.i].al); setTimeout(() => { if (F && F.auto && cur().name === 'flash') { F.hist.push({ i: F.i, v: null }); F.i++; F.flip = false; render(true); } }, 2600); }
    }, 2600);
  }
};
function flMark(knowIt) {
  const c = F.cards[F.i];
  if (!c) return;
  (knowIt ? F.know : F.learn).push(c);
  F.hist.push({ i: F.i, v: knowIt });
  practice(c.id, knowIt);
  if (knowIt) addXp(2);
  F.i++; F.flip = false;
  render(true);
}

/* ───────────────────────── Подбор (игра на время) ───────────────────────── */
let MG = null;
function startMatchGame(d, cards) {
  if (cards.length < 2) { toast('Нужно хотя бы 2 карточки'); return; }
  const set = shuffle(cards).slice(0, 6);
  const tiles = shuffle([...set.map(c => ({ id: c.id, text: c.t, side: 't', lang: langsOf(c).fl })), ...set.map(c => ({ id: c.id, text: c.d, side: 'd' }))]);
  MG = { deckId: d.id, cards, tiles, sel: null, done: [], start: now(), pen: 0, errors: 0, end: 0, bad: [] };
  go('matchgame');
}
const mgTime = () => ((MG.end || now()) - MG.start) / 1000 + MG.pen;
screens.matchgame = () => {
  if (!MG) return '';
  const best = db.best['match:' + MG.deckId];
  if (MG.end) {
    const t = mgTime();
    return `${hdr('Подбор')}<div class="pad done"><div class="big-emoji pop">⏱️</div>
      <h1 class="center">${t.toFixed(1)} с</h1>
      <p class="center desc">${MG.newBest ? '🏅 Новый рекорд!' : best ? `Рекорд: ${best.toFixed(1)} с` : ''}${MG.errors ? ` · штраф +${MG.errors} с за ошибки` : ''}</p>
      <div class="done-btns"><button class="btn wide" data-act="mg-again">Играть ещё</button><button class="btn ghost wide" data-act="back">Готово</button></div></div>`;
  }
  return `<div class="mg">
    <div class="run-top"><button class="ib" data-act="back">${I.close}</button><div class="mg-time" id="mg-time">0.0 с</div><div class="run-cnt">${best ? 'рекорд ' + best.toFixed(1) : ''}</div></div>
    <p class="hint center">Соедините слово и его перевод. Ошибка — +1 секунда.</p>
    <div class="mg-grid">${MG.tiles.map((t, i) => `<button class="mg-t ${t.text.length > 16 ? 'long' : ''} ${MG.done.includes(i) ? 'gone' : ''} ${MG.sel === i ? 'sel' : ''} ${MG.bad.includes(i) ? 'bad' : ''}" data-act="mg-tap" data-i="${i}">${esc(t.text)}</button>`).join('')}</div>
  </div>`;
};
after.matchgame = () => {
  if (!MG || MG.end) return;
  const el = $('#mg-time');
  const tick = () => { if (el && MG) el.textContent = mgTime().toFixed(1) + ' с'; };
  tick();
  setTick(tick, 100);
};
function mgTap(i) {
  if (MG.done.includes(i)) return;
  const t = MG.tiles[i];
  if (t.side === 't' && t.lang) speak(t.text, t.lang);
  if (MG.sel === null) { MG.sel = i; render(true); return; }
  if (MG.sel === i) { MG.sel = null; render(true); return; }
  const a = MG.tiles[MG.sel];
  if (a.id === t.id && a.side !== t.side) {
    MG.done.push(MG.sel, i);
    vibrate(15);
    MG.sel = null;
    if (MG.done.length === MG.tiles.length) {
      MG.end = now();
      const k = 'match:' + MG.deckId, tm = mgTime();
      if (!db.best[k] || tm < db.best[k]) { MG.newBest = !!db.best[k]; db.best[k] = tm; }
      if (!db.best.matchMin || tm < db.best.matchMin) db.best.matchMin = tm;
      addXp(20);
      beep(true);
      stopTimers();
    }
  } else {
    MG.pen += 1; MG.errors++;
    MG.bad = [MG.sel, i];
    MG.sel = null;
    beep(false);
    setTimeout(() => { if (MG) { MG.bad = []; if (cur().name === 'matchgame') render(true); } }, 450);
  }
  render(true);
}

/* ───────────────────────── Спринт ───────────────────────── */
let SP = null;
function startSprint(d, cards) {
  if (cards.length < 2) { toast('Нужно хотя бы 2 карточки'); return; }
  SP = { deckId: d.id, cards, end: now() + 60000, score: 0, streak: 0, mult: 1, ok: 0, bad: 0, mist: [], over: false, flash: '' };
  spNext();
  go('sprint');
}
function spNext() {
  const c = pick(SP.cards);
  const x = qa(c, db.settings.dir);
  const wrong = distractors(c, 1, x.dir === 'td' ? 'd' : 't', SP.cards)[0];
  const truth = !wrong || Math.random() < 0.5;
  SP.cur = { c, q: x.q, shown: truth ? x.a : wrong, truth, a: x.a };
}
screens.sprint = () => {
  if (!SP) return '';
  const best = db.best['sprint:' + SP.deckId] || 0;
  if (SP.over) {
    return `${hdr('Спринт')}<div class="pad done"><div class="big-emoji pop">⚡</div><h1 class="center">${SP.score} очков</h1>
      <p class="center desc">${SP.newBest ? '🏅 Новый рекорд!' : best ? `Рекорд: ${best}` : ''}</p>
      <div class="stats3"><div><b class="good-t">${SP.ok}</b><span>верно</span></div><div><b class="bad-t">${SP.bad}</b><span>ошибок</span></div><div><b>${SP.ok + SP.bad ? Math.round(SP.ok / (SP.ok + SP.bad) * 100) : 0}%</b><span>точность</span></div></div>
      ${SP.mist.length ? `<h2 class="sec">Ошибки</h2>${[...new Set(SP.mist)].map(c => cardRow(c)).join('')}` : ''}
      <div class="done-btns"><button class="btn wide" data-act="sp-again">Ещё раз</button><button class="btn ghost wide" data-act="back">Готово</button></div></div>`;
  }
  const x = SP.cur;
  return `<div class="sprint ${SP.flash}">
    <div class="run-top"><button class="ib" data-act="back">${I.close}</button><div class="sp-time" id="sp-time">60</div><div class="run-cnt">${SP.score}</div></div>
    <div class="sp-mult">${'●'.repeat(SP.streak % 4)}${'○'.repeat(3 - SP.streak % 4)} ×${SP.mult}</div>
    <div class="card sp-card"><div class="ex-q">${esc(x.q)}</div><div class="tf-eq">=</div><div class="ex-q alt">${esc(x.shown)}</div></div>
    <div class="opts two sp-btns"><button class="opt tf" data-act="sp-ans" data-v="0">✗ Неверно</button><button class="opt tf" data-act="sp-ans" data-v="1">✓ Верно</button></div>
    <p class="hint center">Серия из 4 верных ответов увеличивает множитель</p>
  </div>`;
};
after.sprint = () => {
  if (!SP || SP.over) return;
  const el = $('#sp-time');
  const tick = () => {
    if (!SP) return;
    const left = Math.max(0, Math.ceil((SP.end - now()) / 1000));
    if (el) { el.textContent = left; el.classList.toggle('low', left <= 10); }
    if (left <= 0) {
      SP.over = true;
      const k = 'sprint:' + SP.deckId;
      if (SP.score > (db.best[k] || 0)) { SP.newBest = !!db.best[k]; db.best[k] = SP.score; }
      db.best.sprintMax = Math.max(db.best.sprintMax || 0, SP.score);
      saveSoon();
      stopTimers();
      render();
    }
  };
  tick();
  setTick(tick, 200);
};
function spAnswer(v) {
  if (!SP || SP.over) return;
  const ok = v === SP.cur.truth;
  if (ok) {
    SP.ok++; SP.streak++;
    SP.score += 10 * SP.mult;
    if (SP.streak % 4 === 0) SP.mult = Math.min(4, SP.mult + 1);
    addXp(2);
  } else {
    SP.bad++; SP.streak = 0; SP.mult = 1;
    SP.mist.push(SP.cur.c);
  }
  practice(SP.cur.c.id, ok);
  beep(ok);
  SP.flash = ok ? 'fl-ok' : 'fl-no';
  spNext();
  render(true);
  setTimeout(() => { if (SP) SP.flash = ''; const el = $('.sprint'); if (el) el.classList.remove('fl-ok', 'fl-no'); }, 250);
}

/* ───────────────────────── Гравитация ─────────────────────────
 * Слово падает сверху. Нужно успеть написать ответ, пока оно не коснулось земли.
 * С каждым верным ответом слова падают быстрее. Три жизни. */
let GV = null;
function startGravity(d, cards) {
  if (cards.length < 2) { toast('Нужно хотя бы 2 карточки'); return; }
  GV = { deckId: d.id, cards: shuffle(cards), k: 0, lives: 3, score: 0, ok: 0, mist: [], fall: 15000, over: false, miss: false };
  gvNext();
  go('gravity');
}
function gvNext() {
  if (GV.k >= GV.cards.length) { GV.cards = shuffle(GV.cards); GV.k = 0; }
  const c = GV.cards[GV.k++];
  GV.cur = { c, ...qa(c, db.settings.dir), t0: now(), dur: GV.fall };
  GV.miss = false;
}
screens.gravity = () => {
  if (!GV) return '';
  const best = db.best['gravity:' + GV.deckId] || 0;
  if (GV.over) {
    return `${hdr('Гравитация')}<div class="pad done"><div class="big-emoji pop">🌠</div><h1 class="center">${GV.score} очков</h1>
      <p class="center desc">${GV.newBest ? '🏅 Новый рекорд!' : best ? `Рекорд: ${best}` : ''}</p>
      <div class="stats3"><div><b class="good-t">${GV.ok}</b><span>верно</span></div><div><b class="bad-t">${GV.mist.length}</b><span>упало</span></div><div><b>${(GV.fall / 1000).toFixed(1)} с</b><span>скорость</span></div></div>
      ${GV.mist.length ? `<h2 class="sec">Повторите</h2>${[...new Set(GV.mist)].map(c => cardRow(c)).join('')}` : ''}
      <div class="done-btns"><button class="btn wide" data-act="gv-again">Ещё раз</button><button class="btn ghost wide" data-act="back">Готово</button></div></div>`;
  }
  const x = GV.cur;
  return `<div class="run gv">
    <div class="run-top"><button class="ib" data-act="back" aria-label="Выйти">${I.close}</button>
      <div class="gv-lives">${'❤️'.repeat(GV.lives)}${'🤍'.repeat(3 - GV.lives)}</div><div class="run-cnt">${GV.score}</div></div>
    <div class="gv-sky">
      ${GV.miss ? `<div class="gv-miss card pop"><div class="hint">Слово упало. Правильно:</div><div class="ex-q">${esc(x.q)}</div><div class="ex-q alt">${esc(x.a)}</div></div>`
        : `<div class="gv-word" id="gv-word">${esc(x.q)}</div>`}
    </div>
    <div class="gv-in"><input class="ans" id="gv-ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${x.dir === 'td' ? 'Перевод' : 'Слово'}" data-enter="gv-check" ${GV.miss ? 'disabled' : ''}><button class="btn" data-act="gv-check">OK</button></div>
  </div>`;
};
after.gravity = () => {
  if (!GV || GV.over || GV.miss) return;
  const inp = $('#gv-ans');
  if (inp) inp.focus();
  const w = $('#gv-word');
  const tick = () => {
    if (!GV || GV.over || GV.miss || cur().name !== 'gravity') return;
    const p = Math.min(1, (now() - GV.cur.t0) / GV.cur.dur);
    if (w) { w.style.top = `calc(${(p * 100).toFixed(2)}% - ${(p * 64).toFixed(1)}px)`; w.classList.toggle('low', p > 0.75); }
    if (p >= 1) gvMiss();
  };
  tick();
  setTick(tick, 40);
};
function gvMiss() {
  clearInterval(tickT);
  const x = GV.cur;
  GV.lives--; GV.mist.push(x.c); GV.miss = true;
  practice(x.c.id, false);
  beep(false); vibrate(60);
  speak(x.c.t, langsOf(x.c).fl);
  render(true);
  setTimeout(() => {
    if (!GV || GV.cur !== x || cur().name !== 'gravity') return;
    if (GV.lives <= 0) gvOver(); else { gvNext(); render(true); }
  }, 2400);
}
function gvOver() {
  GV.over = true;
  clearInterval(tickT);
  const k = 'gravity:' + GV.deckId;
  if (GV.score > (db.best[k] || 0)) { GV.newBest = !!db.best[k]; db.best[k] = GV.score; }
  saveSoon();
  render();
}
function gvCheck() {
  if (!GV || GV.over || GV.miss) return;
  const inp = $('#gv-ans');
  const v = inp ? inp.value : '';
  if (!v.trim()) return;
  const x = GV.cur;
  if (checkAnswer(v, x.a).ok) {
    const left = 1 - (now() - x.t0) / x.dur;
    GV.ok++;
    GV.score += 10 + Math.max(0, Math.round(10 * left));
    GV.fall = Math.max(5000, GV.fall - 450);
    practice(x.c.id, true);
    addXp(3);
    beep(true);
    gvNext();
    render(true);
  } else {
    beep(false);
    inp.value = '';
    inp.classList.add('bad');
    setTimeout(() => inp.classList.remove('bad'), 350);
  }
}

/* ───────────────────────── Аудиоплеер ─────────────────────────
 * Пассивное повторение: слово → пауза, чтобы вспомнить → перевод → слово ещё раз → пример. */
let AU = null;
function startAudio(d, cards) {
  AU = { deckId: d.id, title: d.title, cards: shuffle(cards), i: 0, step: 0, play: true, ex: true, tok: 0 };
  go('audio');
  auRun();
}
const auDur = t => 700 + speechText(t).length * 80 / db.settings.rate;
function auSteps(c) {
  const { fl, bl } = langsOf(c);
  const rev = db.settings.dir === 'dt';
  const st = rev ? [[c.d, bl, 2400], [c.t, fl, 700], [c.t, fl, 900]] : [[c.t, fl, 2400], [c.d, bl, 700], [c.t, fl, 900]];
  if (AU.ex && c.ex) st.push([c.ex, fl, 900]);
  return st;
}
function auRun() {
  if (!AU) return;
  const tok = ++AU.tok;
  const run = () => {
    if (!AU || AU.tok !== tok || !AU.play) return;
    if (cur().name !== 'audio') { AU.play = false; return; }
    const c = AU.cards[AU.i];
    const steps = auSteps(c);
    if (AU.step >= steps.length) {
      AU.i = (AU.i + 1) % AU.cards.length;
      AU.step = 0;
      render(true);
      setTimeout(run, 600);
      return;
    }
    const [text, lang, pause] = steps[AU.step++];
    speak(text, lang);
    render(true);
    setTimeout(run, auDur(text) + pause);
  };
  run();
}
screens.audio = () => {
  if (!AU) return '';
  const c = AU.cards[AU.i];
  const x = qa(c, db.settings.dir === 'dt' ? 'dt' : 'td');
  const shown = AU.step >= 2;
  return `<div class="run au">
    <div class="run-top"><button class="ib" data-act="back" aria-label="Выйти">${I.close}</button>
      <div class="pbar"><i style="width:${(AU.i + 1) / AU.cards.length * 100}%"></i></div><div class="run-cnt">${AU.i + 1}/${AU.cards.length}</div></div>
    <div class="fl-tools">${dirChip(getDeck(AU.deckId)?.lang)}<button class="chip ${AU.ex ? 'on' : ''}" data-act="au-ex">Примеры</button></div>
    <div class="ex">
      <div class="card au-card">
        <button class="ib star ${c.star ? 'on' : ''}" data-act="star" data-id="${esc(c.id)}" aria-label="Избранное">${I.star}</button>
        <div class="ex-q">${esc(x.q)}</div>
        <div class="ex-q alt ${shown ? '' : 'au-hide'}">${shown ? esc(x.a) : '…'}</div>
        ${shown && AU.ex && c.ex ? `<div class="ex-line">${esc(c.ex)}<br><span>${esc(c.exT)}</span></div>` : ''}
      </div>
      <p class="hint center">Попробуйте вспомнить перевод в паузе, пока он не прозвучал. Не выключайте экран — иначе телефон остановит озвучку.</p>
    </div>
    <div class="au-ctl">
      <button class="ib" data-act="au-prev" aria-label="Назад">⏮</button>
      <button class="au-play" data-act="au-toggle" aria-label="${AU.play ? 'Пауза' : 'Играть'}">${AU.play ? I.pause : I.play}</button>
      <button class="ib" data-act="au-next" aria-label="Дальше">⏭</button>
    </div>
  </div>`;
};
function auJump(n) {
  AU.i = (AU.i + n + AU.cards.length) % AU.cards.length;
  AU.step = 0;
  if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) {}
  if (AU.play) auRun(); else render(true);
}

/* ───────────────────────── Тест ───────────────────────── */
let T = null;
screens.testsetup = c => {
  const cards = c.ids ? c.ids.map(id => cardIdx.get(id)?.c).filter(Boolean) : sessionCards(c.deck);
  c.n = c.n || Math.min(20, cards.length);
  c.types = c.types || { tf: true, mc: true, wr: true, mt: cards.length >= 4 };
  const ty = [['tf', 'Верно / неверно'], ['mc', 'Выбор ответа'], ['wr', 'Письменный ответ'], ['mt', 'Сопоставление']];
  return `${hdr('Настройка теста')}<div class="pad form">
    <div class="lbl">Вопросов: <b id="t-n">${c.n}</b> из ${cards.length}</div>
    <input type="range" min="${Math.min(3, cards.length)}" max="${cards.length}" value="${c.n}" data-in="t-n">
    <div class="lbl">Типы вопросов</div>
    ${ty.map(([k, l]) => `<label class="tgl"><input type="checkbox" data-ch="t-type" data-k="${k}" ${c.types[k] ? 'checked' : ''}> ${l}</label>`).join('')}
    <div class="lbl">Отвечать</div>${dirSeg()}
    <button class="btn wide" data-act="t-start">Начать тест</button>
  </div>`;
};
function buildTest(c) {
  const cards = shuffle(c.ids ? c.ids.map(id => cardIdx.get(id)?.c).filter(Boolean) : sessionCards(c.deck)).slice(0, c.n);
  const types = Object.keys(c.types).filter(k => c.types[k]);
  if (!types.length) types.push('mc');
  const pool = sessionCards(c.deck).length >= 4 ? sessionCards(c.deck) : cards;
  S = { pool, dir: db.settings.dir };
  const groups = { tf: [], mc: [], wr: [], mt: [] };
  cards.forEach((card, i) => groups[types[i % types.length]].push(card));
  if (groups.mt.length && groups.mt.length < 2) { groups.mc.push(...groups.mt); groups.mt = []; }
  const qs = [];
  groups.tf.forEach(card => qs.push(prep({ type: 'tf', c: card })));
  groups.mc.forEach(card => qs.push(prep({ type: 'mc', c: card })));
  groups.wr.forEach(card => qs.push(prep({ type: 'type', c: card })));
  for (let i = 0; i < groups.mt.length; i += 5) {
    const part = groups.mt.slice(i, i + 5);
    if (part.length < 2) { qs.push(prep({ type: 'mc', c: part[0] })); continue; }
    const items = part.map(card => ({ c: card, ...qa(card, db.settings.dir === 'mix' ? 'td' : db.settings.dir) }));
    qs.push({ type: 'mt', items, answers: shuffle(items.map(x => x.a)) });
  }
  S = null;
  T = { deck: c.deck, setup: c, qs, ans: {}, done: false, start: now() };
  replace('test');
}
screens.test = () => {
  if (!T) return '';
  let num = 0;
  const sec = { tf: 'Верно или неверно', mc: 'Выберите ответ', type: 'Напишите ответ', mt: 'Сопоставьте' };
  let lastType = '';
  const html = T.qs.map((q, qi) => {
    let h = '';
    if (q.type !== lastType) { lastType = q.type; h += `<h2 class="sec">${sec[q.type]}</h2>`; }
    const res = T.done ? T.res[qi] : null;
    if (q.type === 'tf') {
      num++;
      const a = T.ans[qi];
      h += `<div class="card tq ${res ? (res.ok ? 'ok' : 'no') : ''}"><div class="tq-n">${num}</div><div class="ex-q sm">${esc(q.q)}</div><div class="tf-eq">=</div><div class="ex-q sm alt">${esc(q.shown)}</div>
        <div class="opts two">${[[0, '✗ Неверно'], [1, '✓ Верно']].map(([v, l]) => `<button class="opt sm ${a === v ? 'chosen' : ''} ${T.done && (v === 1) === q.truth ? 'good' : ''}" data-act="t-ans" data-q="${qi}" data-v="${v}" ${T.done ? 'disabled' : ''}>${l}</button>`).join('')}</div>
        ${res && !res.ok ? `<div class="hint">Правильный перевод: <b>${esc(q.a)}</b></div>` : ''}</div>`;
    } else if (q.type === 'mc') {
      num++;
      const a = T.ans[qi];
      h += `<div class="card tq ${res ? (res.ok ? 'ok' : 'no') : ''}"><div class="tq-n">${num}</div><div class="ex-q sm">${esc(q.q)}</div>
        <div class="opts">${q.opts.map((o, i) => `<button class="opt sm ${a === i ? 'chosen' : ''} ${T.done && o === q.a ? 'good' : ''} ${T.done && a === i && o !== q.a ? 'bad' : ''}" data-act="t-ans" data-q="${qi}" data-v="${i}" ${T.done ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div></div>`;
    } else if (q.type === 'type') {
      num++;
      h += `<div class="card tq ${res ? (res.ok ? 'ok' : 'no') : ''}"><div class="tq-n">${num}</div><div class="ex-q sm">${esc(q.q)}</div>
        <input class="ans" data-in="t-wr" data-q="${qi}" value="${esc(T.ans[qi] || '')}" placeholder="Ответ" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${T.done ? 'readonly' : ''}>
        ${res && !res.ok ? `<div class="hint">Правильно: <b>${esc(q.a)}</b></div>` : ''}${res && res.typo ? `<div class="hint">Засчитано с опечаткой: <b>${esc(q.a)}</b></div>` : ''}</div>`;
    } else if (q.type === 'mt') {
      const letters = 'АБВГД';
      h += `<div class="card tq"><div class="mt-ans">${q.answers.map((a, i) => `<div><b>${letters[i]}</b> ${esc(a)}</div>`).join('')}</div>
        ${q.items.map((it, k) => {
          num++;
          const v = (T.ans[qi] || {})[k];
          const r = res ? res.items[k] : null;
          return `<div class="mt-row ${r === null ? '' : r ? 'ok' : 'no'}"><span class="tq-n">${num}</span><span class="mt-q">${esc(it.q)}</span>
            <select data-ch="t-mt" data-q="${qi}" data-k="${k}" ${T.done ? 'disabled' : ''}><option value="">—</option>${q.answers.map((a, i) => `<option value="${i}" ${String(v) === String(i) ? 'selected' : ''}>${letters[i]}</option>`).join('')}</select>
            ${res && !res.items[k] ? `<span class="hint">→ ${esc(it.a)}</span>` : ''}</div>`;
        }).join('')}</div>`;
    }
    return h;
  }).join('');
  const total = T.qs.reduce((s, q) => s + (q.type === 'mt' ? q.items.length : 1), 0);
  return `${hdr(T.done ? 'Результаты теста' : 'Тест')}<div class="pad test">
    ${T.done ? `<div class="card score"><div class="goal-ring">${ring(T.score / total, 96, 10)}<span>${Math.round(T.score / total * 100)}%</span></div>
      <div><div class="cta-t">${T.score} из ${total} верно</div><div class="cta-s">${T.score === total ? 'Идеально! 🏆' : T.score / total >= 0.8 ? 'Отличный результат!' : T.score / total >= 0.5 ? 'Неплохо, но есть над чем поработать' : 'Стоит ещё позаниматься'}</div>
      <div class="cta-s">Время: ${fmtTime(T.time)}</div></div></div>` : ''}
    ${html}
    ${T.done ? `<div class="done-btns">${T.wrongIds.length ? `<button class="btn wide" data-act="t-learn">Заучить ошибки (${T.wrongIds.length})</button>` : ''}
      <button class="btn ghost wide" data-act="t-new">Новый тест</button><button class="btn ghost wide" data-act="back">Готово</button></div>`
      : `<button class="btn wide" data-act="t-submit">Проверить тест</button>`}
  </div>`;
};
function submitTest() {
  let score = 0;
  const wrong = [];
  T.res = T.qs.map((q, qi) => {
    const a = T.ans[qi];
    if (q.type === 'tf') { const ok = a !== undefined && (a === 1) === q.truth; ok ? score++ : wrong.push(q.c.id); practice(q.c.id, ok); return { ok }; }
    if (q.type === 'mc') { const ok = a !== undefined && q.opts[a] === q.a; ok ? score++ : wrong.push(q.c.id); practice(q.c.id, ok); return { ok }; }
    if (q.type === 'type') { const r = checkAnswer(a || '', q.a); r.ok ? score++ : wrong.push(q.c.id); practice(q.c.id, r.ok); return r; }
    const items = q.items.map((it, k) => { const v = (a || {})[k]; const ok = v !== undefined && v !== '' && q.answers[v] === it.a; ok ? score++ : wrong.push(it.c.id); practice(it.c.id, ok); return ok; });
    return { items };
  });
  const total = T.qs.reduce((s, q) => s + (q.type === 'mt' ? q.items.length : 1), 0);
  T.done = true; T.score = score; T.wrongIds = wrong; T.time = now() - T.start;
  addXp(score * 5 + (score === total ? 30 : 0));
  if (score === total && total >= 10) db.flags.perfectTest = true;
  db.flags.tests = (db.flags.tests || 0) + 1;
  saveSoon();
  beep(score / total >= 0.6);
  render();
}

/* ───────────────────────── Прогресс ───────────────────────── */
function achievements() {
  const cards = allCards();
  const known = cards.filter(c => level(c.id) >= 2).length;
  const lessonsDone = Object.values(db.lessons).reduce((s, x) => s + Object.keys(x).length, 0);
  const bs = bestStreak(), xp = totalXp();
  return [
    ['🌱', 'Первые шаги', 'Пройти первый урок', lessonsDone >= 1],
    ['📚', 'Ученик', 'Пройти 10 уроков', lessonsDone >= 10],
    ['🎓', 'Магистр', 'Пройти 50 уроков', lessonsDone >= 50],
    ['🔥', 'Неделя силы воли', 'Серия 7 дней', bs >= 7],
    ['💎', 'Месяц без пропусков', 'Серия 30 дней', bs >= 30],
    ['🧠', '50 слов', 'Знать 50 слов', known >= 50],
    ['🏛️', '200 слов', 'Знать 200 слов', known >= 200],
    ['👑', '500 слов', 'Знать 500 слов', known >= 500],
    ['⭐', 'Тысяча XP', 'Набрать 1000 XP', xp >= 1000],
    ['🚀', '10 000 XP', 'Набрать 10 000 XP', xp >= 10000],
    ['⚡', 'Молния', '300 очков в спринте', (db.best.sprintMax || 0) >= 300],
    ['⏱️', 'Скорострел', 'Подбор быстрее 20 с', (db.best.matchMin || 99) < 20],
    ['🏆', 'Отличник', 'Тест из 10+ вопросов на 100%', !!db.flags.perfectTest],
    ['✍️', 'Автор', 'Создать свой набор', db.decks.length > 0],
  ];
}
screens.stats = () => {
  const cards = allCards();
  const cnt = [0, 0, 0, 0, 0];
  cards.forEach(c => cnt[level(c.id)]++);
  const days = Object.values(db.days);
  const ok = days.reduce((s, d) => s + d.ok, 0), bad = days.reduce((s, d) => s + d.bad, 0);
  // Активность за 18 недель
  const goal = db.settings.goal;
  const end = new Date(); end.setHours(12, 0, 0, 0);
  const startD = new Date(end); startD.setDate(startD.getDate() - 7 * 17 - ((startD.getDay() + 6) % 7));
  let cells = '';
  for (let d = new Date(startD); d <= end; d.setDate(d.getDate() + 1)) {
    const x = db.days[dayKey(d)]?.xp || 0;
    const l = x === 0 ? 0 : x < goal / 2 ? 1 : x < goal ? 2 : x < goal * 2 ? 3 : 4;
    cells += `<i class="h${l}" title="${dayKey(d)}: ${x} XP"></i>`;
  }
  // Последние 7 дней
  const week = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); week.push({ k: dayKey(d), l: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()], xp: db.days[dayKey(d)]?.xp || 0 }); }
  const maxW = Math.max(goal, ...week.map(w => w.xp));
  const hard = smartCards('@hard').slice(0, 8);
  const ach = achievements();
  const lvRows = byLevel(langDecks().filter(d => d.builtin)).map(([lv, list]) => {
    const cs = list.flatMap(d => d.cards), k = cs.filter(c => level(c.id) >= 2).length;
    return `<div class="lv-row"><span><b class="lvl-tag">${esc(lv)}</b></span><div class="lv-bar"><i class="l3" style="width:${cs.length ? k / cs.length * 100 : 0}%"></i></div><b>${k}/${cs.length}</b></div>`;
  }).join('');
  return `${hdr('Прогресс', { root: true })}<div class="pad">
    ${langBar()}
    <div class="stats3">
      <div><b>🔥 ${streak()}</b><span>серия дней</span></div>
      <div><b>${bestStreak()}</b><span>рекорд серии</span></div>
      <div><b>${totalXp()}</b><span>всего XP</span></div>
    </div>
    <div class="stats3">
      <div><b>${cnt[2] + cnt[3] + cnt[4]}</b><span>слов знаю</span></div>
      <div><b>${dueCards().length}</b><span>к повторению</span></div>
      <div><b>${ok + bad ? Math.round(ok / (ok + bad) * 100) : 0}%</b><span>точность</span></div>
    </div>
    ${lvRows ? `<h2 class="sec">${LANGS[curLang()].flag} Путь к C2</h2><div class="card">${lvRows}<p class="hint">Сколько слов каждого уровня вы уже знаете (интервал повторения от 2 дней).</p></div>` : ''}
    <h2 class="sec">Неделя</h2>
    <div class="card week">${week.map(w => `<div class="wk"><div class="wk-bar"><i style="height:${w.xp / maxW * 100}%" class="${w.xp >= goal ? 'full' : ''}"></i></div><small>${w.l}</small><small class="wk-x">${w.xp || ''}</small></div>`).join('')}
      <div class="wk-goal" style="bottom:calc(${goal / maxW * 100}% * 0.72 + 34px)"></div></div>
    <h2 class="sec">Активность</h2>
    <div class="card heat"><div class="heat-g">${cells}</div><div class="legend">меньше <i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i> больше</div></div>
    <h2 class="sec">Слова по уровням</h2>
    <div class="card">${[4, 3, 2, 1, 0].map(l => `<div class="lv-row"><span><i class="lvl-dot l${l}"></i>${LEVELS[l]}</span><div class="lv-bar"><i class="l${l}" style="width:${cards.length ? cnt[l] / cards.length * 100 : 0}%"></i></div><b>${cnt[l]}</b></div>`).join('')}
      <p class="hint">«Знакомо» — интервал повторения от 2 дней, «знаю» — от недели, «выучено» — от 3 недель.</p></div>
    ${hard.length ? `<h2 class="sec">Самые трудные слова</h2>${hard.map(cardRow).join('')}<button class="btn ghost wide" data-act="open-deck" data-id="@hard">Тренировать трудные</button>` : ''}
    <h2 class="sec">Достижения · ${ach.filter(a => a[3]).length}/${ach.length}</h2>
    <div class="ach">${ach.map(([e, t, s, ok]) => `<div class="ach-i ${ok ? 'on' : ''}"><b>${e}</b><span>${t}</span><small>${s}</small></div>`).join('')}</div>
  </div>`;
};

/* ───────────────────────── Ещё: справочник, настройки, копия ───────────────────────── */
screens.more = () => `${hdr('Ещё', { root: true })}<div class="pad">
  <button class="mrow" data-act="go" data-to="guide"><b>🧠</b><span>Как запоминать<small>17 статей: методики, уровни, особенности языков в приложении</small></span>${I.chev}</button>
  <button class="mrow" data-act="go" data-to="settings"><b>⚙️</b><span>Настройки<small>Тема, цель дня, озвучка, уроки</small></span>${I.chev}</button>
  <button class="mrow" data-act="go" data-to="import"><b>📥</b><span>Импорт слов<small>Из Quizlet, Excel, заметок или файла</small></span>${I.chev}</button>
  <button class="mrow" data-act="go" data-to="backup"><b>💾</b><span>Резервная копия<small>Сохранить и перенести прогресс</small></span>${I.chev}</button>
  <button class="mrow" data-act="go" data-to="install"><b>📱</b><span>Установка на телефон<small>Android и iPhone</small></span>${I.chev}</button>
  <div class="about"><div class="logo">Мнемо</div><p class="hint center">Карточки · Заучивание · Тест · Подбор · Письмо · Диктант · Собери слово · Спринт · Интервальные повторения · Уроки<br>${nWords(cardIdx.size)} в ${DECKS.length} наборах на ${langList().length} языках. Все данные хранятся только на этом устройстве.</p></div>
</div>`;
screens.guide = () => `${hdr('Как запоминать')}<div class="pad">
  <p class="desc">Короткие статьи о том, как работает память, и как этим пользоваться.</p>
  ${(window.MNEMO_GUIDE || []).map(g => `<button class="mrow" data-act="go" data-to="article" data-id="${g.id}"><b>${g.emoji}</b><span>${esc(g.title)}</span>${I.chev}</button>`).join('')}
</div>`;
screens.article = c => {
  const g = (window.MNEMO_GUIDE || []).find(x => x.id === c.id);
  if (!g) return hdr('Статья');
  const list = window.MNEMO_GUIDE;
  const i = list.indexOf(g);
  const nx = list[i + 1];
  return `${hdr(`${g.emoji} ${esc(g.title)}`)}<div class="pad article">${g.body}
    ${nx ? `<button class="mrow" data-act="art-next" data-id="${nx.id}"><b>${nx.emoji}</b><span>Далее: ${esc(nx.title)}</span>${I.chev}</button>` : ''}</div>`;
};
function seg(k, opts) {
  return `<div class="seg">${opts.map(([v, l]) => `<button class="${String(db.settings[k]) === String(v) ? 'on' : ''}" data-act="set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
}
function tgl(k, label, sub) {
  return `<label class="tgl row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" class="sw" data-ch="set-bool" data-k="${k}" ${db.settings[k] ? 'checked' : ''}></label>`;
}
const VOICE_TEST = [['de-DE', '🇩🇪', 'Hallo! Lernen wir neue Wörter.'], ['it-IT', '🇮🇹', 'Ciao! Impariamo nuove parole.'], ['uk-UA', '🇺🇦', 'Привіт! Вивчаймо нові слова.'], ['en-US', '🇬🇧', "Hello! Let's learn some new words."], ['ru-RU', '🇷🇺', 'Привет! Учим новые слова.']];
function voiceRows() {
  const rows = VOICE_TEST.map(([lang, flag, text]) => {
    const h = hasVoice(lang);
    const st = h === true ? '<small class="good-t">голос есть</small>' : h === false ? `<small class="bad-t">голоса нет${db.settings.onlineVoice !== false ? ' — читаем онлайн' : ''}</small>` : '<small>—</small>';
    return `<div class="vrow"><b>${flag}</b><span>${lang}<br>${st}</span><button class="btn sm ghost" data-act="speak" data-text="${esc(text)}" data-lang="${lang}">🔊</button></div>`;
  }).join('');
  const fix = window.Android && Android.installVoices
    ? '<button class="btn ghost" data-act="install-voices">⬇️ Установить голоса (украинский и др.)</button><p class="hint">Откроются настройки синтеза речи Google: «Установить голосовые данные» → Українська. После установки перезапустите приложение.</p>'
    : '<p class="hint">iPhone: Настройки → Универсальный доступ → Устный контент → Голоса → Украинский — скачайте голос «Леся».</p>';
  return rows + fix;
}
screens.settings = () => `${hdr('Настройки')}<div class="pad form">
  <div class="lbl">Оформление</div>${seg('theme', [['dark', '🌙 Тёмная'], ['light', '☀️ Светлая'], ['sepia', '📜 Сепия']])}
  <div class="lbl">Цель дня (XP)</div>${seg('goal', [[20, '20'], [50, '50'], [100, '100'], [200, '200'], [400, '400']])}
  <div class="lbl">Направление по умолчанию</div>${dirSeg()}
  <div class="lbl">Слов в одном уроке</div>${seg('lessonSize', [[4, '4'], [5, '5'], [6, '6'], [8, '8'], [10, '10']])}
  <div class="lbl">Новых слов в день в «Повторении»</div>${seg('newPerDay', [[0, '0'], [5, '5'], [10, '10'], [20, '20'], [50, '50']])}
  <div class="lbl">Скорость речи: <b id="rate-v">${db.settings.rate.toFixed(1)}</b></div>
  <input type="range" min="0.5" max="1.3" step="0.1" value="${db.settings.rate}" data-in="rate">
  <div class="lbl">Голоса</div>
  ${voiceRows()}
  ${tgl('onlineVoice', 'Онлайн-озвучка, если голоса нет', 'Если в телефоне не установлен голос (часто украинский), слова читаются через интернет')}
  ${tgl('autoplay', 'Автоозвучка', 'Произносить вопрос автоматически')}
  ${tgl('sound', 'Звуки и вибрация', 'Сигнал при верном и неверном ответе')}
  ${tgl('typos', 'Прощать опечатки', 'Засчитывать ответ с 1–2 ошибками в букве')}
  <div class="lbl">Опасная зона</div>
  <button class="btn ghost danger-t" data-act="reset-progress">Сбросить весь прогресс</button>
  <button class="btn ghost danger-t" data-act="reset-all">Удалить все данные и наборы</button>
</div>`;
screens.backup = () => `${hdr('Резервная копия')}<div class="pad form">
  <p class="desc">Копия содержит все наборы, прогресс, статистику и настройки. Сохраните её, чтобы перенести на другой телефон или не потерять при переустановке.</p>
  <button class="btn wide" data-act="bk-save">💾 Сохранить в файл</button>
  <button class="btn ghost wide" data-act="bk-share">📤 Поделиться копией</button>
  <div class="lbl">Восстановление</div>
  <label class="file-btn btn ghost">📂 Восстановить из файла<input type="file" accept=".json,application/json,text/*" data-file="backup"></label>
  <textarea id="bk-text" rows="4" placeholder="…или вставьте сюда текст копии"></textarea>
  <button class="btn ghost wide" data-act="bk-paste">Восстановить из текста</button>
  <p class="hint">Восстановление заменит текущие данные на устройстве.</p>
</div>`;
screens.install = () => `${hdr('Установка')}<div class="pad article">
  <h3>🤖 Android</h3>
  <p>Скачайте файл <b>Mnemo.apk</b> из раздела Releases репозитория и откройте его — разрешите установку из этого источника.</p>
  <h3>🍏 iPhone</h3>
  <ol><li>Откройте адрес веб-версии <b>в Safari</b> (в других браузерах на iOS установки нет).</li>
  <li>Нажмите «Поделиться» <b>⬆︎</b> → <b>«На экран „Домой“»</b>.</li>
  <li>Мнемо появится на экране как обычное приложение и будет работать без интернета.</li></ol>
  <p class="note">Данные на iPhone и Android хранятся отдельно. Чтобы перенести прогресс или наборы — используйте «Резервную копию» или «Экспорт текстом» набора.</p>
  ${location.protocol.startsWith('http') ? `<p class="hint">Адрес этой страницы: <b>${esc(location.href.split('#')[0])}</b></p><button class="btn ghost" data-act="copy-url">Скопировать адрес</button>` : ''}
</div>`;

function restoreBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { toast('Это не похоже на резервную копию'); return; }
  if (!data || !Array.isArray(data.decks)) { toast('В файле нет данных Мнемо'); return; }
  confirmBox(`Восстановить копию? ${data.decks.length} наборов заменят текущие данные.`, 'Восстановить', () => {
    localStorage.setItem(KEY, JSON.stringify(data));
    const l = data.settings && data.settings.lang;
    const needEn = data.seeded || data.decks.some(d => d.builtin);
    Promise.all([l && ensureLang(l), needEn && ensureLang('en')]).catch(() => {}).then(() => {
      load(); applyTheme(); save();
      toast('Копия восстановлена');
      tab('home');
    });
  });
}

/* ───────────────────────── Тема ───────────────────────── */
const THEME_BG = { dark: '#14122B', light: '#F5F4FB', sepia: '#F3EAD7' };
function applyTheme() {
  const t = db.settings.theme;
  document.documentElement.dataset.theme = t;
  const m = $('meta[name="theme-color"]');
  if (m) m.setAttribute('content', THEME_BG[t]);
  try { if (window.Android && Android.setBars) Android.setBars(THEME_BG[t], t !== 'dark'); } catch (e) {}
}

/* ───────────────────────── События ───────────────────────── */
const A = {
  back: () => back(),
  tab: el => tab(el.dataset.tab),
  go: el => go(el.dataset.to, { id: el.dataset.id }),
  'art-next': el => replace('article', { id: el.dataset.id }),
  'modal-close': () => closeModal(),
  journey: () => go('journey', { lang: curLang() }),
  history: el => go('history', { lang: el.dataset.l || curLang() }),
  'hist-open': el => { closeModal(); const p = { lang: el.dataset.l, k: Number(el.dataset.k) }; el.dataset.replace ? replace('station', p) : go('station', p); },
  'hist-word': el => {
    const x = cardIdx.get(el.dataset.id); if (!x) return;
    const c = x.c, { fl } = langsOf(c);
    openModal(`<h3>${esc(c.t)} ${spkBtn(c.t, fl)}</h3><p class="desc">${esc(c.d)}</p>${c.ex ? `<div class="ex-line">${esc(c.ex)}${c.exT ? `<br><span>${esc(c.exT)}</span>` : ''}</div>` : ''}
      <p class="hint">${['Новое слово', 'Изучаете', 'Знакомое', 'Знаете', 'Выучено'][level(c.id)]} · набор «${esc(x.d.title)}»</p>
      <div class="row2"><button class="btn ghost" data-act="star" data-id="${esc(c.id)}">${c.star ? '★ В избранном' : '☆ В избранное'}</button><button class="btn" data-act="modal-close">OK</button></div>`);
  },
  ...photoActions(),
  postcard: el => postcard(Number(el.dataset.i), el.dataset.l || curLang()),
  'journey-go': el => { closeModal(); setActive(el.dataset.id); tab('lessons'); },
  'install-voices': () => { try { Android.installVoices(); } catch (e) {} },
  'modal-ok': () => { const cb = modalCb; closeModal(); cb && cb(); },
  speak: el => speak(el.dataset.text, el.dataset.lang),
  'speak-slow': el => speak(el.dataset.text, el.dataset.lang, true),
  star: el => {
    const c = cardIdx.get(el.dataset.id)?.c;
    if (!c) return;
    editCard(c, { star: !c.star });
    if ($('#modal').hidden) render(true);
  },
  set: el => {
    const k = el.dataset.k;
    let v = el.dataset.v;
    if (typeof DEF_SETTINGS[k] === 'number') v = Number(v);
    db.settings[k] = v;
    saveSoon();
    if (k === 'theme') applyTheme();
    if (F && k === 'dir') { F.dir = v; F.qa = F.cards.map(c => qa(c, v)); }
    render(true);
  },
  'dir-cycle': el => {
    const v = DIR_ORDER[(DIR_ORDER.indexOf(db.settings.dir) + 1) % DIR_ORDER.length];
    db.settings.dir = v;
    saveSoon();
    const name = cur().name;
    if (name === 'flash' && F) { F.dir = v; F.qa = F.cards.map(c => qa(c, v)); F.flip = false; }
    if (name === 'audio' && AU) AU.step = 0;
    if (name === 'review' && R && R.queue.length) { R.dir = v; R.qa = qa(cardIdx.get(R.queue[0]).c, v); R.shown = false; }
    toast(dirLabels(el.dataset.l || undefined)[v][1]);
    render(true);
  },
  'set-active': el => { setActive(el.dataset.id); closeModal(); render(); },
  lang: el => switchLang(el.dataset.l),
  'lvl-toggle': el => { const k = curLang() + ':' + el.dataset.l; db.settings.open[k] = !levelOpen(el.dataset.l); saveSoon(); render(true); },
  'pick-deck': () => deckPicker(),
  'open-deck': el => go('deck', { id: el.dataset.id }),
  'deck-filter': el => { cur().f = el.dataset.f; render(true); },
  mode: el => startMode(el.dataset.mode, el.dataset.deck),
  'deck-add': () => openModal(`<h3>Добавить</h3>
    <button class="mrow" data-act="deck-new"><b>📘</b><span>Новый набор<small>Пустой, карточки добавите вручную</small></span>${I.chev}</button>
    <button class="mrow" data-act="imp-open"><b>📥</b><span>Импорт текстом<small>Вставить список слов или загрузить файл</small></span>${I.chev}</button>
    <button class="mrow" data-act="restore-builtin"><b>♻️</b><span>Вернуть встроенные наборы<small>Если вы что-то удалили</small></span>${I.chev}</button>`),
  'deck-new': () => deckForm(null),
  'imp-open': () => { closeModal(); go('import', {}); },
  'restore-builtin': () => {
    closeModal();
    db.hidden = {}; db.removed = {};
    rebuild(); save(); render();
    toast('Встроенные наборы и слова восстановлены');
  },
  'deck-menu': el => {
    const d = deckById(el.dataset.id);
    openModal(`<h3>${esc(d.emoji)} ${esc(d.title)}</h3>
      <button class="mrow" data-act="deck-edit" data-id="${esc(d.id)}"><b>✏️</b><span>Название и языки</span>${I.chev}</button>
      <button class="mrow" data-act="card-new" data-deck="${esc(d.id)}"><b>➕</b><span>Добавить карточку</span>${I.chev}</button>
      <button class="mrow" data-act="deck-import" data-id="${esc(d.id)}"><b>📥</b><span>Импорт в этот набор</span>${I.chev}</button>
      <button class="mrow" data-act="deck-export" data-id="${esc(d.id)}"><b>📤</b><span>Экспорт текстом<small>Поделиться набором или перенести в Quizlet</small></span>${I.chev}</button>
      <button class="mrow" data-act="deck-swap" data-id="${esc(d.id)}"><b>🔄</b><span>Поменять стороны всех карточек</span>${I.chev}</button>
      <button class="mrow" data-act="deck-reset" data-id="${esc(d.id)}"><b>↩️</b><span>Сбросить прогресс набора</span>${I.chev}</button>
      <button class="mrow danger-t" data-act="deck-del" data-id="${esc(d.id)}"><b>🗑️</b><span>Удалить набор</span>${I.chev}</button>`);
  },
  'deck-edit': el => deckForm(deckById(el.dataset.id)),
  'deck-import': el => { closeModal(); go('import', { deck: el.dataset.id }); },
  'deck-export': el => { closeModal(); const d = deckById(el.dataset.id); shareText(exportDeckText(d), d.title); },
  'deck-swap': el => {
    const d = deckById(el.dataset.id);
    confirmBox('Поменять местами слово и перевод во всех карточках набора?', 'Поменять', () => {
      d.cards.forEach(c => editCard(c, { t: c.d, d: c.t }));
      editDeck(d, { front: d.back, back: d.front });
      render(true);
    }, false);
  },
  'deck-reset': el => {
    const d = deckById(el.dataset.id);
    confirmBox(`Сбросить прогресс по ${nWords(d.cards.length)} набора «${esc(d.title)}»?`, 'Сбросить', () => {
      d.cards.forEach(c => { delete db.prog[c.id]; });
      delete db.lessons[d.id];
      saveSoon(); render(true);
    });
  },
  'deck-del': el => {
    const d = deckById(el.dataset.id);
    confirmBox(`Удалить набор «${esc(d.title)}» и все его карточки?`, 'Удалить', () => {
      if (d.builtin) db.hidden[d.id] = 1;
      else db.decks = db.decks.filter(x => x !== d);
      d.cards.forEach(c => { delete db.prog[c.id]; });
      delete db.lessons[d.id];
      rebuild(); saveSoon();
      back(true);
    });
  },
  'edit-card': el => { const x = cardIdx.get(el.dataset.id); if (x) cardForm(x.c, x.d.id); },
  'card-new': el => cardForm(null, el.dataset.deck),
  'card-del': el => {
    const x = cardIdx.get(el.dataset.id);
    if (!x) return;
    confirmBox(`Удалить карточку «${esc(x.c.t)}»?`, 'Удалить', () => {
      removeCard(x.d, x.c);
      closeModal(); render(true);
    });
  },
  'imp-sep': el => { const c = cur(); readImportForm(c); c.sep = el.dataset.v; render(true); },
  'imp-do': () => {
    const c = cur();
    readImportForm(c);
    const items = parseImport(c.text, c.sep || 'auto', c.swap);
    if (!items.length) { toast('Не удалось распознать ни одной карточки'); return; }
    let d = c.deck ? deckById(c.deck) : null;
    if (!d) {
      const front = c.front || LANGS[curLang()].front;
      d = { id: 'u' + uid(), title: (c.title || '').trim() || 'Мой набор', emoji: '📘', desc: '', level: c.level || '', front, back: c.back || 'ru-RU', lang: langOfCode(front), created: now(), cards: [] };
      db.decks.unshift(d);
      rebuild();
      d = deckById(d.id);
    }
    items.forEach(x => addCard(d, { id: 'c' + uid(), ...x }, true));
    reindex(); save();
    toast(`Добавлено: ${nCards(items.length)}`);
    stack.pop();
    if (cur().name === 'deck' && cur().id === d.id) render();
    else go('deck', { id: d.id });
  },
  'node': el => nodeSheet(activeDeck(), Number(el.dataset.n)),
  'lesson-start': el => startLesson(el.dataset.deck, Number(el.dataset.n)),
  // упражнения
  'ex-next': () => nextEx(),
  'ex-opt': el => { if (S.fb) return; const ex = S.cur; ex.picked = Number(el.dataset.i); answer(ex.opts[ex.picked] === ex.a); },
  'ex-tf': el => { if (S.fb) return; const ex = S.cur; ex.picked = el.dataset.v === '1'; answer(ex.picked === ex.truth); },
  'ex-dunno': () => { const ex = S.cur; if (ex.type === 'scramble') ex.fill = []; answer(false, { dunno: true }); },
  'ex-hint': () => { const ex = S.cur; ex.typed = $('#ans')?.value || ''; ex.hint = Math.min(ex.a.length, (ex.hint || 0) + 1); render(true); },
  'ex-tr': () => { const ex = S.cur; ex.typed = $('#ans')?.value || ''; ex.showTr = true; render(true); },
  'ex-check': () => {
    if (!S || S.fb) { if (S && S.fb) nextEx(); return; }
    const ex = S.cur;
    const v = $('#ans')?.value || '';
    if (!v.trim()) { toast('Введите ответ или нажмите «Не знаю»'); return; }
    ex.typed = v;
    if (ex.acc) {
      if (gramCheck(v, ex.acc)) { answer(true); return; }
      const fix = gramFix(v, ex.acc);
      if (fix) { ex.a = fix; answer(true, { typo: true }); } else answer(false);
      return;
    }
    const r = checkAnswer(v, ex.a);
    answer(r.ok, { typo: r.typo });
  },
  'ex-over': () => overrideAnswer(),
  'go-add': el => {
    const ex = S.cur;
    if (S.fb) return;
    ex.fill.push(Number(el.dataset.i));
    if (ex.fill.length === ex.tiles.length) { ex.typed = ex.fill.map(i => ex.tiles[i]).join(' '); answer(gramCheck(ex.typed, ex.acc)); } else render(true);
  },
  'go-del': el => { const ex = S.cur; if (S.fb) return; ex.fill.splice(Number(el.dataset.k), 1); render(true); },
  gtopic: el => go('gtopic', { id: el.dataset.id }),
  gstart: el => startGramTopic(el.dataset.id),
  exam: el => go('exam', { lv: el.dataset.lv }),
  'exam-start': el => startExam(el.dataset.lv),
  marathon: el => startMarathon(el.dataset.lv),
  'scr-add': el => {
    const ex = S.cur;
    ex.fill.push(Number(el.dataset.i));
    if (ex.fill.length === ex.slots.length) {
      const built = ex.fill.map(i => ex.tiles[i]).join('').toLowerCase();
      const target = ex.slots.map(i => ex.chars[i]).join('').toLowerCase();
      answer(built === target);
    } else render(true);
  },
  'scr-del': el => { const ex = S.cur; if (S.fb) return; ex.fill.splice(Number(el.dataset.k), 1); render(true); },
  'scr-clear': () => { S.cur.fill = []; render(true); },
  'scr-hint': () => {
    const ex = S.cur;
    // Оставляем верное начало, ставим следующую правильную букву.
    let k = 0;
    while (k < ex.fill.length && ex.tiles[ex.fill[k]].toLowerCase() === ex.chars[ex.slots[k]].toLowerCase()) k++;
    ex.fill = ex.fill.slice(0, k);
    const need = ex.chars[ex.slots[k]].toLowerCase();
    const ti = ex.tiles.findIndex((ch, i) => ch.toLowerCase() === need && !ex.fill.includes(i));
    if (ti >= 0) A['scr-add']({ dataset: { i: ti } });
  },
  'ex-match': el => {
    const ex = S.cur;
    if (S.fb) return;
    const side = el.dataset.side, i = Number(el.dataset.i);
    const item = (side === 'L' ? ex.left : ex.right)[i];
    if (side === 'L') speak(item.text, langsOf(cardIdx.get(item.id).c).fl);
    if (!ex.sel || ex.sel.side === side) { ex.sel = { side, i }; render(true); return; }
    const other = (ex.sel.side === 'L' ? ex.left : ex.right)[ex.sel.i];
    if (other.id === item.id) {
      ex.done.push(item.id);
      ex.sel = null;
      vibrate(15);
      if (ex.done.length === ex.cards.length) {
        ex.cards.forEach(c => practice(c.id, !ex.badIds.includes(c.id)));
        ex.noGrade = true;
        answer(ex.errors === 0);
        return;
      }
    } else {
      ex.errors++;
      ex.badIds.push(other.id, item.id);
      ex.flash = [ex.sel, { side, i }];
      ex.sel = null;
      beep(false);
      setTimeout(() => { if (S && S.cur === ex) { ex.flash = null; render(true); } }, 450);
    }
    render(true);
  },
  'done-next': () => { const r = cur().res; if (!r.next) return; stack.pop(); r.next(); },
  'done-again': () => { const r = cur().res; if (!r.again) return; stack.pop(); r.again(); },
  'done-mist': () => { const r = cur().res; stack.pop(); startMode('learn', r.deck || '@all', r.mist); },
  // повторение
  'rv-show': () => { R.shown = true; render(true); if (db.settings.autoplay) speak(R.qa.a, R.qa.al); },
  'rv-grade': el => reviewGrade(Number(el.dataset.q)),
  // карточки
  'fl-flip': el => { if (el.dataset.swiped) return; F.flip = !F.flip; render(true); if (F.flip && db.settings.autoplay) speak(F.qa[F.i].a, F.qa[F.i].al); },
  'fl-mark': el => flMark(el.dataset.v === '1'),
  'fl-undo': () => {
    const h = F.hist.pop();
    if (!h) return;
    F.i = h.i; F.flip = false;
    if (h.v === true) F.know.pop(); else if (h.v === false) F.learn.pop();
    render(true);
  },
  'fl-shuffle': () => {
    F.shuffled = !F.shuffled;
    const rest = F.cards.slice(F.i);
    const ordered = F.shuffled ? shuffle(rest) : F.all.filter(c => rest.includes(c));
    F.cards = [...F.cards.slice(0, F.i), ...ordered];
    F.qa = F.cards.map(c => qa(c, F.dir));
    render(true);
  },
  'fl-auto': () => { F.auto = !F.auto; stopTimers(); render(true); },
  'fl-relearn': () => { const l = F.learn; F.cards = shuffle(l); F.qa = F.cards.map(c => qa(c, F.dir)); F.i = 0; F.know = []; F.learn = []; F.hist = []; F.flip = false; render(); },
  'fl-restart': () => { F.cards = F.shuffled ? shuffle(F.all) : [...F.all]; F.qa = F.cards.map(c => qa(c, F.dir)); F.i = 0; F.know = []; F.learn = []; F.hist = []; F.flip = false; render(); },
  'fl-learnmode': () => { const l = F.learn, id = F.deckId; stack.pop(); startMode('learn', id, l); },
  // подбор и спринт
  'mg-tap': el => mgTap(Number(el.dataset.i)),
  'mg-again': () => { const d = getDeck(MG.deckId) || { id: MG.deckId, cards: MG.cards }; const cards = MG.cards; stack.pop(); startMatchGame(d, cards); },
  'sp-ans': el => spAnswer(el.dataset.v === '1'),
  'gv-check': () => gvCheck(),
  'gv-again': () => { const d = getDeck(GV.deckId) || { id: GV.deckId }; const cards = GV.cards; stack.pop(); startGravity(d, cards); },
  'au-toggle': () => { AU.play = !AU.play; if (AU.play) { if (AU.step >= auSteps(AU.cards[AU.i]).length) AU.step = 0; auRun(); } else { AU.tok++; if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) {} render(true); } },
  'au-next': () => auJump(1),
  'au-prev': () => auJump(-1),
  'au-ex': () => { AU.ex = !AU.ex; render(true); },
  'sp-again': () => { const d = getDeck(SP.deckId) || { id: SP.deckId }; const cards = SP.cards; stack.pop(); startSprint(d, cards); },
  // тест
  't-start': () => buildTest(cur()),
  't-ans': el => { T.ans[Number(el.dataset.q)] = Number(el.dataset.v); render(true); },
  't-submit': () => {
    const total = T.qs.length;
    const answered = T.qs.filter((q, i) => T.ans[i] !== undefined && T.ans[i] !== '').length;
    if (answered < total) confirmBox(`Отвечено ${answered} из ${total} блоков. Проверить тест?`, 'Проверить', submitTest, false);
    else submitTest();
  },
  't-learn': () => { const ids = T.wrongIds; const deck = T.deck; startMode('learn', deck, [...new Set(ids)].map(id => cardIdx.get(id)?.c).filter(Boolean)); },
  't-new': () => { const s = T.setup; replace('testsetup', { deck: s.deck, ids: s.ids, n: s.n, types: s.types }); },
  // настройки и копия
  'reset-progress': () => confirmBox('Сбросить прогресс всех слов, уроков и статистику? Наборы останутся.', 'Сбросить', () => {
    db.prog = {}; db.lessons = {}; db.days = {}; db.best = {}; db.flags = {};
    save(); tab('home'); toast('Прогресс сброшен');
  }),
  'reset-all': () => confirmBox('Удалить все наборы, прогресс и настройки? Встроенные наборы появятся заново.', 'Удалить всё', () => {
    localStorage.removeItem(KEY); load(); applyTheme(); save(); tab('home'); toast('Данные удалены');
  }),
  'bk-save': () => { save(); saveFile(`mnemo-backup-${dayKey(now())}.json`, JSON.stringify(db)); },
  'bk-share': () => { save(); shareText(JSON.stringify(db), 'Мнемо — резервная копия'); },
  'bk-paste': () => { const t = $('#bk-text').value.trim(); if (!t) { toast('Вставьте текст копии'); return; } restoreBackup(t); },
  'copy-url': () => copyText(location.href.split('#')[0]),
};

document.addEventListener('click', e => {
  const m = $('#modal');
  if (e.target === m) { closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  try { fn(el, e); } catch (err) { console.error(err); toast('Ошибка: ' + err.message); }
});
document.addEventListener('input', e => {
  const el = e.target;
  const k = el.dataset.in;
  if (!k) return;
  if (k === 'dsearch') {
    const c = cur(); c.q = el.value;
    const q = c.q.toLowerCase();
    $('#dlist').innerHTML = decksHtml(q);
  } else if (k === 't-n') { cur().n = Number(el.value); $('#t-n').textContent = el.value; }
  else if (k === 't-wr') { T.ans[Number(el.dataset.q)] = el.value; }
  else if (k === 'rate') { db.settings.rate = Number(el.value); $('#rate-v').textContent = Number(el.value).toFixed(1); saveSoon(); }
});
let impT = 0;
document.addEventListener('input', e => {
  if (e.target.id === 'imp-text' || e.target.id === 'imp-swap') { clearTimeout(impT); impT = setTimeout(() => updateImportPreview(cur()), 150); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'imp-swap') { updateImportPreview(cur()); return; }
  if (el.dataset.file) { readFile(el); return; }
  const k = el.dataset.ch;
  if (!k) return;
  if (k === 'set-bool') { db.settings[el.dataset.k] = el.checked; saveSoon(); }
  else if (k === 't-type') { cur().types[el.dataset.k] = el.checked; }
  else if (k === 't-mt') { const qi = Number(el.dataset.q); T.ans[qi] = T.ans[qi] || {}; T.ans[qi][el.dataset.k] = el.value === '' ? '' : Number(el.value); }
});
function readFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    const text = String(r.result || '');
    if (input.dataset.file === 'backup') restoreBackup(text);
    else {
      const c = cur();
      readImportForm(c);
      c.text = text;
      if (!c.deck && !c.title) c.title = f.name.replace(/\.[^.]+$/, '');
      render(true);
    }
  };
  r.readAsText(f);
  input.value = '';
}
document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  const v = name => (f.elements[name]?.value || '').trim();
  if (f.dataset.form === 'deck') {
    let d = f.dataset.id && deckById(f.dataset.id);
    const isNew = !d;
    const fields = { title: v('title') || 'Мой набор', emoji: v('emoji') || '📘', desc: v('desc'), front: v('front'), back: v('back') };
    if (f.elements.level) fields.level = v('level');
    if (!d) { d = { id: 'u' + uid(), created: now(), cards: [], ...fields, lang: langOfCode(fields.front) }; db.decks.unshift(d); }
    else { if (!d.builtin) fields.lang = langOfCode(fields.front); editDeck(d, fields); }
    if (d.lang !== curLang()) { db.settings.lang = d.lang; ensureLang(d.lang).then(() => render(true)); }
    rebuild(); saveSoon(); closeModal();
    if (isNew) { go('deck', { id: d.id }); cardForm(null, d.id); } else render(true);
  } else if (f.dataset.form === 'card') {
    const t = v('t'), d = v('d');
    if (!t || !d) return;
    const fields = { t, d, ex: v('ex'), exT: v('exT'), note: v('note') };
    if (f.dataset.id) {
      editCard(cardIdx.get(f.dataset.id).c, fields);
      closeModal();
      if (S && S.cur && S.cur.c && S.cur.c.id === f.dataset.id) S.cur.c = cardIdx.get(f.dataset.id).c;
      render(true);
    } else {
      const deck = deckById(f.dataset.deck);
      if (!deck) return;
      addCard(deck, { id: 'c' + uid(), ...fields });
      toast(`Добавлено: ${t}`);
      f.reset();
      f.elements.t.focus();
      render(true);
    }
  }
});
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); A[e.target.dataset.enter](); return; }
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const name = cur().name;
  if (e.key === 'Escape') { back(); return; }
  if (name === 'run' && S) {
    if (S.fb && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nextEx(); return; }
    const n = Number(e.key);
    if (!S.fb && n >= 1 && n <= 4 && S.cur.opts) { const b = $$('.opt')[n - 1]; if (b) b.click(); }
    if (!S.fb && S.cur.type === 'intro' && e.key === 'Enter') nextEx();
  } else if (name === 'flash' && F && F.i < F.cards.length) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); F.flip = !F.flip; render(true); }
    if (e.key === 'ArrowRight') flMark(true);
    if (e.key === 'ArrowLeft') flMark(false);
  } else if (name === 'review' && R) {
    if (!R.shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); A['rv-show'](); }
    else if (R.shown && ['1', '2', '3', '4'].includes(e.key)) reviewGrade(Number(e.key) - 1);
  } else if (name === 'sprint' && SP && !SP.over) {
    if (e.key === 'ArrowLeft') spAnswer(false);
    if (e.key === 'ArrowRight') spAnswer(true);
  }
});

/* ───────────────────────── Старт ───────────────────────── */
buildBuiltin();
load();
applyTheme();
render();
save();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.__mnemo = { get db() { return db; }, get decks() { return DECKS; }, get S() { return S; }, get R() { return R; }, get GV() { return GV; }, get AU() { return AU; }, checkAnswer, parseImport, lessonNodes, buildLesson, clozeOf, nextState, answer, nextEx, go, gramCheck, mdLite };
})();
