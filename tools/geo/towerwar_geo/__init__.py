"""Tower War geo pipeline: OpenStreetMap data -> city map packs."""

from pathlib import Path

GEO_ROOT = Path(__file__).resolve().parent.parent
CITIES_DIR = GEO_ROOT / "cities"
REPO_ROOT = GEO_ROOT.parent.parent
MAPS_OUT_DIR = REPO_ROOT / "game" / "data" / "maps"
