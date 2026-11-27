"""Command line entry point: ``python -m towerwar_geo <command> <city>``."""

import argparse
import sys

from . import CITIES_DIR
from .config import ConfigError, load_city


def _cmd_check_config(args: argparse.Namespace) -> int:
    try:
        city = load_city(CITIES_DIR / f"{args.city}.toml")
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 1
    print(
        f"{city.id}: {len(city.landmarks)} landmarks, "
        f"{city.territories.min_count}-{city.territories.max_count} territories, "
        f"crs {city.projection.crs}"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="towerwar_geo")
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check-config", help="validate a city config")
    check.add_argument("city", help="city id, e.g. ghent")
    check.set_defaults(func=_cmd_check_config)
    args = parser.parse_args(argv)
    return args.func(args)
