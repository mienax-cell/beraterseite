// kamera.mjs — fotografiert die Seite in einer Fenstergröße an vielen Scroll-Ständen.
// Die Seite läuft dabei wirklich (kein Standbild): gescrollt wird, dann gewartet, dann fotografiert.
//
//   node werkzeug/kamera.mjs --name opera --b 860 --h 880
//   node werkzeug/kamera.mjs --name handy --b 390 --h 844 --mobil --port 9342
//   node werkzeug/kamera.mjs --name breit --b 1920 --h 1080 --p 0,0.2,0.47,0.68,1
//   node werkzeug/kamera.mjs --name opera --b 860 --h 880 --inhalt      (auch die Abschnitte unter der Bühne)
//
// Ergebnis: werkzeug/pruef/<name>/p000.png … und ein Übersichtsbogen bogen.png (alle Stände in einem Bild).
// Mit --inhalt zusätzlich inhalt_1.png … (die ganze Seite unter der Bühne, in Streifen).
// Am Ende steht ein kurzer Bericht als JSON (Fehlermeldungen, Überlappungen von Text und Motiv).
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { starte, PRUEF, HIER } from './cdp.mjs';

const arg = (n, ersatz) => { const i = process.argv.indexOf('--' + n); return i < 0 ? ersatz : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const name = arg('name', 'probe'), B = +arg('b', 1280), H = +arg('h', 720), dpr = +arg('dpr', 1), port = +arg('port', 9333);
const url = arg('url', 'http://localhost:8736/'), mobil = !!arg('mobil', false), pause = +arg('warte', 1300);
const staende = String(arg('p', '0,0.06,0.12,0.17,0.22,0.27,0.31,0.36,0.42,0.47,0.52,0.58,0.63,0.68,0.75,0.82,0.9,1')).split(',').map(Number);
const ordner = join(PRUEF, name);
rmSync(ordner, { recursive: true, force: true });            // alte Fotos dieses Namens weg, sonst mischen sie sich in den Bogen

const b = await starte({ b: B, h: H, dpr, port, mobil });
const bericht = { name, groesse: `${B}x${H}`, dpr, mobil, staende: [] };
try {
  await b.oeffne(url, 4200);                                    // Auftritt abwarten
  bericht.start = await b.js(`({bereit: !!(window.SZENE && SZENE.bereit), aktiv: !!(window.SZENE && SZENE.aktiv), grund: window.SZENE && SZENE.grund, punkte: window.SZENE && SZENE.punkte, innen: innerWidth + 'x' + innerHeight})`);
  const lauf = await b.js(`document.getElementById('reise').offsetHeight - innerHeight`);
  for (const p of staende) {
    await b.js(`window.scrollTo({top: ${Math.round(lauf * p)}, behavior: 'instant'})`);
    await b.warte(pause);
    // Messen: liegt sichtbarer Text unter/über dem Rand, ragt etwas aus dem Bild?
    const m = await b.js(`(() => {
      const sichtbar = [...document.querySelectorAll('.kapitel')].filter((k) => +getComputedStyle(k).opacity > 0.5);
      const r = (e) => { const q = e.getBoundingClientRect(); return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; };
      const marken = [...document.querySelectorAll('.marke')].filter((k) => +getComputedStyle(k).opacity > 0.5).map(r);
      return { p: window.SZENE && typeof SZENE.p === 'number' ? +SZENE.p.toFixed(3) : null, modus: document.getElementById('buehne').dataset.modus, rahmen: window.SZENE && SZENE.masse ? SZENE.masse.rahmen : null, kapitel: sichtbar.map((k) => ({ schild: k.querySelector('.schild')?.textContent, rechteck: r(k) })), marken };
    })()`);
    const datei = 'p' + String(Math.round(p * 100)).padStart(3, '0') + '.png';
    await b.foto(join(ordner, datei));
    bericht.staende.push({ soll: p, ...m, datei });
  }
  if (arg('inhalt', false)) {
    await b.oeffne(url + (url.includes('?') ? '&' : '?') + 'nur=inhalt', 2500);
    const hoehe = await b.js('document.documentElement.scrollHeight');
    for (let y = 0; y < hoehe; y += Math.round(H * 0.7)) { await b.js(`window.scrollTo({top: ${y}, behavior: 'instant'})`); await b.warte(160); }
    await b.js(`window.scrollTo({top: 0, behavior: 'instant'})`); await b.warte(900);
    await b.foto(join(ordner, 'inhalt.png'), true);
    bericht.inhalt = await b.js(`({hoehe: document.documentElement.scrollHeight, breiter_als_fenster: document.documentElement.scrollWidth > innerWidth,
      nicht_eingeblendet: document.querySelectorAll('.zeig:not(.da)').length})`);
  }
  bericht.fehler = b.fehler;
} finally { await b.ende(); }

try {
  const aus = execFileSync('python', [join(HIER, 'bogen.py'), ordner, String(B), String(H)], { encoding: 'utf8' });
  bericht.bogen = aus.trim().split('\n');
} catch (e) { bericht.bogen = 'Bogen fehlgeschlagen: ' + e.message; }
console.log(JSON.stringify(bericht, null, 1));
