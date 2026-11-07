"""Временная проверка №2: полная структура одной записи из каждого источника."""
import json
import re
import urllib.request

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36"


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept,
                                               "HH-User-Agent": "HHAutoApply/1.0 (hh-autoapply@example.com)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read(2_000_000).decode("utf-8", "replace")


def show(name, obj, n=2500):
    print(f"### {name}\n{json.dumps(obj, ensure_ascii=False)[:n]}\n")


def safe(name, fn):
    try:
        fn()
    except Exception as e:
        print(f"### {name}: ERROR {e}\n")


safe("remoteok", lambda: show("remoteok", get("https://remoteok.com/api")[0:0] or json.loads(get("https://remoteok.com/api"))[1]))
safe("remotive", lambda: show("remotive", json.loads(get("https://remotive.com/api/remote-jobs?search=machine%20learning&limit=1"))["jobs"][0]))
safe("remotive_cats", lambda: show("remotive_cats", json.loads(get("https://remotive.com/api/remote-jobs/categories")), 1500))
safe("himalayas", lambda: show("himalayas", json.loads(get("https://himalayas.app/jobs/api/search?q=machine%20learning"))["jobs"][0]))


def hn():
    hits = json.loads(get("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5"))["hits"]
    print("### hn stories:", [(h["objectID"], h["title"]) for h in hits])
    sid = next(h["objectID"] for h in hits if "Who is hiring" in h["title"])
    item = json.loads(get(f"https://hn.algolia.com/api/v1/items/{sid}"))
    print("### hn item keys:", list(item), "children:", len(item.get("children", [])))
    show("hn child", item["children"][0], 1500)
    q = json.loads(get(f"https://hn.algolia.com/api/v1/search?tags=comment,story_{sid}&query=machine%20learning&hitsPerPage=2"))
    show("hn search in thread", q["hits"][0], 1500)


safe("hn", hn)
safe("trudvsem", lambda: show("trudvsem", json.loads(get("https://opendata.trudvsem.ru/api/v1/vacancies?text=data%20scientist&limit=1"))["results"]["vacancies"][0]))


def habr():
    d = json.loads(get("https://career.habr.com/api/frontend/vacancies?q=data%20scientist&per_page=2&sort=date"))
    print("### habr meta:", json.dumps(d["meta"], ensure_ascii=False)[:500])
    show("habr item", d["list"][0], 2000)
    html = get("https://career.habr.com" + d["list"][0]["href"], "text/html")
    for cls in ["vacancy-description__text", "basic-section--appearance-vacancy-description", "style-ugc"]:
        i = html.find(cls)
        print(f"### habr page class {cls}: pos={i} snippet={html[i:i+400] if i >= 0 else ''}\n")


safe("habr", habr)


def getmatch():
    d = json.loads(get("https://getmatch.ru/api/offers?p=1&pa=all&q=data%20scientist"))
    o = d["offers"][0]
    print("### getmatch offer keys:", list(o))
    show("getmatch offer", {k: o[k] for k in o if k not in ("offer_description",)}, 2500)


safe("getmatch", getmatch)


def tg():
    html = get("https://t.me/s/datasciencejobs", "text/html")
    i = html.find('class="tgme_widget_message ')
    print("### tg message html:\n", html[i:i + 2500])


safe("tg", tg)
safe("hh", lambda: show("hh", json.loads(get("https://api.hh.ru/vacancies?text=data%20scientist&per_page=1"))["found"], 200))
