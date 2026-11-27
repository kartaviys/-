#!/usr/bin/env bash
# Runs every test suite: Godot (GUT) and Python tools.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GODOT="${GODOT:-$("$ROOT/scripts/setup_godot.sh")}"

echo "== Godot: import"
"$GODOT" --headless --path "$ROOT/game" --import >/dev/null 2>&1 || true
echo "== Godot: GUT"
"$GODOT" --headless --path "$ROOT/game" -s res://addons/gut/gut_cmdln.gd

echo "== Python: tools"
if python3 -c "import pytest" 2>/dev/null; then
  (cd "$ROOT/tools/geo" && python3 -m pytest -q)
  (cd "$ROOT/tools" && python3 -m pytest -q tests)
else
  (cd "$ROOT/tools/geo" && python3 -m unittest discover -s tests)
  (cd "$ROOT/tools" && python3 -m unittest discover -s tests)
fi
