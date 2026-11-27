import copy
import csv
import sys
import tomllib
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from towerwar_geo import CITIES_DIR, REPO_ROOT  # noqa: E402
from towerwar_geo.config import ConfigError, load_city, parse_city  # noqa: E402


def _raw_ghent() -> dict:
    return tomllib.loads((CITIES_DIR / "ghent.toml").read_text(encoding="utf-8"))


class GhentConfigTest(unittest.TestCase):
    def test_ghent_loads(self):
        city = load_city(CITIES_DIR / "ghent.toml")
        self.assertEqual(city.id, "ghent")
        self.assertEqual(len(city.landmarks), 26)
        self.assertEqual(len(city.starts), 5)
        self.assertEqual(city.area.admin_level, 8)

    def test_every_city_config_loads(self):
        for path in sorted(CITIES_DIR.glob("*.toml")):
            with self.subTest(city=path.stem):
                self.assertEqual(load_city(path).id, path.stem)

    def test_landmark_names_are_localized(self):
        city = load_city(CITIES_DIR / "ghent.toml")
        csv_path = REPO_ROOT / "game" / "locale" / "maps" / "ghent.csv"
        with csv_path.open(encoding="utf-8") as fh:
            rows = {row["keys"]: row for row in csv.DictReader(fh)}
        for key in [city.name_key, *(lm.name_key for lm in city.landmarks)]:
            with self.subTest(key=key):
                self.assertIn(key, rows)
                self.assertTrue(rows[key]["en"] and rows[key]["ru"])


class ConfigValidationTest(unittest.TestCase):
    def assert_rejected(self, raw: dict, fragment: str):
        with self.assertRaises(ConfigError) as ctx:
            parse_city(raw)
        self.assertIn(fragment, str(ctx.exception))

    def test_missing_section(self):
        raw = _raw_ghent()
        del raw["projection"]
        self.assert_rejected(raw, "[projection]")

    def test_duplicate_landmark(self):
        raw = _raw_ghent()
        raw["landmarks"].append(copy.deepcopy(raw["landmarks"][0]))
        self.assert_rejected(raw, "duplicate landmark")

    def test_crown_towers_must_be_distinct(self):
        raw = _raw_ghent()
        raw["game"]["crown_towers"] = ["belfort", "belfort", "sint_baafs"]
        self.assert_rejected(raw, "crown_towers")

    def test_unknown_start(self):
        raw = _raw_ghent()
        raw["game"]["starts"]["sky_weavers"] = "atlantis"
        self.assert_rejected(raw, "unknown landmark")

    def test_shared_start(self):
        raw = _raw_ghent()
        raw["game"]["starts"]["sky_weavers"] = "port"
        self.assert_rejected(raw, "share start")

    def test_bad_crs(self):
        raw = _raw_ghent()
        raw["projection"]["crs"] = "WGS84"
        self.assert_rejected(raw, "crs")

    def test_territory_range(self):
        raw = _raw_ghent()
        raw["territories"]["min_count"] = 90
        self.assert_rejected(raw, "min_count")

    def test_landmarks_need_own_territory(self):
        raw = _raw_ghent()
        raw["territories"]["min_count"] = 10
        self.assert_rejected(raw, "own territory")

    def test_empty_match_names(self):
        raw = _raw_ghent()
        raw["landmarks"][0]["match"]["names"] = []
        self.assert_rejected(raw, "match.names")

    def test_bool_is_not_a_number(self):
        raw = _raw_ghent()
        raw["projection"]["pixels_per_meter"] = True
        self.assert_rejected(raw, "pixels_per_meter")


if __name__ == "__main__":
    unittest.main()
