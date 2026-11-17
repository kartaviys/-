// Временная проверка: открываем выдачу каждого сайта настоящим браузером и смотрим, какие там ссылки на вакансии.
import { chromium } from 'playwright';
const Q = 'data scientist';
const e = encodeURIComponent(Q);
const SITES = {
  superjob: `https://www.superjob.ru/vacancy/search/?keywords=${e}`,
  rabota_ru: `https://www.rabota.ru/vacancy/?query=${e}`,
  geekjob: `https://geekjob.ru/vacancies?qs=${e}`,
  yandex: `https://yandex.ru/jobs/vacancies?text=${e}`,
  sber: `https://rabota.sber.ru/search/?query=${e}`,
  tbank: `https://www.tbank.ru/career/it/vacancies/?query=${e}`,
  ozon: `https://career.ozon.ru/vacancy/?query=${e}`,
  vk: `https://team.vk.company/vacancy/?search=${e}`,
  avito: `https://career.avito.com/vacancies/?q=${e}`,
  mts: `https://job.mts.ru/vacancies?search=${e}`,
  kaspersky: `https://careers.kaspersky.ru/vacancy?search=${e}`,
  wb: `https://career.rwb.ru/vacancies?search=${e}`,
  x5: `https://x5.tech/vacancy?search=${e}`,
  alfa: `https://alfabank.ru/hr/vacancies/?search=${e}`,
  dice: `https://www.dice.com/jobs?q=${e}`,
  builtin: `https://builtin.com/jobs?search=${e}`,
  wellfound: `https://wellfound.com/role/data-scientist`,
  indeed: `https://www.indeed.com/jobs?q=${e}`,
  simplyhired: `https://www.simplyhired.com/search?q=${e}`,
  ziprecruiter: `https://www.ziprecruiter.com/jobs-search?search=${e}`,
  bayt: `https://www.bayt.com/en/uae/jobs/data-scientist-jobs/`,
  gulftalent: `https://www.gulftalent.com/uae/jobs/title/data-scientist`,
  naukrigulf: `https://www.naukrigulf.com/data-scientist-jobs-in-uae`,
  indeed_ae: `https://ae.indeed.com/jobs?q=${e}`,
  stepstone: `https://www.stepstone.de/jobs/data-scientist`,
  relocate: `https://relocate.me/search?query=${e}`,
  wttj: `https://www.welcometothejungle.com/en/jobs?query=${e}`,
  eures: `https://europa.eu/eures/portal/jv-se/search?keywordsEverywhere=${e}`,
};
const shape = u => { try { const x = new URL(u); return x.host + x.pathname.replace(/\d{3,}/g, 'N').replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/g, 'UUID').replace(/\/[a-z0-9-]{25,}/g, '/SLUG'); } catch { return u; } };
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', locale: 'ru-RU', viewport: { width: 412, height: 915 } });
for (const [name, url] of Object.entries(SITES)) {
  const page = await ctx.newPage();
  let status = '?';
  try {
    const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    status = r ? r.status() : '?';
    await page.waitForTimeout(6000);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 2500); await page.waitForTimeout(1200); }
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => ({ h: a.href, t: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70) })));
    const title = await page.title();
    const groups = {};
    for (const l of links) { const s = shape(l.h); (groups[s] = groups[s] || []).push(l); }
    const top = Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 7);
    console.log(`\n### ${name} status=${status} final=${page.url().slice(0, 100)} title="${title.slice(0, 60)}" links=${links.length}`);
    for (const [s, ls] of top) console.log(`  ${ls.length}× ${s}  e.g. ${ls.slice(0, 2).map(l => l.h.slice(0, 110) + ' «' + l.t + '»').join(' | ')}`);
  } catch (err) {
    console.log(`\n### ${name} ERROR ${String(err).slice(0, 150)}`);
  }
  await page.close();
}
await browser.close();
// rerun
