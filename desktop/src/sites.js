// Описания сайтов для общего агента (как Sites.kt в Android). verified — формат ссылок проверен на реальной выдаче.
const e = encodeURIComponent;
const slug = s => String(s).trim().toLowerCase().replace(/[^a-z0-9а-яё]+/g, '-').replace(/^-+|-+$/g, '');
const pg = (p, param, base = 1) => (p > 0 ? `${param}${p + base}` : '');

const RU = ['data scientist', 'ml engineer', 'machine learning', 'ai engineer', 'nlp', 'аналитик данных'];
const EN = ['data scientist', 'machine learning engineer', 'ml engineer', 'ai engineer', 'nlp engineer', 'data analyst'];
const COMPANY = ['data scientist', 'machine learning'];

const G = { RU: 'Россия — площадки', RU_CO: 'Россия — сайты компаний', US: 'США', UAE: 'ОАЭ', EU: 'Европа и релокация' };

const SITES = [
  // Россия — площадки
  { key: 'superjob', name: 'SuperJob', group: G.RU, login: 'https://www.superjob.ru/auth/login/', paged: true, verified: true,
    search: (q, p) => `https://www.superjob.ru/vacancy/search/?keywords=${e(q)}${pg(p, '&page=')}`, link: 'superjob\\.ru/vakansii/[^/?#]+-(\\d{6,})\\.html' },
  { key: 'geekjob', name: 'GeekJob', group: G.RU, login: 'https://geekjob.ru/login', paged: true, verified: true,
    search: (q, p) => `https://geekjob.ru/vacancies?qs=${e(q)}${pg(p, '&page=')}`, link: 'geekjob\\.ru/vacancy/([0-9a-f]{24})' },
  { key: 'rabota_ru', name: 'Работа.ру', group: G.RU, login: 'https://www.rabota.ru/auth/', paged: true, verified: false,
    search: (q, p) => `https://www.rabota.ru/vacancy/?query=${e(q)}${pg(p, '&page=')}`, link: 'rabota\\.ru/vacancy/(\\d{5,})' },
  { key: 'getmatch_site', name: 'GetMatch', group: G.RU, login: 'https://getmatch.ru/login', paged: true, verified: true,
    search: (q, p) => `https://getmatch.ru/vacancies?q=${e(q)}${pg(p, '&p=')}`, link: 'getmatch\\.ru/vacancies/(\\d+)' },
  // Россия — сайты компаний
  { key: 'yandex', name: 'Яндекс', group: G.RU_CO, login: 'https://passport.yandex.ru/auth', verified: false,
    search: q => `https://yandex.ru/jobs/vacancies?text=${e(q)}`, link: 'yandex\\.ru/jobs/vacancies/[a-z0-9-]*?(\\d{3,})(?:[/?#]|$)' },
  { key: 'sber', name: 'Сбер', group: G.RU_CO, verified: false,
    search: q => `https://rabota.sber.ru/search/?query=${e(q)}`, link: 'rabota\\.sber\\.ru/search/(\\d{4,})' },
  { key: 'tbank', name: 'Т-Банк', group: G.RU_CO, verified: false,
    search: q => `https://www.tbank.ru/career/it/vacancies/?query=${e(q)}`, link: 'tbank\\.ru/career/[^?#]*vacanc[^?#]*/[a-z0-9-]{6,}',
    note: 'Сайт Т-Банка использует российский сертификат: если не открывается, установите сертификат Минцифры в систему.' },
  { key: 'ozon', name: 'Ozon', group: G.RU_CO, verified: false,
    search: q => `https://career.ozon.ru/vacancy/?query=${e(q)}`, link: 'career\\.ozon\\.ru/vacancy/(\\d{3,})' },
  { key: 'vk', name: 'VK', group: G.RU_CO, verified: false,
    search: q => `https://team.vk.company/vacancy/?search=${e(q)}`, link: 'team\\.vk\\.company/vacancy/(\\d{3,})' },
  { key: 'avito', name: 'Авито', group: G.RU_CO, verified: true, noQuery: true,
    search: q => `https://career.avito.com/vacancies/?q=${e(q)}`, link: 'career\\.avito\\.com/vacancies/[a-z-]+/(\\d{3,})/' },
  { key: 'mts', name: 'МТС', group: G.RU_CO, verified: false,
    search: q => `https://job.mts.ru/vacancies?search=${e(q)}`, link: 'job\\.mts\\.ru/vacanc(?:y|ies)/[a-z0-9-]*\\d{3,}' },
  { key: 'kaspersky', name: 'Лаборатория Касперского', group: G.RU_CO, verified: true, noQuery: true,
    search: q => `https://careers.kaspersky.ru/vacancies?search=${e(q)}`, link: 'careers\\.kaspersky\\.ru/vacancy/([0-9a-f]{4,})' },
  // США
  { key: 'dice', name: 'Dice', group: G.US, english: true, login: 'https://www.dice.com/dashboard/login', paged: true, verified: true,
    search: (q, p) => `https://www.dice.com/jobs?q=${e(q)}${pg(p, '&page=')}`, link: 'dice\\.com/job-detail/([0-9a-f-]{36})' },
  { key: 'builtin', name: 'Built In', group: G.US, english: true, login: 'https://builtin.com/auth/login', paged: true, verified: true,
    search: (q, p) => `https://builtin.com/jobs?search=${e(q)}${pg(p, '&page=')}`, link: 'builtin\\.com/job/[^/?#]+/(\\d{5,})' },
  { key: 'wellfound', name: 'Wellfound (стартапы)', group: G.US, english: true, login: 'https://wellfound.com/login', paged: true, verified: true,
    search: (q, p) => `https://wellfound.com/role/${slug(q)}${pg(p, '?page=')}`, link: 'wellfound\\.com/jobs/(\\d{5,})-' },
  { key: 'indeed', name: 'Indeed (США)', group: G.US, english: true, login: 'https://secure.indeed.com/account/login', paged: true, verified: false,
    search: (q, p) => `https://www.indeed.com/jobs?q=${e(q)}${p > 0 ? `&start=${p * 10}` : ''}`,
    link: 'indeed\\.com/(?:viewjob|rc/clk|pagead/clk)[^"]*?[?&]jk=([0-9a-f]{16})', note: 'Indeed защищён Cloudflare — иногда будет капча.' },
  { key: 'glassdoor', name: 'Glassdoor', group: G.US, english: true, login: 'https://www.glassdoor.com/profile/login_input.htm', verified: false,
    search: q => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${e(q)}`, link: 'glassdoor\\.[a-z.]+/(?:job-listing|partner/jobListing)[^"]*?jl=(\\d{6,})' },
  // ОАЭ
  { key: 'bayt', name: 'Bayt', group: G.UAE, english: true, login: 'https://www.bayt.com/en/login/', paged: true, verified: true,
    search: (q, p) => `https://www.bayt.com/en/uae/jobs/${slug(q)}-jobs/${pg(p, '?page=')}`, link: 'bayt\\.com/en/[a-z-]+/jobs/[a-z0-9-]+-(\\d{6,})/' },
  { key: 'naukrigulf', name: 'Naukrigulf', group: G.UAE, english: true, login: 'https://www.naukrigulf.com/jobseeker/login', paged: true, verified: false,
    search: (q, p) => `https://www.naukrigulf.com/${slug(q)}-jobs-in-uae${pg(p, '-')}`, link: 'naukrigulf\\.com/[a-z0-9-]+-jid-(\\d{6,})' },
  { key: 'gulftalent', name: 'GulfTalent', group: G.UAE, english: true, login: 'https://www.gulftalent.com/login', verified: false,
    search: q => `https://www.gulftalent.com/uae/jobs/title/${slug(q)}`, link: 'gulftalent\\.com/[a-z-]+/jobs/[a-z0-9-]+-(\\d{5,})' },
  { key: 'indeed_ae', name: 'Indeed ОАЭ', group: G.UAE, english: true, login: 'https://secure.indeed.com/account/login', paged: true, verified: false,
    search: (q, p) => `https://ae.indeed.com/jobs?q=${e(q)}${p > 0 ? `&start=${p * 10}` : ''}`,
    link: 'indeed\\.com/(?:viewjob|rc/clk|pagead/clk)[^"]*?[?&]jk=([0-9a-f]{16})' },
  // Европа и релокация
  { key: 'stepstone', name: 'StepStone (Германия)', group: G.EU, english: true, login: 'https://www.stepstone.de/candidate/login', paged: true, verified: false,
    search: (q, p) => `https://www.stepstone.de/jobs/${slug(q)}${pg(p, '?page=')}`, link: 'stepstone\\.de/stellenangebote--[^"?#]*--(\\d{6,})-inline\\.html' },
  { key: 'relocate', name: 'Relocate.me (с релокацией)', group: G.EU, english: true, login: 'https://relocate.me/login', paged: true, verified: true, noQuery: true,
    search: (_q, p) => `https://relocate.me/international-jobs${pg(p, '?page=')}`, link: 'relocate\\.me/[a-z-]+/[a-z-]+/[a-z0-9-]+/[a-z0-9-]+-(\\d{3,})(?:[?#]|$)' },
];

/** Основные агенты со своими сценариями. */
const CORE = [
  { key: 'hh', name: 'hh.ru', group: 'Основные', login: 'https://hh.ru/account/login', verified: true, queriesKey: 'queries', limitKey: 'agent_limit' },
  { key: 'habr', name: 'Хабр Карьера', group: 'Основные', login: 'https://career.habr.com/', verified: true, queriesKey: 'habr_queries', limitKey: 'habr_limit' },
  { key: 'linkedin', name: 'LinkedIn', group: 'Основные', login: 'https://www.linkedin.com/login', verified: true, queriesKey: 'linkedin_queries', limitKey: 'linkedin_limit' },
];

function byKey(key) { return SITES.find(s => s.key === key) || null; }
function agentDef(key) { return CORE.find(c => c.key === key) || byKey(key); }

function queries(store, def) {
  if (def.queriesKey) return store.get(def.queriesKey).split('\n').map(s => s.trim()).filter(Boolean);
  if (def.noQuery) return [''];
  const saved = String(store.get('q_' + def.key)).split('\n').map(s => s.trim()).filter(Boolean);
  return saved.length ? saved : def.group === G.RU_CO ? COMPANY : def.english ? EN : RU;
}
function limit(store, def) {
  if (def.limitKey) return store.int(def.limitKey);
  return parseInt(store.get('limit_' + def.key), 10) || 20;
}

module.exports = { SITES, CORE, G, byKey, agentDef, queries, limit };
