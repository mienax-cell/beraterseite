// probelauf.mjs — lässt die Seite wirklich laufen und scrollt sie durch.
//
// Startet ein unsichtbares Edge, öffnet die laufende Vorschau (Port 8736),
// wartet den Auftritt ab, scrollt in Etappen durch die Bühne und misst dabei:
// kommt der Scroll-Stand im 3D-Bild an, wie viele Bilder pro Sekunde, Fehler?
// Bilder landen in werkzeug/pruef/lauf_*.png.
//
//   node werkzeug/probelauf.mjs            (Rechner, 1280 x 720)
//   node werkzeug/probelauf.mjs 390 780    (Handygröße)
//
// Braucht nichts außer Node (ab 22) und Edge.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const PRUEF = join(HIER, 'pruef');
mkdirSync(PRUEF, { recursive: true });
const B = +(process.argv[2] || 1280), H = +(process.argv[3] || 720);
const PORT = 9333, SEITE = 'http://localhost:8736/';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(PRUEF, '.edge-lauf')}`,
  '--no-first-run', '--hide-scrollbars', `--window-size=${Math.max(B, 500)},${H}`, 'about:blank',
], { stdio: 'ignore' });

async function ziel() {
  for (let i = 0; i < 40; i++) {
    try {
      const liste = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const seite = liste.find((t) => t.type === 'page');
      if (seite) return seite.webSocketDebuggerUrl;
    } catch (e) { /* Edge startet noch */ }
    await warte(250);
  }
  throw new Error('Edge antwortet nicht');
}

let nr = 0;
const offen = new Map(), fehler = [];
const ws = new WebSocket(await ziel());
await new Promise((r) => ws.addEventListener('open', r));
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && offen.has(d.id)) { offen.get(d.id)(d.result || d.error); offen.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') fehler.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') fehler.push(d.params.args.map((a) => a.value || a.description).join(' '));
});
const sende = (method, params = {}) => new Promise((r) => { const id = ++nr; offen.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (ausdruck) => (await sende('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true })).result?.value;
const foto = async (name) => {
  const b = await sende('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(PRUEF, `lauf_${name}.png`), Buffer.from(b.data, 'base64'));
};

const bericht = { groesse: `${B}x${H}` };
try {
  await sende('Runtime.enable'); await sende('Page.enable');
  await sende('Emulation.setDeviceMetricsOverride', { width: B, height: H, deviceScaleFactor: 1, mobile: B < 600 });
  await sende('Page.navigate', { url: SEITE });
  await warte(600);
  await foto('0_auftritt');                                  // mitten im Auftritt: Staub
  await warte(3200);
  bericht.start = await js(`({bereit: SZENE.bereit, aktiv: SZENE.aktiv, punkte: SZENE.punkte, faeden: SZENE.faeden, p: +SZENE.p.toFixed(3),
    grafik: (() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unbekannt'; })()})`);
  await foto('1_kopf');
  bericht.bilderProSekunde = await js(`new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; performance.now() - t < 2000 ? requestAnimationFrame(f) : r(Math.round(n / 2)); }; requestAnimationFrame(f); })`);

  // Scrollen wie ein Mensch: mit dem Mausrad, in vielen kleinen Schritten
  const lauf = await js(`document.getElementById('reise').offsetHeight - innerHeight`);
  bericht.etappen = [];
  let stand = 0;
  for (const [name, anteil] of [['2_linien', 0.2], ['3_faeden', 0.47], ['4_strang', 0.68], ['5_bluete', 1.0]]) {
    const zielY = Math.round(lauf * anteil);
    while (stand < zielY) {
      const schritt = Math.min(120, zielY - stand);
      await sende('Input.dispatchMouseEvent', { type: 'mouseWheel', x: B / 2, y: H / 2, deltaX: 0, deltaY: schritt });
      stand += schritt; await warte(16);
    }
    await warte(1800);                                        // Nachziehen ausklingen lassen
    const m = await js(`({scrollY: Math.round(scrollY), ziel: +SZENE.ziel.toFixed(3), p: +SZENE.p.toFixed(3),
      kapitel: [...document.querySelectorAll('.kapitel')].filter((k) => +k.style.opacity > 0.5).map((k) => k.querySelector('.schild').textContent)})`);
    bericht.etappen.push({ name, soll: anteil, ...m });
    await foto(name);
  }
  // weiter hinunter: scrollt die Bühne weg und kommt der Inhalt?
  await js(`window.scrollTo({top: ${lauf} + innerHeight * 1.05, behavior: 'instant'})`);
  await warte(1500);
  bericht.danach = await js(`({buehneOben: Math.round(document.getElementById('buehne').getBoundingClientRect().top), eingeblendet: document.querySelectorAll('.zeig.da').length, zeichnetNoch: SZENE.sichtbar})`);
  await foto('6_inhalt');
  bericht.fehler = fehler;
} finally {
  ws.close(); edge.kill();
}
console.log(JSON.stringify(bericht, null, 2));
