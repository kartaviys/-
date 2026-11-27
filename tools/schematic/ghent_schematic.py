"""Schematic Ghent map pack: a stand-in until the OSM pipeline (phase 1) runs.

The OSM sources are not reachable from the build environment yet, so this
script lays the Ghent landmarks and districts out on a hand-made schematic:
rough relative positions (km east/south of the Belfry), radially inflated so
the dense medieval centre stays clickable, then split into Voronoi cells. It is
NOT real geometry and must be replaced by tools/geo output. Stdlib only.

    python3 tools/schematic/ghent_schematic.py   # writes game/data/maps/ghent/map.json
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "game" / "data" / "maps" / "ghent" / "map.json"

SCALE_PX = 520.0       # pixels per inflated unit
INFLATE_EXP = 0.6      # r' = r ** exp: < 1 enlarges the centre
MARGIN_PX = 260.0      # map border beyond the outermost seeds
MIN_SHARED_PX = 30.0   # shorter shared borders do not make neighbours
CENTER_RADIUS_KM = 1.5  # river crossings inside become bridges, outside only listed ones

# (id, name_key, km east, km south, landmark id or None)
SEEDS: list[tuple[str, str, float, float, str | None]] = [
    ("t_belfort", "LM_BELFORT", 0.0, 0.0, "belfort"),
    ("t_sint_niklaas", "LM_SINT_NIKLAAS", -0.12, 0.02, "sint_niklaas"),
    ("t_sint_baafs", "LM_SINT_BAAFS", 0.2, 0.05, "sint_baafs"),
    ("t_graslei", "LM_GRASLEI", -0.28, -0.12, "graslei"),
    ("t_sint_michielsbrug", "LM_SINT_MICHIELSBRUG", -0.3, 0.1, "sint_michielsbrug"),
    ("t_groot_vleeshuis", "LM_GROOT_VLEESHUIS", -0.12, -0.25, "groot_vleeshuis"),
    ("t_gravensteen", "LM_GRAVENSTEEN", -0.22, -0.42, "gravensteen"),
    ("t_patershol", "LM_PATERSHOL", -0.02, -0.6, "patershol"),
    ("t_vrijdagmarkt", "LM_VRIJDAGMARKT", 0.18, -0.35, "vrijdagmarkt"),
    ("t_dulle_griet", "LM_DULLE_GRIET", 0.38, -0.25, "dulle_griet"),
    ("t_prinsenhof", "LM_PRINSENHOF", -0.6, -0.5, "prinsenhof"),
    ("t_duivelsteen", "LM_DUIVELSTEEN", 0.42, 0.28, "duivelsteen"),
    ("t_rabot", "LM_RABOT", -1.0, -0.95, "rabot"),
    ("t_sint_baafsabdij", "LM_SINT_BAAFSABDIJ", 0.95, -0.1, "sint_baafsabdij"),
    ("t_gent_dampoort", "LM_GENT_DAMPOORT", 1.35, -0.45, "gent_dampoort"),
    ("t_boekentoren", "LM_BOEKENTOREN", -0.1, 0.9, "boekentoren"),
    ("t_sint_pietersabdij", "LM_SINT_PIETERSABDIJ", 0.35, 0.95, "sint_pietersabdij"),
    ("t_citadelpark", "LM_CITADELPARK", -0.25, 1.6, "citadelpark"),
    ("t_plantentuin", "LM_PLANTENTUIN", 0.3, 1.55, "plantentuin"),
    ("t_gent_sint_pieters", "LM_GENT_SINT_PIETERS", -0.6, 2.2, "gent_sint_pieters"),
    ("t_uz_gent", "LM_UZ_GENT", -1.5, 2.0, "uz_gent"),
    ("t_arena", "LM_ARENA", -0.6, 3.4, "arena"),
    ("t_airfield", "LM_AIRFIELD", -2.7, 3.1, "airfield"),
    ("t_blaarmeersen", "LM_BLAARMEERSEN", -3.3, 0.3, "blaarmeersen"),
    ("t_watersportbaan", "LM_WATERSPORTBAAN", -2.3, 0.7, "watersportbaan"),
    ("t_port", "LM_PORT", 1.5, -6.0, "port"),
    ("t_kouter", "T_GHENT_KOUTER", 0.1, 0.45, None),
    ("t_zuid", "T_GHENT_ZUID", 0.75, 0.6, None),
    ("t_bijloke", "T_GHENT_BIJLOKE", -0.9, 0.9, None),
    ("t_brugse_poort", "T_GHENT_BRUGSE_POORT", -1.5, -0.25, None),
    ("t_malem", "T_GHENT_MALEM", -1.9, 1.0, None),
    ("t_tolhuis", "T_GHENT_TOLHUIS", -0.6, -1.7, None),
    ("t_muide", "T_GHENT_MUIDE", 0.9, -1.5, None),
    ("t_meulestede", "T_GHENT_MEULESTEDE", 0.2, -2.3, None),
    ("t_mariakerke", "T_GHENT_MARIAKERKE", -2.6, -1.6, None),
    ("t_drongen", "T_GHENT_DRONGEN", -4.6, -0.8, None),
    ("t_wondelgem", "T_GHENT_WONDELGEM", -0.9, -3.1, None),
    ("t_langerbrugge", "T_GHENT_LANGERBRUGGE", 1.0, -3.9, None),
    ("t_sint_amandsberg", "T_GHENT_SINT_AMANDSBERG", 2.4, -0.6, None),
    ("t_oostakker", "T_GHENT_OOSTAKKER", 3.1, -2.3, None),
    ("t_desteldonk", "T_GHENT_DESTELDONK", 4.0, -5.0, None),
    ("t_mendonk", "T_GHENT_MENDONK", 4.6, -6.8, None),
    ("t_sint_kruis_winkel", "T_GHENT_SINT_KRUIS_WINKEL", 3.4, -8.3, None),
    ("t_ledeberg", "T_GHENT_LEDEBERG", 1.0, 1.6, None),
    ("t_gentbrugge", "T_GHENT_GENTBRUGGE", 2.3, 1.2, None),
    ("t_moscou", "T_GHENT_MOSCOU", 2.4, 2.7, None),
    ("t_zwijnaarde", "T_GHENT_ZWIJNAARDE", 0.6, 4.2, None),
    ("t_afsnee", "T_GHENT_AFSNEE", -3.9, 2.9, None),
]

# The Leie and the port canal as one schematic barrier (km east, km south).
RIVER_KM = [(-6.0, -0.15), (-2.9, 0.1), (-1.25, 0.25), (-0.36, -0.05), (-0.38, -0.7),
            (0.1, -1.2), (0.55, -2.6), (1.15, -4.6), (2.0, -7.1), (2.6, -10.0)]
# Crossings outside the centre that stay as bridges: (a, b, name). The rest are water-only.
OUTER_BRIDGES = {
    frozenset(("t_brugse_poort", "t_bijloke")): "Brug Bijloke",
    frozenset(("t_drongen", "t_blaarmeersen")): "Brug Drongen",
    frozenset(("t_meulestede", "t_wondelgem")): "Meulesteedsebrug",
    frozenset(("t_langerbrugge", "t_wondelgem")): "Brug Langerbrugge",
    frozenset(("t_sint_kruis_winkel", "t_port")): "Brug Sint-Kruis-Winkel",
}
CENTER_BRIDGE_NAMES = {frozenset(("t_brugse_poort", "t_sint_michielsbrug")): "Sint-Michielsbrug"}
# Rail edge between the two stations (spec 3.3).
RAIL = [("t_gent_sint_pieters", "t_gent_dampoort")]


def inflate(x: float, y: float) -> tuple[float, float]:
    r = math.hypot(x, y)
    if r == 0:
        return 0.0, 0.0
    k = (r ** INFLATE_EXP) / r * SCALE_PX
    return x * k, y * k


def clip(poly, a, b, c, label):
    """Keeps the half-plane a*x + b*y <= c. Edges are (point, label of edge starting there)."""
    out = []
    n = len(poly)
    for i in range(n):
        (p, lab), (q, _) = poly[i], poly[(i + 1) % n]
        dp = a * p[0] + b * p[1] - c
        dq = a * q[0] + b * q[1] - c
        if dp <= 0:
            out.append((p, lab))
        if (dp < 0 < dq) or (dq < 0 < dp):
            t = dp / (dp - dq)
            x = (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))
            # Entering the kept side: the new edge continues the original edge;
            # leaving it: the new edge runs along this cut.
            out.append((x, label if dp <= 0 else lab))
    return out


def convex_hull(pts):
    pts = sorted(set(pts))
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def expand(hull, margin):
    cx = sum(p[0] for p in hull) / len(hull)
    cy = sum(p[1] for p in hull) / len(hull)
    out = []
    for x, y in hull:
        d = math.hypot(x - cx, y - cy)
        out.append((x + (x - cx) / d * margin, y + (y - cy) / d * margin))
    return out


def seg_intersect(p1, p2, p3, p4) -> bool:
    def orient(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    d1, d2 = orient(p3, p4, p1), orient(p3, p4, p2)
    d3, d4 = orient(p1, p2, p3), orient(p1, p2, p4)
    return d1 * d2 < 0 and d3 * d4 < 0


def area(poly) -> float:
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                   for i in range(len(poly)))) / 2


def centroid(poly):
    a = cx = cy = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    a *= 0.5
    return cx / (6 * a), cy / (6 * a)


def build() -> dict:
    raw = {sid: inflate(x, y) for sid, _, x, y, _ in SEEDS}
    hull = expand(convex_hull(list(raw.values())), MARGIN_PX)
    min_x = min(p[0] for p in hull)
    min_y = min(p[1] for p in hull)
    shift = lambda p: (p[0] - min_x, p[1] - min_y)
    pts = {sid: shift(p) for sid, p in raw.items()}
    border = [shift(p) for p in hull]
    river = [shift(inflate(x, y)) for x, y in RIVER_KM]
    center = shift((0.0, 0.0))

    cells = {}
    shared: dict[frozenset, float] = {}
    for sid, p in pts.items():
        poly = [(q, None) for q in border]
        for oid, o in pts.items():
            if oid == sid:
                continue
            a, b = o[0] - p[0], o[1] - p[1]
            c = (o[0] ** 2 + o[1] ** 2 - p[0] ** 2 - p[1] ** 2) / 2
            poly = clip(poly, a, b, c, oid)
        cells[sid] = [q for q, _ in poly]
        for i, (q, lab) in enumerate(poly):
            if lab is None:
                continue
            r = poly[(i + 1) % len(poly)][0]
            key = frozenset((sid, lab))
            shared[key] = max(shared.get(key, 0.0), math.dist(q, r))

    def crosses_river(a, b):
        return any(seg_intersect(pts[a], pts[b], river[i], river[i + 1]) for i in range(len(river) - 1))

    edges = []
    for key, length in sorted(shared.items(), key=lambda kv: sorted(kv[0])):
        if length < MIN_SHARED_PX:
            continue
        a, b = sorted(key)
        if not crosses_river(a, b):
            edges.append({"a": a, "b": b, "type": "land"})
            continue
        mid = ((pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2)
        in_center = math.dist(mid, center) <= SCALE_PX * CENTER_RADIUS_KM ** INFLATE_EXP
        name = CENTER_BRIDGE_NAMES.get(key) or OUTER_BRIDGES.get(key)
        if in_center and not name:
            pretty = lambda t: t.removeprefix("t_").replace("_", "-").title()
            name = "Brug %s / %s" % (pretty(a), pretty(b))
        if name:
            edges.append({"a": a, "b": b, "type": "bridge", "name": name})
        else:
            edges.append({"a": a, "b": b, "type": "water"})
    for a, b in RAIL:
        edges.append({"a": a, "b": b, "type": "rail"})

    river_side = {e["a"] for e in edges if e["type"] in ("bridge", "water")} | \
                 {e["b"] for e in edges if e["type"] in ("bridge", "water")}
    territories, landmarks = [], []
    for sid, name_key, x, y, lm in SEEDS:
        poly = cells[sid]
        r_km = math.hypot(x, y)
        a_px = area(poly)
        density = max(0.15, 1.0 - r_km / 6.0)  # schematic: the centre is denser and richer
        c = centroid(poly)
        territories.append({
            "id": sid,
            "name_key": name_key,
            "centroid": [round(c[0]), round(c[1])],
            "polygon": [[round(q[0]), round(q[1])] for q in poly],
            "stats": {
                "area_m2": round(a_px * 4),
                "buildings": round(400 * density + a_px / 20000),
                "green_share": round(min(0.8, r_km / 10 + (0.5 if lm in ("citadelpark", "blaarmeersen", "plantentuin") else 0)), 2),
                "water_share": 0.15 if sid in river_side else 0.0,
                "road_length_m": round(6000 * density + a_px / 400),
                "coastal": sid in river_side,
            },
        })
        if lm:
            landmarks.append({"id": lm, "territory": sid, "position": [round(pts[sid][0]), round(pts[sid][1])]})
    w = max(p[0] for p in border)
    h = max(p[1] for p in border)
    return {
        "format_version": 1,
        "schematic": True,
        "size": [round(w), round(h)],
        "border": [[round(q[0]), round(q[1])] for q in border],
        "river": [[round(q[0]), round(q[1])] for q in river],
        "territories": territories,
        "edges": edges,
        "landmarks": landmarks,
    }


def main() -> None:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    kinds: dict[str, int] = {}
    for e in data["edges"]:
        kinds[e["type"]] = kinds.get(e["type"], 0) + 1
    print(f"{OUT.relative_to(ROOT)}: {len(data['territories'])} territories, edges {kinds}, size {data['size']}")


if __name__ == "__main__":
    main()
