# -*- coding: utf-8 -*-
"""
kopf-bauen.py — macht aus einem Foto den 3D-Kopf der Seite.

Aus `quelle/foto.jpg` entstehen drei Dinge, alle in `kopf.js`:
  1. das Farbbild des Kopfes (freigestellt, Ränder entfärbt),
  2. eine Tiefenkarte (wie weit jeder Bildpunkt nach vorn steht),
  3. zwei Deckkraftkarten (wo Kopf ist und wo nicht): eine für die Bühne,
     bei der sich der Hals auflöst, eine fürs Porträt mit Hals.

Die Seite liest daraus rund 200.000 Punkte und stellt sie im Raum auf.

Warum kein fertiges Tiefen-Modell? Das wäre ein Download von rund 100 MB.
Die Tiefe wird hier deshalb aus dem Umriss und ein paar Messpunkten gebaut
(Augen, Nase, Mund, Kinn). Das trägt eine Drehung bis etwa 40 Grad.

Neues Foto? Die Messpunkte unten in MASSE anpassen (Bildpunkte im Foto),
dann:   python werkzeug/kopf-bauen.py
Mit --pruefbilder legt das Skript Kontrollbilder in werkzeug/pruef/ ab.
"""
import base64
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage import color

WURZEL = Path(__file__).resolve().parent.parent
FOTO = WURZEL / "quelle" / "foto.jpg"
ZIEL = WURZEL / "kopf.js"
PRUEF = WURZEL / "werkzeug" / "pruef"

# ---------------------------------------------------------------- Messpunkte
# Alles in Bildpunkten des Originalfotos (x nach rechts, y nach unten).
MASSE = {
    "ausschnitt": (70, 410, 850, 1450),      # links, oben, rechts, unten
    "mitte_x": 458,                           # senkrechte Mittellinie des Gesichts
    "kopfbreite_halb": 275,                   # Mitte bis Ohr-Außenkante
    "haar_oben": 440,
    "brauen_y": 900,
    "auge_links": (345, 922),
    "auge_rechts": (560, 917),
    "nasenwurzel_y": 905,
    "nasenspitze": (457, 1040),
    "mund": (460, 1152),
    "kinn": (460, 1315),
    "ohrlaeppchen_y": 1080,
    "hals_bis_y": 1365,
    # Umriss von Kopf, Haar, Ohren und Hals, im Uhrzeigersinn ab Scheitel.
    # Muss nur grob stimmen: die Kante selbst entscheidet die Farbe.
    "umriss": [
        (400, 488), (447, 458), (500, 476), (560, 490), (600, 500), (647, 540),
        (700, 580), (747, 607), (793, 667), (820, 707), (825, 750), (810, 800),
        (790, 853), (770, 900), (754, 925), (755, 983), (740, 1037), (707, 1077),
        (690, 1085), (680, 1117), (662, 1163), (650, 1205), (648, 1243),
        (663, 1283), (673, 1330), (683, 1357), (690, 1420),
        (297, 1420), (300, 1383), (320, 1343), (330, 1317), (327, 1250),
        (300, 1210), (280, 1163), (267, 1117), (263, 1083), (237, 1063),
        (213, 1017), (203, 950), (207, 925), (220, 905), (200, 860), (167, 800),
        (150, 760), (157, 700), (173, 653), (200, 600), (253, 553), (300, 520),
        (350, 500),
    ],
    "streifen": 30,                           # so breit entscheidet die Farbe (Bildpunkte)
    # Was sicher NICHT zum Kopf gehört (hier: das Handy unten rechts)
    "sperrflaechen": [(698, 1142, 9999, 9999)],
    # Ab hier löst sich der Hals nach unten auf
    "ausblenden_von_bis": (1335, 1405),
}


