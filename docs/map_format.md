# Формат пакета карты (format_version 1)

Пакет — каталог `game/data/maps/<city_id>/`. Загрузчик: `game/src/data/map_pack.gd`. Пайплайн `tools/geo` выдаёт данные в этом же формате и проверяет их той же валидацией.

Координаты — игровые пиксели: ось X направлена на восток, ось Y — на юг, начало координат — левый верхний угол подложки.

## pack.json

```json
{
  "format_version": 1,
  "id": "ghent",
  "name_key": "MAP_GHENT",
  "crown_towers": ["belfort", "sint_baafs", "sint_niklaas"],
  "ascension_site": "boekentoren",
  "starts": { "iron_syndicate": "gent_sint_pieters" },
  "attribution": "© OpenStreetMap contributors"
}
```

- `crown_towers` — ровно 3 разные достопримечательности. Их удержание даёт победу «Коронные башни».
- `ascension_site` — место Великого Заклинания.
- `starts` — стартовые точки: `faction_id → landmark_id`, у каждой фракции своя.

## map.json

```json
{
  "format_version": 1,
  "territories": [
    { "id": "t01", "name_key": "T_GHENT_PATERSHOL", "centroid": [x, y],
      "polygon": [[x, y], ...], "stats": { "area_m2": 0, "buildings": 0,
      "green_share": 0.0, "water_share": 0.0, "road_length_m": 0, "coastal": false } }
  ],
  "edges": [ { "a": "t01", "b": "t02", "type": "land|bridge|water|rail", "name": "только для bridge" } ],
  "landmarks": [ { "id": "gravensteen", "territory": "t01", "position": [x, y] } ]
}
```

Необязательные поля `map.json` для отрисовки: `size` (ширина и высота подложки), `border` (контур игровой зоны), `river` (полилиния реки), `schematic: true` (карта временная, не из OSM).

## landmarks.json

```json
{
  "format_version": 1,
  "landmarks": [
    { "id": "gravensteen", "name_key": "LM_GRAVENSTEEN", "mana": { "stone": 4 }, "guardian_tier": 2, "effects": [] }
  ]
}
```

- `mana` — мана по школам за ход владельцу, у которого завершён ритуал связывания.
- `guardian_tier` — состав нейтральных Хранителей на старте (`neutrals.guardian_tiers` в `data/rules/balance.json`).
- `effects` — ссылки на общую библиотеку эффектов (фаза 4), пока пусто.

## Инварианты (проверяются при загрузке)

- id территорий и достопримечательностей уникальны, у полигона не меньше 3 точек.
- У рёбер известный тип, у ребра `bridge` есть название. Петли и дубли запрещены.
- В территории не больше одной достопримечательности.
- У каждой территории есть хотя бы одно ребро.
- Граф по рёбрам `land`, `bridge` и `rail` связный. Рёбра `water` связность не обеспечивают.
- Все ссылки из `pack.json` указывают на существующие достопримечательности.

Пайплайн дополнительно проверяет то, что требует геометрии: реку можно пересечь только по мостам, стартовые позиции примерно равноудалены от центра.
