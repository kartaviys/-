"""Временная проверка №3: уточнения по hh, Himalayas, Remotive, HN, Telegram."""
import json
import urllib.error
import urllib.request

BROWSER = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36"


def get(url, headers=None):
    h = {"User-Agent": BROWSER, "Accept": "application/json"}
    h.update(headers or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as r:
            return r.status, r.read(2_000_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


for name, hdrs in {
    "hh: only HH-User-Agent": {"HH-User-Agent": "HHAutoApplyAndroid/1.0 (someone@gmail.com)"},
    "hh: UA=app": {"User-Agent": "HHAutoApplyAndroid/1.0 (someone@gmail.com)"},
    "hh: both app": {"User-Agent": "HHAutoApplyAndroid/1.0 (someone@gmail.com)", "HH-User-Agent": "HHAutoApplyAndroid/1.0 (someone@gmail.com)"},
}.items():
    st, body = get("https://api.hh.ru/vacancies?text=data%20scientist&per_page=1&search_field=name&experience=between3And6&experience=moreThan6&area=113&period=7", hdrs)
    print(f"### {name}: {st} {body[:400]}\n")

st, body = get("https://himalayas.app/jobs/api/search?q=machine%20learning")
j = json.loads(body)["jobs"][0]
print("### himalayas keys:", list(j))
print({k: j[k] for k in j if k not in ("description", "excerpt")}, "\n")

for q in ["category=data", "category=software-dev&search=machine%20learning", "search=machine%20learning"]:
    st, body = get(f"https://remotive.com/api/remote-jobs?{q}&limit=3")
    d = json.loads(body)
    print(f"### remotive {q}: count={d.get('job-count')}", [(x['title'], x['category']) for x in d['jobs'][:3]], "\n")

st, body = get("https://hn.algolia.com/api/v1/search?tags=comment,story_50338728&query=machine%20learning&hitsPerPage=2")
h = json.loads(body)["hits"][0]
print("### hn hit keys:", list(h), {k: h[k] for k in ("objectID", "parent_id", "story_id", "author") if k in h}, "\n")

st, html = get("https://t.me/s/odsjobs", {"Accept": "text/html"})
i = html.find("tgme_widget_message_text")
print("### tg text html:", html[i - 100:i + 1500], "\n")
print("### tg date:", html[html.find("tgme_widget_message_date"):html.find("tgme_widget_message_date") + 300])

st, rss = get("https://weworkremotely.com/categories/remote-programming-jobs.rss", {"Accept": "*/*"})
i = rss.find("<item>")
print("### wwr item:", rss[i:i + 1200])
for cat in ["remote-data-science-jobs", "remote-machine-learning-jobs", "remote-full-stack-programming-jobs"]:
    st, b = get(f"https://weworkremotely.com/categories/{cat}.rss", {"Accept": "*/*"})
    print("### wwr", cat, st, b.count("<item>"))
