# -*- coding: utf-8 -*-
"""einzeldatei.py — packt die ganze Seite in EINE HTML-Datei zum Weitergeben.

    python werkzeug/einzeldatei.py                (legt Beraterseite.html auf den Desktop)
    python werkzeug/einzeldatei.py <zielpfad>

Die vier Skripte (kopf.js, inhalt.js, szene.js, seite.js) werden in die Datei hineinkopiert.
Sie läuft dann per Doppelklick, ohne Internet und ohne die anderen Dateien.
Der Knopf „Entwurf" zum Ausfüllen ist in dieser Datei abgeschaltet: Wer sie bekommt, sieht die Seite
so wie ein Besucher im Netz.
"""
import io
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
ZIEL = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Desktop" / "Beraterseite.html"

seite = io.open(WURZEL / "index.html", encoding="utf-8").read()
for name in ["kopf.js", "inhalt.js", "szene.js", "seite.js"]:
    marke = f'<script src="{name}"></script>'
    assert seite.count(marke) == 1, name
    inhalt = io.open(WURZEL / name, encoding="utf-8").read()
    assert "</script" not in inhalt, f"{name} enthält ein Skript-Ende und lässt sich so nicht einbetten"
    seite = seite.replace(marke, f"<script>\n{inhalt}\n</script>")
assert seite.count('<html lang="de">') == 1
seite = seite.replace('<html lang="de">', '<html lang="de" data-weitergabe>')

io.open(ZIEL, "w", encoding="utf-8", newline="\n").write(seite)
print(f"{ZIEL}  ({ZIEL.stat().st_size / 1024:.0f} KB)")
