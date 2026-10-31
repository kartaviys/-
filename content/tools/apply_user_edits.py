"""Перенести правки точек из приложения в контент-пак.

python3 content/tools/apply_user_edits.py edits.json [--dry]

edits.json — то, что приложение отдаёт кнопкой «Настройки → Мои правки точек → Поделиться правками».
Поправленные координаты записываются в destinations/*.json (точка помечается coordsVerified).
Свои точки, порядок точек и свои места только перечисляются: им нужны рассказ и факты с источниками,
поэтому в общий контент их добавляют руками по обычным правилам.
"""
import json
import os
import sys

PACK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pack")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    edits = json.load(open(args[0], encoding="utf-8"))
    by_dest = {}
    for m in edits.get("moves", []):
        by_dest.setdefault(m["destinationId"], []).append(m)
    changed = 0
    for dest_id, moves in sorted(by_dest.items()):
        path = os.path.join(PACK, "destinations", dest_id + ".json")
        if not os.path.exists(path):
            print(f"ПРОПУСК {dest_id}: нет такого места")
            continue
        d = json.load(open(path, encoding="utf-8"))
        stops = {s["id"]: s for s in d["stops"]}
        for m in moves:
            c = {"lat": round(m["coords"]["lat"], 6), "lon": round(m["coords"]["lon"], 6)}
            sid = m["stopId"]
            if sid in ("start", "end"):
                target = d["startPoint" if sid == "start" else "endPoint"]
            elif sid in stops:
                target = stops[sid]
                target["coordsVerified"] = True
            else:
                print(f"ПРОПУСК {dest_id}/{sid}: точки нет в контенте")
                continue
            print(f"{dest_id}/{sid} «{m.get('name') or target.get('name', '')}»: {target['coords']} → {c}")
            target["coords"] = c
            changed += 1
        if not dry:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, indent=1)
                f.write("\n")
    for u in edits.get("added", []):
        print(f"СВОЯ ТОЧКА {u['destinationId']}: «{u['name']}» {u['coords']['lat']:.6f}, {u['coords']['lon']:.6f}"
              + (f" — {u['note']}" if u.get("note") else ""))
    for o in edits.get("orders", []):
        print(f"ПОРЯДОК {o['destinationId']}: " + " → ".join(o["stopIds"]))
    for pl in edits.get("places", []):
        print(f"СВОЁ МЕСТО {pl['id']}: «{pl['name']}» {pl['coords']['lat']:.6f}, {pl['coords']['lon']:.6f}"
              + (f" — {pl['note']}" if pl.get("note") else ""))
    print(f"Координат поправлено: {changed}" + (" (проверка, файлы не изменены)" if dry else ""))
    if changed and not dry:
        print("Дальше: python3 content/tools/validate_content.py")


if __name__ == "__main__":
    main()
