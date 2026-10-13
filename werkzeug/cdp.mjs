// cdp.mjs — steuert ein unsichtbares Edge fern (Chrome DevTools Protocol).
// Kleiner Baustein für kamera.mjs, probelauf.mjs und eigene Prüfskripte.
//
//   import { starte } from './cdp.mjs';
//   const b = await starte({ b: 860, h: 880, port: 9341 });
//   await b.oeffne('http://localhost:8736/');
//   await b.js('document.title');           // JavaScript in der Seite ausführen
//   await b.foto('C:/…/bild.png');          // Bildschirmfoto des sichtbaren Bereichs
//   await b.ende();
//
// Jeder gleichzeitige Lauf braucht einen eigenen Port.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export const HIER = dirname(fileURLToPath(import.meta.url));
export const PRUEF = join(HIER, 'pruef');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const warte = (ms) => new Promise((r) => setTimeout(r, ms));

export async function starte({ b = 1280, h = 720, dpr = 1, port = 9333, mobil = false, programm = EDGE, sichtbar = false } = {}) {
  const profil = join(tmpdir(), `beraterseite-pruef-${port}`);
  mkdirSync(profil, { recursive: true });
  const prozess = spawn(programm, [
    ...(sichtbar ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--window-size=${Math.max(b, 500)},${h}`, 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const liste = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      wsUrl = (liste.find((t) => t.type === 'page') || {}).webSocketDebuggerUrl || null;
    } catch (e) { /* startet noch */ }
    if (!wsUrl) await warte(250);
  }
  if (!wsUrl) { prozess.kill(); throw new Error(`Browser antwortet nicht auf Port ${port}`); }

  const ws = new WebSocket(wsUrl);
  await new Promise((r, x) => { ws.addEventListener('open', r); ws.addEventListener('error', x); });
  let nr = 0;
  const offen = new Map(), fehler = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && offen.has(d.id)) { offen.get(d.id)(d.result || d.error); offen.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') fehler.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) {
      fehler.push(d.params.type + ': ' + d.params.args.map((a) => a.value || a.description).join(' '));
    }
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') fehler.push('log: ' + d.params.entry.text + ' ' + (d.params.entry.url || ''));
  });
  const sende = (method, params = {}) => new Promise((r) => { const id = ++nr; offen.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (ausdruck) => {
    const r = await sende('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  };
  await sende('Runtime.enable'); await sende('Page.enable'); await sende('Log.enable');
  const groesse = (bb, hh, d = dpr, m = mobil) => sende('Emulation.setDeviceMetricsOverride', { width: bb, height: hh, deviceScaleFactor: d, mobile: m });
  await groesse(b, h);
  if (mobil) await sende('Emulation.setTouchEmulationEnabled', { enabled: true });

  return {
    sende, js, fehler, warte, groesse,
    async oeffne(url, wartezeit = 2600) { await sende('Page.navigate', { url }); await warte(wartezeit); },
    async foto(pfad, ganzeSeite = false) {
      const p = { format: 'png' };
      if (ganzeSeite) {
        const g = await js('({b: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight})');
        p.captureBeyondViewport = true; p.clip = { x: 0, y: 0, width: g.b, height: Math.min(g.h, 16000), scale: 1 };
      }
      const bild = await sende('Page.captureScreenshot', p);
      mkdirSync(dirname(pfad), { recursive: true });
      writeFileSync(pfad, Buffer.from(bild.data, 'base64'));
      return pfad;
    },
    async rad(deltaY, x = b / 2, y = h / 2) { await sende('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY }); },
    async klick(x, y) {
      await sende('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sende('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async maus(x, y) { await sende('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); },
    async ende() { try { ws.close(); } catch (e) {} prozess.kill(); await warte(300); try { rmSync(profil, { recursive: true, force: true }); } catch (e) {} },
  };
}
