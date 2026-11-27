"""City config loading and validation (``cities/<city_id>.toml``).

A city config holds everything the pipeline needs to know about one city:
where its OSM data comes from, how to project it, how finely to cut it into
territories and which real places become landmarks. Balance numbers (mana,
effects) do not belong here; they live in the game's map pack data.
"""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

CROWN_TOWER_COUNT = 3
_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")
_CRS_RE = re.compile(r"^(EPSG:\d+|auto-utm)$")


class ConfigError(ValueError):
    """Raised when a city config is missing fields or is inconsistent."""


@dataclass(frozen=True)
class AreaSpec:
    """OSM boundary that delimits the playable area."""

    name: str
    admin_level: int
    country_code: str


@dataclass(frozen=True)
class SourceSpec:
    overpass_url: str
    pbf_url: str


@dataclass(frozen=True)
class ProjectionSpec:
    crs: str
    pixels_per_meter: float


@dataclass(frozen=True)
class TerritorySpec:
    min_count: int
    max_count: int
    min_shared_border_m: float
    center_ring_ref: str


@dataclass(frozen=True)
class LandmarkMatch:
    """How to find a landmark in OSM: any name variant plus optional tag filters."""

    names: tuple[str, ...]
    tags: dict[str, tuple[str, ...]] = field(default_factory=dict)


@dataclass(frozen=True)
class Landmark:
    id: str
    name_key: str
    archetype: str
    match: LandmarkMatch


@dataclass(frozen=True)
class CityConfig:
    id: str
    name_key: str
    area: AreaSpec
    source: SourceSpec
    projection: ProjectionSpec
    territories: TerritorySpec
    landmarks: tuple[Landmark, ...]
    crown_towers: tuple[str, ...]
    ascension_site: str
    starts: dict[str, str]

    def landmark(self, landmark_id: str) -> Landmark:
        for lm in self.landmarks:
            if lm.id == landmark_id:
                return lm
        raise KeyError(landmark_id)


def load_city(path: Path) -> CityConfig:
    try:
        raw = tomllib.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ConfigError(f"no city config at {path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{path}: {exc}") from exc
    return parse_city(raw)


def parse_city(raw: dict) -> CityConfig:
    city = _section(raw, "city")
    area = _section(raw, "area")
    source = _section(raw, "source")
    proj = _section(raw, "projection")
    terr = _section(raw, "territories")
    game = _section(raw, "game")

    config = CityConfig(
        id=_req(city, "id", str),
        name_key=_req(city, "name_key", str),
        area=AreaSpec(
            name=_req(area, "name", str),
            admin_level=_req(area, "admin_level", int),
            country_code=_req(area, "country_code", str),
        ),
        source=SourceSpec(
            overpass_url=_req(source, "overpass_url", str),
            pbf_url=_req(source, "pbf_url", str),
        ),
        projection=ProjectionSpec(
            crs=_req(proj, "crs", str),
            pixels_per_meter=float(_req(proj, "pixels_per_meter", (int, float))),
        ),
        territories=TerritorySpec(
            min_count=_req(terr, "min_count", int),
            max_count=_req(terr, "max_count", int),
            min_shared_border_m=float(_req(terr, "min_shared_border_m", (int, float))),
            center_ring_ref=str(terr.get("center_ring_ref", "")),
        ),
        landmarks=tuple(_parse_landmark(i, lm) for i, lm in enumerate(raw.get("landmarks", []))),
        crown_towers=tuple(_req(game, "crown_towers", list)),
        ascension_site=_req(game, "ascension_site", str),
        starts=dict(_req(game, "starts", dict)),
    )
    _validate(config)
    return config


def _parse_landmark(index: int, raw: dict) -> Landmark:
    match = raw.get("match")
    if not isinstance(match, dict):
        raise ConfigError(f"landmark #{index}: missing [landmarks.match]")
    names = match.get("names")
    if not isinstance(names, list) or not names or not all(isinstance(n, str) and n for n in names):
        raise ConfigError(f"landmark #{index}: match.names must be a non-empty list of strings")
    tags = {}
    for key, values in match.get("tags", {}).items():
        values = values if isinstance(values, list) else [values]
        tags[key] = tuple(str(v) for v in values)
    return Landmark(
        id=_req(raw, "id", str),
        name_key=_req(raw, "name_key", str),
        archetype=_req(raw, "archetype", str),
        match=LandmarkMatch(names=tuple(names), tags=tags),
    )


def _validate(c: CityConfig) -> None:
    if not _ID_RE.match(c.id):
        raise ConfigError(f"city id '{c.id}' must be lowercase snake_case")
    if not _CRS_RE.match(c.projection.crs):
        raise ConfigError(f"projection.crs '{c.projection.crs}' must be EPSG:<code> or auto-utm")
    if c.projection.pixels_per_meter <= 0:
        raise ConfigError("projection.pixels_per_meter must be positive")
    t = c.territories
    if not 2 <= t.min_count <= t.max_count:
        raise ConfigError("territories: need 2 <= min_count <= max_count")
    if t.min_shared_border_m < 0:
        raise ConfigError("territories.min_shared_border_m must be >= 0")

    ids: set[str] = set()
    for lm in c.landmarks:
        if not _ID_RE.match(lm.id):
            raise ConfigError(f"landmark id '{lm.id}' must be lowercase snake_case")
        if lm.id in ids:
            raise ConfigError(f"duplicate landmark id '{lm.id}'")
        ids.add(lm.id)
    if len(c.landmarks) > t.min_count:
        raise ConfigError("more landmarks than territories: each landmark needs its own territory")

    if len(c.crown_towers) != CROWN_TOWER_COUNT or len(set(c.crown_towers)) != CROWN_TOWER_COUNT:
        raise ConfigError(f"game.crown_towers must list {CROWN_TOWER_COUNT} distinct landmarks")
    for ref in (*c.crown_towers, c.ascension_site):
        if ref not in ids:
            raise ConfigError(f"game references unknown landmark '{ref}'")
    seen_starts: dict[str, str] = {}
    for faction, lm_id in c.starts.items():
        if lm_id not in ids:
            raise ConfigError(f"start of '{faction}' is unknown landmark '{lm_id}'")
        if lm_id in seen_starts:
            raise ConfigError(f"factions '{seen_starts[lm_id]}' and '{faction}' share start '{lm_id}'")
        seen_starts[lm_id] = faction


def _section(raw: dict, name: str) -> dict:
    value = raw.get(name)
    if not isinstance(value, dict):
        raise ConfigError(f"missing [{name}] section")
    return value


def _req(section: dict, key: str, kind):
    if key not in section:
        raise ConfigError(f"missing key '{key}'")
    value = section[key]
    # bool is an int subclass; never accept it where a number is expected.
    if not isinstance(value, kind) or isinstance(value, bool):
        raise ConfigError(f"key '{key}' has wrong type {type(value).__name__}")
    return value
