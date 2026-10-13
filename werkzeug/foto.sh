#!/usr/bin/env bash
# foto.sh — Standbild der Seite mit unsichtbarem Edge.
#   werkzeug/foto.sh <name> "<adresse-anhang>" [breite] [hoehe]
#   Beispiel: werkzeug/foto.sh faeden "?p=0.47"        (Scroll-Stand der Bühne)
#             werkzeug/foto.sh rechner "?p=0#rechner"  (Abschnitt weiter unten)
# Braucht die laufende Vorschau auf Port 8736. Bilder landen in werkzeug/pruef/.
set -e
HIER="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
B="${3:-1280}"; H="${4:-720}"
"$EDGE" --headless=new --hide-scrollbars --no-first-run --disable-extensions \
  --user-data-dir="$HIER/pruef/.edge" --window-size="$B,$H" --virtual-time-budget=6000 \
  --screenshot="$HIER/pruef/$1.png" "http://localhost:8736/$2" >/dev/null 2>&1
echo "$HIER/pruef/$1.png"
