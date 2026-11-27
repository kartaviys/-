"""The committed schematic Ghent map must match its generator."""
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "schematic" / "ghent_schematic.py"


def _load():
    spec = importlib.util.spec_from_file_location("ghent_schematic", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SchematicTest(unittest.TestCase):
    def test_committed_map_is_up_to_date(self):
        built = _load().build()
        committed = json.loads((ROOT / "game/data/maps/ghent/map.json").read_text(encoding="utf-8"))
        self.assertEqual(json.loads(json.dumps(built)), committed,
                         "run: python3 tools/schematic/ghent_schematic.py")

    def test_every_landmark_has_its_own_territory(self):
        data = _load().build()
        territories = [l["territory"] for l in data["landmarks"]]
        self.assertEqual(len(territories), len(set(territories)))
        self.assertEqual(len(territories), 26)


if __name__ == "__main__":
    unittest.main()
