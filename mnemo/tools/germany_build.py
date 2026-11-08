"""Сборка www/germany.js — карта Германии и города «Дороги в Берлин» (немецкий курс).

Вход (не хранится в репозитории):
  geo/deutschlandGeoJSON/2_bundeslaender/3_mittel.geo.json — федеральные земли (репозиторий isellsoap/deutschlandGeoJSON);
  decities/tier-1..3.json — города по возрастанию известности (с координатами), последний — Berlin.
Запуск: python3 germany_build.py <папка с geo/ и decities/>
"""
import json, math, sys, pathlib

BASE = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(__file__).resolve().parent.parent / 'app/src/main/assets/www/germany.js'
K = 52; LON0 = 5.7; LAT0 = 55.15; C = math.cos(math.radians(51.2))
P = lambda lon, lat: ((lon - LON0) * C * K, (LAT0 - lat) * K)
LANDS = {'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
         'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen'}

def area(r):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]))) / 2
def dp(pts, eps):
    if len(pts) < 3: return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0; L = math.hypot(dx, dy) or 1e-9
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x1 * y0 - y1 * x0) / L
        if d > dmax: dmax, idx = d, i
    if dmax > eps: return dp(pts[:idx + 1], eps)[:-1] + dp(pts[idx:], eps)
    return [pts[0], pts[-1]]

regions = []
g = json.load(open(BASE / 'geo/deutschlandGeoJSON/2_bundeslaender/3_mittel.geo.json'))
for f in g['features']:
    geom = f['geometry']
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    d = ''
    for poly in polys:
        for ring in poly[:1]:  # внешний контур; дыры (Берлин в Бранденбурге, Бремен) рисуются отдельными землями поверх
            r = [P(*c[:2]) for c in ring]
            if area(r) < 1.5: continue
            m = len(r) // 2
            s = dp(r[:m + 1], 0.3)[:-1] + dp(r[m:], 0.3)
            if len(s) >= 4: d += 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in s) + 'Z'
    regions.append([f['properties']['name'], d])
# Маленькие земли (города-государства) — последними, чтобы были поверх соседей.
regions.sort(key=lambda r: r[0] in ('Berlin', 'Bremen', 'Hamburg'))

raw = []
for name in ['tier-1', 'tier-1b', 'tier-2', 'tier-2b', 'tier-3']:
    f = BASE / f'decities/{name}.json'
    if f.exists(): raw += [c for c in json.load(open(f)) if not (c['n'] == 'Berlin' and name != 'tier-3')]
key = lambda c: c['n'].lower()  # один город — одна открытка (берём самое позднее упоминание)
last = {}
for i, c in enumerate(raw): last[key(c)] = i
cities, bad = [], []
for i, c in enumerate(raw):
    if last[key(c)] != i: continue
    lat, lon = float(c['lat']), float(c['lon'])
    if c['o'] not in LANDS or not (47.2 <= lat <= 55.1 and 5.8 <= lon <= 15.1) or not c.get('de') or not c.get('ru'):
        bad.append(c['n']); continue
    x, y = P(lon, lat)
    cities.append({'n': c['n'], 'r': c['o'], 'x': round(x, 1), 'y': round(y, 1), 'w': c.get('w') or c['n'], 'de': c['de'], 'ru': c['ru']})
    if c.get('photo'): cities[-1]['p'] = c['photo']  # статья для фото
cities.sort(key=lambda c: c['n'] == 'Berlin')
W = round((15.3 - LON0) * C * K); H = round((LAT0 - 47.2) * K)
data = {'w': W, 'h': H, 'regions': regions, 'cities': cities}
OUT.write_text('/* Сгенерировано mnemo/tools/germany_build.py — карта Германии и города «Дороги в Берлин». */\n'
               'window.MNEMO_GERMANY = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(f'{len(cities)} городов, {OUT.stat().st_size // 1024} КБ, {W}x{H}; отброшено: {bad}')
