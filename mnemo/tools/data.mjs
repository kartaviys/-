// Проверка и сборка словарей Мнемо.
//   node mnemo/tools/data.mjs          — статистика и проверка (код выхода 1 при ошибках или устаревших пакетах)
//   node mnemo/tools/data.mjs --fix    — удалить повторы слов, собрать пакеты и обновить index.html
//
// Исходники словарей лежат в app/src/main/vocab/{язык}-{уровень}-{часть}.js.
// В приложение попадают только пакеты www/data/pack-{язык}.js — по одному на язык.
// При запуске приложение грузит пакет текущего языка, остальные — при переключении вкладки.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '../app/src/main');
const SRC = join(MAIN, 'vocab');
const WWW = join(MAIN, 'assets/www');
const OUT = join(WWW, 'data');
const fix = process.argv.includes('--fix');
const LANG_ORDER = ['en', 'it', 'uk', 'de'];
const LEVELS = ['a0', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

// Порядок: en-core, затем по языку, уровню и номеру части.
const rank = f => {
  const m = /^([a-z]+)-([a-z0-9]+)(?:-(\d+))?\.js$/.exec(f);
  if (!m) return [99, 99, 0, f];
  const li = LANG_ORDER.indexOf(m[1]);
  const lv = m[2] === 'core' ? -1 : LEVELS.indexOf(m[2]);
  return [li < 0 ? 98 : li, lv, Number(m[3] || 0), f];
};
const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
const files = readdirSync(SRC).filter(f => f.endsWith('.js')).sort(cmp);

let errors = 0;
const seen = new Map();
const stats = {};
const packs = {};
for (const f of files) {
  const path = join(SRC, f);
  let text = readFileSync(path, 'utf8');
  const ctx = { window: {} };
  try { vm.runInNewContext(text, ctx, { filename: f }); } catch (e) { console.log(`✗ ${f}: ${e.message}`); errors++; continue; }
  const decks = ctx.window.MNEMO_DECKS || [];
  const removed = new Set();
  for (const d of decks) {
    if (!d.lang || !d.id || !d.title) { console.log(`✗ ${f}: у набора нет lang/id/title`, d.id); errors++; }
    let n = 0;
    for (const raw of String(d.cards).split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const p = line.split('|').map(s => s.trim());
      if (p.length < 2 || !p[0] || !p[1]) { console.log(`✗ ${f} [${d.id}]: плохая строка: ${line}`); errors++; continue; }
      const key = `${d.lang}:${p[0]}`;
      if (seen.has(key)) {
        if (fix) removed.add(raw);
        else { console.log(`  повтор ${key} в ${d.id} (уже в ${seen.get(key)})`); errors++; }
        continue;
      }
      seen.set(key, d.id);
      n++;
    }
    const s = (stats[d.lang] ||= {});
    s[d.level || '—'] = (s[d.level || '—'] || 0) + n;
  }
  if (fix && removed.size) {
    text = text.split('\n').filter(l => !removed.has(l.trim()) || !l.includes('|')).join('\n');
    writeFileSync(path, text);
    console.log(`${f}: удалено повторов ${removed.size}`);
  }
  const lang = f.split('-')[0];
  (packs[lang] ||= []).push(`/* ${f} */\n${text.trim()}\n`);
}

// Грамматика: app/src/main/grammar/{язык}.json → www/data/grammar-{язык}.js
const GRAM = join(MAIN, 'grammar');
const gramLangs = [];
const LV_OK = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
if (!existsSync(OUT)) mkdirSync(OUT);
for (const f of existsSync(GRAM) ? readdirSync(GRAM).filter(f => /^[a-z]+\.json$/.test(f)) : []) {
  const l = f.slice(0, -5);
  let topics;
  try { topics = JSON.parse(readFileSync(join(GRAM, f), 'utf8')); } catch (e) { console.log(`✗ grammar/${f}: ${e.message}`); errors++; continue; }
  const ids = new Set();
  let qn = 0;
  for (const t of topics) {
    if (!t.id || !LV_OK.includes(t.lv) || !t.t || !t.x || !Array.isArray(t.q)) { console.log(`✗ grammar/${f}: тема без id/lv/t/x/q`, t.id); errors++; continue; }
    if (ids.has(t.id)) { console.log(`✗ grammar/${f}: повтор id ${t.id}`); errors++; }
    ids.add(t.id);
    for (const q of t.q) {
      qn++;
      const bad = q.k === 'mc' ? !(Array.isArray(q.o) && Number.isInteger(q.a) && q.o[q.a] !== undefined && q.s)
        : q.k === 'type' ? !(q.s && /___/.test(q.s) && Array.isArray(q.a) && q.a.length)
        : q.k === 'order' ? !(Array.isArray(q.w) && Array.isArray(q.a) && q.a.length)
        : q.k === 'tr' ? !(q.ru && Array.isArray(q.a) && q.a.length) : true;
      if (bad) { console.log(`✗ grammar/${f} [${t.id}]: плохое упражнение`, JSON.stringify(q).slice(0, 120)); errors++; }
    }
  }
  const body = `/* Сгенерировано mnemo/tools/data.mjs из app/src/main/grammar/${f} — не редактируйте вручную. */\n(window.MNEMO_GRAMMAR = window.MNEMO_GRAMMAR || {}).${l} = ${JSON.stringify(topics)};\n`;
  const p = join(OUT, `grammar-${l}.js`);
  if ((existsSync(p) ? readFileSync(p, 'utf8') : '') !== body) {
    if (fix) { writeFileSync(p, body); console.log(`data/grammar-${l}.js собран: ${topics.length} тем, ${qn} упражнений`); }
    else { console.log(`✗ data/grammar-${l}.js устарел (запустите с --fix)`); errors++; }
  }
  gramLangs.push(l);
}

// Пакеты по языкам
const langs = Object.keys(packs).sort((a, b) => LANG_ORDER.indexOf(a) - LANG_ORDER.indexOf(b));
for (const l of langs) {
  const body = `/* Сгенерировано mnemo/tools/data.mjs из app/src/main/vocab/${l}-*.js — не редактируйте вручную. */\n` +
    packs[l].join('') + `(window.MNEMO_LOADED = window.MNEMO_LOADED || {}).${l} = 1;\n`;
  const p = join(OUT, `pack-${l}.js`);
  const old = existsSync(p) ? readFileSync(p, 'utf8') : '';
  if (old !== body) {
    if (fix) { writeFileSync(p, body); console.log(`data/pack-${l}.js собран (${Math.round(body.length / 1024)} КБ)`); }
    else { console.log(`✗ data/pack-${l}.js устарел (запустите с --fix)`); errors++; }
  }
}
for (const f of readdirSync(OUT)) {
  const okPack = /^pack-[a-z]+\.js$/.test(f) && langs.includes(f.slice(5, -3));
  const okGram = /^grammar-[a-z]+\.js$/.test(f) && gramLangs.includes(f.slice(8, -3));
  if (!okPack && !okGram) { console.log(`✗ лишний файл www/data/${f}`); errors++; }
}

// index.html: загрузчик пакета текущего языка + prefetch, чтобы service worker закэшировал все пакеты.
// (Строку src=" в загрузчике намеренно разбиваем — иначе её «увидит» precache в sw.js.)
const loader = `<script>
/* Грузим словарь только текущего языка (остальные — при переключении вкладки). */
(function () {
  window.MNEMO_PACKS = ${JSON.stringify(langs)}; var all = window.MNEMO_PACKS, gram = ${JSON.stringify(gramLangs)}, lang = 'en', need = [];
  try {
    var s = JSON.parse(localStorage.getItem('mnemo.v1') || 'null');
    if (s && s.settings && s.settings.lang) lang = s.settings.lang;
    if (s && (s.seeded || (s.decks || []).some(function (d) { return d.builtin; }))) need.push('en'); // старый формат — нужен английский для переноса
  } catch (e) {}
  if (all.indexOf(lang) >= 0) need.unshift(lang);
  if (!need.length) need.push('en');
  for (var i = 0; i < need.length; i++) if (need.indexOf(need[i]) === i) {
    document.write('<script src=' + '"data/pack-' + need[i] + '.js"><\\/script>');
    if (gram.indexOf(need[i]) >= 0) document.write('<script src=' + '"data/grammar-' + need[i] + '.js"><\\/script>');
  }
})();
</script>
${langs.map(l => `<link rel="prefetch" href="data/pack-${l}.js">`).concat(gramLangs.map(l => `<link rel="prefetch" href="data/grammar-${l}.js">`)).join('\n')}`;
const idxPath = join(WWW, 'index.html');
let html = readFileSync(idxPath, 'utf8');
const re = /<!-- data:start -->[\s\S]*?<!-- data:end -->/;
const block = `<!-- data:start -->\n${loader}\n<!-- data:end -->`;
if (!re.test(html)) { console.log('✗ в index.html нет маркеров data:start/data:end'); errors++; }
else if (html.match(re)[0] !== block) {
  if (fix) { html = html.replace(re, block); writeFileSync(idxPath, html); }
  else { console.log('✗ index.html устарел (запустите с --fix)'); errors++; }
}

let total = 0;
for (const [lang, s] of Object.entries(stats)) {
  const sum = Object.values(s).reduce((a, b) => a + b, 0);
  total += sum;
  console.log(`${lang}: ${sum} слов — ` + Object.entries(s).sort().map(([k, v]) => `${k} ${v}`).join(', '));
}
console.log(`Всего: ${total} карточек в ${files.length} файлах`);
process.exit(errors ? 1 : 0);
