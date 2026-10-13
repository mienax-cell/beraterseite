# -*- coding: utf-8 -*-
"""bogen.py — setzt die Einzelfotos von kamera.mjs zu Übersichtsbögen zusammen.

    python werkzeug/bogen.py <ordner> <fensterbreite> <fensterhoehe>

Aus p000.png … wird bogen_1.png, bogen_2.png … (je höchstens 9 Stände, beschriftet).
Aus inhalt.png (ganze Seite) werden Streifen inhalt_1.png … von höchstens 1500 Bildpunkten Höhe.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ordner = Path(sys.argv[1])
fb, fh = int(sys.argv[2]), int(sys.argv[3])
hochkant = fb < fh * 0.8
spalten = 5 if hochkant else 3
kachel_b = 380 if hochkant else 640
je_bogen = 10 if hochkant else 9

fotos = sorted(ordner.glob("p[0-9][0-9][0-9].png"))
for alt in ordner.glob("bogen_*.png"):
    alt.unlink()
for nr in range(0, len(fotos), je_bogen):
    teil = fotos[nr:nr + je_bogen]
    erste = Image.open(teil[0])
    kachel_h = round(kachel_b * erste.height / erste.width)
    zeilen = (len(teil) + spalten - 1) // spalten
    bogen = Image.new("RGB", (spalten * (kachel_b + 8) + 8, zeilen * (kachel_h + 26) + 8), (23, 21, 27))
    stift = ImageDraw.Draw(bogen)
    for i, f in enumerate(teil):
        x = 8 + (i % spalten) * (kachel_b + 8)
        y = 8 + (i // spalten) * (kachel_h + 26)
        bogen.paste(Image.open(f).convert("RGB").resize((kachel_b, kachel_h), Image.LANCZOS), (x, y + 18))
        stift.text((x + 2, y + 3), f"Scroll-Stand {int(f.stem[1:]) / 100:.2f}   ({fb} x {fh})", fill=(240, 138, 44))
    ziel = ordner / f"bogen_{nr // je_bogen + 1}.png"
    bogen.save(ziel)
    print(ziel)

ganz = ordner / "inhalt.png"
for alt in ordner.glob("inhalt_*.png"):
    alt.unlink()
if ganz.exists():
    bild = Image.open(ganz).convert("RGB")
    streifen = 1500
    for n, y in enumerate(range(0, bild.height, streifen), 1):
        ziel = ordner / f"inhalt_{n}.png"
        bild.crop((0, y, bild.width, min(bild.height, y + streifen))).save(ziel)
        print(ziel)
