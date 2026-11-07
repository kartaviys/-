"""Временная проверка: какие источники вакансий отвечают и в каком формате."""
import json
import urllib.request

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36"
URLS = {
    "remoteok": "https://remoteok.com/api",
    "remotive": "https://remotive.com/api/remote-jobs?search=machine%20learning&limit=2",
    "himalayas": "https://himalayas.app/jobs/api?limit=2",
    "himalayas_search": "https://himalayas.app/jobs/api/search?q=machine%20learning&limit=2",
    "hn_whoishiring": "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=3",
    "wwr_rss": "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "trudvsem": "https://opendata.trudvsem.ru/api/v1/vacancies?text=machine%20learning&limit=2",
    "superjob": "https://api.superjob.ru/2.0/vacancies/?keyword=data%20scientist&count=1",
    "aijobs_home": "https://aijobs.net/",
    "aijobs_feed": "https://aijobs.net/feed/",
    "aijobs_api": "https://aijobs.net/api/v1/jobs/",
    "landing_jobs": "https://landing.jobs/api/v1/jobs?limit=2",
    "relocateme_rss": "https://relocate.me/rss",
    "habr_api": "https://career.habr.com/api/frontend/vacancies?q=machine%20learning&per_page=2",
    "habr_html": "https://career.habr.com/vacancies?q=machine+learning&type=all",
    "getmatch_api": "https://getmatch.ru/api/offers?sa=150000&p=1&pa=all&skills=python",
    "ods_jobs": "https://ods.ai/jobs",
    "ods_api": "https://ods.ai/api/v1/jobs",
    "geekjob": "https://geekjob.ru/vacancies?qs=machine+learning",
    "geekjob_rss": "https://geekjob.ru/rss",
    "hh_api": "https://api.hh.ru/vacancies?text=ml&per_page=1",
    "eures": "https://europa.eu/eures/eures-apps/searchengine/page/jv-search/search",
    "infojobs_it": "https://www.infojobs.it/",
}
TG = ["getmatch", "datasciencejobs", "ods_jobs", "odsjobs", "mljobs", "datajobschannel", "workindata",
      "foranalysts", "ai_jobs", "jobs_ml", "ml_jobs", "aijobs_ru", "datasciencejobs_ru", "dsjobs",
      "nlp_jobs", "analysts_jobs", "ai_ml_jobs", "remote_ml_jobs", "careerspace", "it_vakansii_jobs",
      "datajobs", "ml_vacancies", "seniorjobs"]
for name in TG:
    URLS["tg_" + name] = f"https://t.me/s/{name}"

for name, url in URLS.items():
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "HH-User-Agent": "probe/1.0 (probe@example.com)",
                                                    "Accept": "application/json, text/html, */*"})
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(400000).decode("utf-8", "replace")
            status = r.status
            ctype = r.headers.get("Content-Type", "")
    except Exception as e:
        print(f"### {name}: ERROR {e}")
        continue
    extra = ""
    if name.startswith("tg_"):
        posts = body.count('class="tgme_widget_message_text')
        extra = f" posts={posts} title={body.split('<title>')[1].split('</title>')[0][:60] if '<title>' in body else ''}"
        print(f"### {name}: {status}{extra}")
        continue
    sample = body[:900]
    try:
        js = json.loads(body)
        if isinstance(js, list):
            sample = "LIST len=%d first=%s" % (len(js), json.dumps(js[1] if len(js) > 1 else js[0], ensure_ascii=False)[:900])
        else:
            sample = "KEYS=%s %s" % (list(js)[:15], json.dumps(js, ensure_ascii=False)[:900])
    except Exception:
        pass
    print(f"### {name}: {status} {ctype}\n{sample}\n")
