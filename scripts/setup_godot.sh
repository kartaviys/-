#!/usr/bin/env bash
# Downloads the pinned headless-capable Godot editor into .tools/ (Linux x86_64).
set -euo pipefail

GODOT_VERSION="${GODOT_VERSION:-4.7.2}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/.tools/godot-$GODOT_VERSION"
BIN="$DEST/Godot_v${GODOT_VERSION}-stable_linux.x86_64"

if [[ -x "$BIN" ]]; then
  echo "$BIN"
  exit 0
fi

mkdir -p "$DEST"
URL="https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-stable/Godot_v${GODOT_VERSION}-stable_linux.x86_64.zip"
for attempt in 1 2 3 4; do
  if curl -sSL --fail -o "$DEST/godot.zip" "$URL" && unzip -tq "$DEST/godot.zip" >/dev/null; then
    break
  fi
  [[ $attempt == 4 ]] && { echo "failed to download $URL" >&2; exit 1; }
  sleep $((2 ** attempt))
done
unzip -oq "$DEST/godot.zip" -d "$DEST"
rm "$DEST/godot.zip"
chmod +x "$BIN"
echo "$BIN"