def glatt(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def freisteller(bild, m):
    """Trennt Kopf und Hintergrund.

    Der Umriss ist von Hand nachgezeichnet (MASSE["umriss"]). Weit innen ist
    sicher Kopf, weit außen sicher Hintergrund. Im Streifen dazwischen
    entscheidet die Farbe: was nicht wie die Tür dahinter aussieht, ist Kopf.
    """
    x0, y0, x1, y1 = m["ausschnitt"]
    B, H = bild.size
    rgb = np.asarray(bild) / 255.0
    lab = color.rgb2lab(rgb)
    yy, xx = np.mgrid[0:H, 0:B]
    X = xx + x0
    Y = yy + y0

    maske = Image.new("L", (B, H), 0)
    ImageDraw.Draw(maske).polygon([(px - x0, py - y0) for px, py in m["umriss"]], fill=255)
    M = ndi.gaussian_filter(np.asarray(maske) / 255.0, 6) > 0.5
    # Abstand zur Kante: innen negativ, außen positiv
    abstand = np.where(M, -ndi.distance_transform_edt(M), ndi.distance_transform_edt(~M))

    sperre = np.zeros((H, B), bool)
    for (a, b, c, d) in m["sperrflaechen"]:
        sperre |= (X >= a - 6) & (Y >= b - 6) & (X <= c) & (Y <= d)

    # Türfarbe an jeder Stelle, aus dem sicheren Hintergrund hochgerechnet
    sicher_hg = (abstand > m["streifen"] + 4) & ~sperre
    gew = ndi.gaussian_filter(sicher_hg.astype(float), 34)
    tuer = np.stack([ndi.gaussian_filter(lab[..., k] * sicher_hg, 34) / np.maximum(gew, 1e-4)
                     for k in range(3)], -1)
    d = lab - tuer
    unterschied = np.sqrt((0.42 * d[..., 0]) ** 2 + d[..., 1] ** 2 + d[..., 2] ** 2)
    farbe = glatt(4.5, 10.5, ndi.gaussian_filter(unterschied, 0.8))

    s = m["streifen"]
    a = np.maximum(farbe, glatt(-6, -s, abstand))      # weit innen: sicher Kopf
    a = np.minimum(a, 1 - glatt(s * 0.55, s, abstand))  # weit außen: sicher nicht
    a[sperre] = 0

    # verirrte Inseln weg, kleine Löcher zu
    fest, n = ndi.label(a > 0.5)
    if n > 1:
        groessen = ndi.sum(a > 0.5, fest, range(1, n + 1))
        haupt = ndi.binary_dilation(fest == (1 + int(np.argmax(groessen))), iterations=3)
        a = a * haupt
    a = np.maximum(a, ndi.binary_fill_holes(a > 0.5) * 1.0)
    return ndi.gaussian_filter(a, 0.9)


def tiefenkarte(bild, alpha, m):
    """Tiefe aus Umriss (jede Bildzeile wölbt sich von Rand zu Rand) plus
    Nase, Augenhöhlen, Lippen, Kinn und ein feines Relief aus der Helligkeit."""
    x0, y0, x1, y1 = m["ausschnitt"]
    B, H = bild.size
    yy, xx = np.mgrid[0:H, 0:B].astype(float)
    X = xx + x0
    Y = yy + y0
    cx = m["mitte_x"]
    W0 = float(m["kopfbreite_halb"])

    # Umrisskanten je Zeile, geglättet
    fest = alpha > 0.5
    links = np.full(H, np.nan)
    rechts = np.full(H, np.nan)
    for r in range(H):
        sp = np.flatnonzero(fest[r])
        if sp.size > 8:
            links[r], rechts[r] = sp[0], sp[-1]
    gueltig = ~np.isnan(links)
    idx = np.arange(H)
    links = np.interp(idx, idx[gueltig], links[gueltig])
    rechts = np.interp(idx, idx[gueltig], rechts[gueltig])
    links = ndi.gaussian_filter1d(links, 14)
    rechts = ndi.gaussian_filter1d(rechts, 14)
    mitte = (links + rechts) / 2
    halb = np.maximum((rechts - links) / 2, 20)
    u = (xx - mitte[:, None]) / halb[:, None]
    woelbung = np.clip(1 - u * u, 0, 1) ** 0.42          # vorn flach, seitlich steil

    # Schädel fällt nach oben hin zurück
    oben = m["haar_oben"]
    by = m["brauen_y"]
    fy = np.where(Y < by, np.sqrt(np.clip(1 - ((by - Y) / (by - oben + 25.0)) ** 2, 0, 1)), 1.0)
    z = 0.82 * W0 * woelbung * (0.30 + 0.70 * fy)

    # Hals liegt hinter dem Kiefer
    kx, ky = m["kinn"]
    lo = m["ohrlaeppchen_y"]
    kiefer_y = ky - (ky - lo) * np.clip(np.abs(X - kx) / (W0 * 0.91), 0, 1) ** 2.3
    z -= 0.34 * W0 * glatt(0, 50, Y - kiefer_y)

    # Nase
    nx, ny = m["nasenspitze"]
    nw = m["nasenwurzel_y"]
    s = np.clip((Y - nw) / (ny - nw), 0, 1)
    staerke = W0 * (0.05 + 0.20 * s ** 1.3)
    staerke = np.where(Y > ny, 0.25 * W0 * (1 - glatt(ny, ny + 44, Y)), staerke)
    staerke = np.where(Y < nw, 0.05 * W0 * glatt(nw - 60, nw, Y), staerke)
    sigma = 17 + 21 * s
    z += staerke * np.exp(-((X - nx) ** 2) / (2 * sigma ** 2))

    def huegel(px, py, sx, sy, hoehe):
        return hoehe * W0 * np.exp(-(((X - px) ** 2) / (2 * sx * sx) + ((Y - py) ** 2) / (2 * sy * sy)))

    z += huegel(*m["auge_links"], 58, 30, -0.085)
    z += huegel(*m["auge_rechts"], 58, 30, -0.085)
    mx, my = m["mund"]
    z += huegel(mx, my - 42, 85, 45, 0.040)        # Bereich über der Lippe
    z += huegel(mx, my, 70, 24, 0.045)             # Lippen
    z += huegel(kx, ky - 53, 60, 40, 0.050)        # Kinn

    # feines Relief: dunkle Stellen liegen etwas tiefer (Locken, Schatten)
    hell = np.asarray(bild.convert("L")).astype(float)
    hochpass = np.clip((ndi.gaussian_filter(hell, 2.0) - ndi.gaussian_filter(hell, 16)) / 38.0, -1, 1)
    gewicht = 1.0 - 0.70 * glatt(by - 105, by - 40, Y) * (np.abs(X - cx) < W0 * 0.84)
    z += 0.040 * W0 * hochpass * gewicht

    z = ndi.gaussian_filter(z, 2.4)
    z = np.clip(z, 0, None) * (alpha > 0.02)
    return z / (1.25 * W0)      # 0..1; 1.0 entspricht 1,25 halben Kopfbreiten


def raender_entfaerben(rgb, alpha):
    """An der Kante mischt sich Türfarbe ins Haar. Dort wird die Farbe
    durch die der sicheren Nachbarn ersetzt."""
    kern = (alpha > 0.92).astype(float)
    z = np.zeros_like(rgb, float)
    for k in range(3):
        z[..., k] = ndi.gaussian_filter(rgb[..., k] * kern, 7)
    n = ndi.gaussian_filter(kern, 7)[..., None]
    innen = z / np.maximum(n, 1e-4)
    t = glatt(0.55, 0.95, alpha)[..., None]
    aus = rgb * t + innen * (1 - t)
    return np.where(n > 1e-3, aus, rgb)


def als_daten_uri(bild, fmt, **kw):
    puffer = io.BytesIO()
    bild.save(puffer, fmt, **kw)
    art = "jpeg" if fmt == "JPEG" else "png"
    return f"data:image/{art};base64," + base64.b64encode(puffer.getvalue()).decode("ascii")


def main():
    m = MASSE
    voll = Image.open(FOTO).convert("RGB")
    bild = voll.crop(m["ausschnitt"])
    B, H = bild.size
    x0, y0, _, _ = m["ausschnitt"]

    alpha = freisteller(bild, m)
    a0, a1 = m["ausblenden_von_bis"]
    yy, xx = np.mgrid[0:H, 0:B].astype(float)
    X, Y = xx + x0, yy + y0
    alpha_voll = alpha.copy()
    # Der Hals löst sich in einer Schale auf, die dem Kiefer folgt
    kx, ky = m["kinn"]
    kiefer_y = ky - (ky - m["ohrlaeppchen_y"]) * np.clip(
        np.abs(X - kx) / (m["kopfbreite_halb"] * 0.91), 0, 1) ** 2.3
    alpha = alpha * (1 - glatt(18, 100, Y - kiefer_y)) * (1 - glatt(a0, a1, Y))

    z = tiefenkarte(bild, alpha_voll, m)
    rgb = raender_entfaerben(np.asarray(bild).astype(float), alpha_voll)

    farbe = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    daten = np.zeros((H, B, 3), np.uint8)
    daten[..., 0] = np.clip(z * 255, 0, 255)
    daten[..., 1] = np.clip(alpha * 255, 0, 255)
    # Blau: Deckkraft fürs Porträt weiter unten auf der Seite (mit Hals)
    daten[..., 2] = np.clip(alpha_voll * (1 - glatt(a0 - 5, a1 + 5, Y)) * 255, 0, 255)
    daten_bild = Image.fromarray(daten)

    werte = {
        "breite": B, "hoehe": H,
        "tiefe_massstab": 1.25,                      # Tiefe 1.0 = 1,25 halbe Kopfbreiten
        "halbe_kopfbreite": m["kopfbreite_halb"],
        "mitte": [m["mitte_x"] - x0, m["brauen_y"] + 40 - y0],   # Drehpunkt im Ausschnitt
        "farbe": als_daten_uri(farbe, "JPEG", quality=90, subsampling=0),
        "daten": als_daten_uri(daten_bild, "PNG", optimize=True),
    }
    kopf = "// Erzeugt von werkzeug/kopf-bauen.py — nicht von Hand ändern.\n"
    kopf += "window.KOPF = " + json.dumps(werte) + ";\n"
    ZIEL.write_text(kopf, encoding="utf-8")
    print(f"kopf.js geschrieben: {ZIEL.stat().st_size / 1024:.0f} KB, Ausschnitt {B}x{H}, "
          f"Kopf-Anteil {100 * (alpha > 0.5).mean():.0f} %")

    if "--pruefbilder" in sys.argv:
        PRUEF.mkdir(exist_ok=True)
        grund = np.array([226, 216, 213], float)
        misch = rgb * alpha[..., None] + grund * (1 - alpha[..., None])
        Image.fromarray(misch.astype(np.uint8)).save(PRUEF / "freisteller.png")
        Image.fromarray((np.clip(z, 0, 1) * 255).astype(np.uint8)).save(PRUEF / "tiefe.png")
        print("Prüfbilder in", PRUEF)


if __name__ == "__main__":
    main()
