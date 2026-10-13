/* seite.js — alles außer der 3D-Bühne:
 * Angaben einsetzen, Kapitel zum Scrollen schalten, Rechner, Formular, Blätter.
 */
(function () {
  'use strict';
  const I = window.INHALT, S = window.SZENE || { aktiv: false, ziel: 0 };
  const $ = (q, w = document) => w.querySelector(q);
  const $$ = (q, w = document) => Array.from(w.querySelectorAll(q));
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const weich = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const neu = (tag, klasse, text) => { const e = document.createElement(tag); if (klasse) e.className = klasse; if (text != null) e.textContent = text; return e; };

  // ================================================================ Angaben
  const LAGER = 'beraterseite.angaben.v1';
  let eigene = {};
  try { eigene = JSON.parse(localStorage.getItem(LAGER) || '{}') || {}; } catch (e) { eigene = {}; }
  const frage = new URLSearchParams(location.search);
  // Der Knopf „Entwurf“ zum Ausfüllen erscheint nur bei dir: beim Öffnen von der Festplatte, in der
  // lokalen Vorschau oder mit ?entwurf in der Adresse. Besucher im Netz sehen ihn nie.
  const lokal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const entwurf = !frage.has('fertig') && (lokal || frage.has('entwurf'));

  function angabe(k) {
    const f = I.felder[k]; if (!f) return { wert: '', stand: 'ok', leer: true };
    const e = eigene[k] || {};
    const wert = String(e.wert != null ? e.wert : f.wert || '').trim();
    let stand = f.status;
    if (stand === 'offen' && (wert || e.ok || f.freiwillig)) stand = 'ok';
    if (stand === 'pruefen' && (e.ok || (e.wert != null && String(e.wert).trim() !== (f.wert || '').trim()))) stand = 'ok';
    return { wert, stand, leer: !wert };
  }
  const offeneZahl = () => Object.keys(I.felder).filter((k) => angabe(k).stand !== 'ok').length;

  // Die Seite zeigt nur, was feststeht. Was fehlt, bleibt einfach weg (kein Platzhalter):
  // Elemente mit data-wenn="feld" verschwinden, solange das Feld leer ist.
  function setzeAngaben() {
    $$('[data-feld]').forEach((el) => {
      const a = angabe(el.dataset.feld);
      el.textContent = a.wert || (el.closest('dialog.blatt') ? '—' : '');
    });
    $$('[data-wenn]').forEach((el) => { el.hidden = angabe(el.dataset.wenn).leer; });
    $$('[data-wenn-leer]').forEach((el) => { el.hidden = !angabe(el.dataset.wennLeer).leer; });
    const name = [angabe('vorname').wert, angabe('nachname').wert].filter(Boolean).join(' ');
    document.title = [name, angabe('titel').wert].filter(Boolean).join(' · ');

    // Kontaktwege: ein Knopf erscheint erst, wenn die Angabe da ist
    const ziffern = (s) => s.replace(/[^\d+]/g, '');
    const wege = {
      telefon: (w) => 'tel:' + ziffern(w),
      whatsapp: (w) => 'https://wa.me/' + ziffern(w).replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '49'),
      email: (w) => 'mailto:' + w,
    };
    let sichtbar = 0;
    $$('[data-weg]').forEach((el) => {
      const k = el.dataset.weg, a = angabe(k);
      el.hidden = a.leer;
      if (a.leer) el.removeAttribute('href'); else { el.href = wege[k](a.wert); sichtbar++; }
    });
    $$('.wege').forEach((el) => { el.hidden = !sichtbar; });
    const termin = angabe('termin_link');
    $$('[data-termin]').forEach((el) => {
      if (termin.leer) { el.href = '#kontakt'; el.removeAttribute('target'); el.removeAttribute('rel'); }
      else { el.href = termin.wert; el.target = '_blank'; el.rel = 'noopener'; }
    });

    const n = offeneZahl();
    document.documentElement.classList.toggle('entwurf-an', entwurf && n > 0);
    $('#entwurfstext').textContent = 'Entwurf · ' + n + ' offen';
    $('#entwurfhinweis').hidden = !!I.veroeffentlicht;
  }

  // ---- Schublade zum Ausfüllen
  const schub = $('#angaben'), leib = $('#angabenleib'), meldung = $('#angabenMeldung');
  const STANDWORT = { offen: 'offen', pruefen: 'bitte prüfen', ok: 'steht' };

  function baueSchublade() {
    leib.textContent = '';
    leib.append(neu('p', 'geruest', 'Was du hier einträgst, siehst nur du – in diesem Browser auf diesem Gerät. Besucher und dein Handy sehen es erst, wenn Claude es fest in die Seite schreibt: unten auf „Für Claude kopieren“ und in den Chat einfügen.'));
    I.gruppen.forEach((titel, g) => {
      leib.append(neu('h3', '', titel));
      Object.keys(I.felder).filter((k) => I.felder[k].gruppe === g).forEach((k) => {
        const f = I.felder[k], a = angabe(k), e = eigene[k] || {};
        const zeile = neu('div', 'angabe');
        const oben = neu('div', 'oben');
        oben.append(neu('b', '', f.name), neu('span', 'zustand ' + a.stand, STANDWORT[a.stand]));
        zeile.append(oben);
        if (f.hinweis) zeile.append(neu('small', '', f.hinweis));
        const feld = f.lang ? neu('textarea') : neu('input');
        if (!f.lang) feld.type = 'text';
        feld.value = e.wert != null ? e.wert : (f.wert || '');
        feld.placeholder = f.ersatz || '';
        feld.dataset.k = k; feld.setAttribute('aria-label', f.name);
        zeile.append(feld);
        // Haken nur, wo er Sinn hat: „Passt so“ bei Entwürfen, „Brauche ich nicht“ bei Angaben, die keine Pflicht sind
        if (f.status === 'pruefen' || (f.status === 'offen' && !f.pflicht && !f.freiwillig)) {
          const l = neu('label', 'passt'), c = neu('input');
          c.type = 'checkbox'; c.dataset.ok = k; c.checked = !!e.ok;
          l.append(c, document.createTextNode(f.status === 'pruefen' ? 'Passt so' : 'Brauche ich nicht'));
          zeile.append(l);
        }
        leib.append(zeile);
      });
    });
  }

  function leseSchublade() {
    const neuE = {};
    $$('[data-k]', leib).forEach((el) => {
      const k = el.dataset.k, f = I.felder[k], wert = el.value;
      const ok = !!($('[data-ok="' + k + '"]', leib) || {}).checked;
      if (wert.trim() !== (f.wert || '').trim() || ok) neuE[k] = { wert, ok };
    });
    return neuE;
  }

  function alsText() {
    const aus = {};
    Object.keys(I.felder).forEach((k) => { const a = angabe(k); aus[k] = { wert: a.wert, stand: a.stand }; });
    return JSON.stringify({ seite: 'beraterseite', stand: new Date().toISOString().slice(0, 10), angaben: aus }, null, 2);
  }

  function sichern(leise) {
    eigene = leseSchublade();
    let ging = true;
    try { localStorage.setItem(LAGER, JSON.stringify(eigene)); } catch (e) { ging = false; }
    setzeAngaben(); baueSchublade();
    if (!leise) {
      const n = offeneZahl();
      meldung.textContent = !ging ? 'Übernommen, aber dieser Browser kann es sich nicht merken. Nimm „Für Claude kopieren“.'
        : 'Gemerkt – nur in diesem Browser. ' + (n === 0 ? 'Alles ausgefüllt.' : n === 1 ? '1 Angabe ist noch offen.' : n + ' Angaben sind noch offen.');
    }
  }

  $('#ausfuellen').addEventListener('click', () => { baueSchublade(); meldung.textContent = ''; schub.showModal(); });
  $('#angabenSichern').addEventListener('click', () => sichern(false));
  $('#angabenKopieren').addEventListener('click', async () => {
    sichern(true);
    const text = alsText();
    try { await navigator.clipboard.writeText(text); meldung.textContent = 'Kopiert. Füg es einfach in den Chat mit Claude ein.'; }
    catch (e) {
      const t = neu('textarea'); t.value = text; document.body.append(t); t.select();
      const ok = document.execCommand && document.execCommand('copy'); t.remove();
      meldung.textContent = ok ? 'Kopiert. Füg es einfach in den Chat mit Claude ein.' : 'Kopieren ging nicht. Nimm „Als Datei sichern“.';
    }
  });
  $('#angabenDatei').addEventListener('click', () => {
    sichern(true);
    const a = neu('a'); a.href = URL.createObjectURL(new Blob([alsText()], { type: 'application/json' }));
    a.download = 'angaben-beraterseite.json'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    meldung.textContent = 'Die Datei liegt in deinen Downloads – als Sicherung für dich.';
  });

  // ---- Blätter (Impressum und Co.)
  $$('[data-blatt]').forEach((b) => b.addEventListener('click', () => $('#' + b.dataset.blatt).showModal()));
  const blattStand = () => document.documentElement.classList.toggle('blatt-offen', !!$('dialog[open]'));
  $$('dialog').forEach((d) => {
    d.addEventListener('close', blattStand);
    new MutationObserver(blattStand).observe(d, { attributes: true, attributeFilter: ['open'] });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    $$('[data-zu]', d).forEach((z) => z.addEventListener('click', () => d.close()));
  });

  // ============================================================== Inhalte
  const zahlenliste = $('#zahlenliste');
  I.zahlen.forEach((z, i) => {
    const el = neu('article', 'zahl zeig'); el.style.setProperty('--i', i);
    el.append(neu('strong', '', z.wert), neu('h3', '', z.titel), neu('p', '', z.text), neu('small', '', 'Quelle: ' + z.quelle));
    zahlenliste.append(el);
  });
  const karten = $('#karten');
  I.faeden.forEach((f, i) => {
    const el = neu('article', 'karte zeig'); el.style.setProperty('--i', i % 3);
    el.append(neu('span', 'faden'), neu('span', 'nr', '0' + (i + 1)), neu('h3', '', f.name), neu('p', '', f.text), neu('p', 'frage', '„' + f.frage + '“'));
    karten.append(el);
  });
  const wahl = $('#wahl');
  I.faeden.map((f) => f.name).concat(['Weiß ich noch nicht']).forEach((name) => {
    const l = neu('label'), c = neu('input'); c.type = 'checkbox'; c.name = 'thema'; c.value = name;
    l.append(c, neu('span', '', name)); wahl.append(l);
  });
  const themenzeile = $('#themenzeile');
  I.faeden.forEach((f) => themenzeile.append(neu('li', '', f.name)));
  $('#jahr').textContent = new Date().getFullYear();
  setzeAngaben();

  // =============================================================== Bühne
  const reise = $('#reise'), buehne = $('#buehne'), kapitel = $$('.kapitel'), striche = $$('#leiste li');
  const glut = $('#kernglut'), markenBox = $('#marken'), kopfzeile = $('#kopfzeile');
  const marken = I.faeden.map((f, i) => {
    const el = neu('div', 'marke'); el.append(neu('b', '', '0' + (i + 1)), document.createTextNode(f.name));
    markenBox.append(el); return el;
  });
  let markenMass = marken.map(() => [140, 24]);
  const GRENZEN = [0.115, 0.30, 0.525, 0.74];

  // Ordnung der Bühne: Je nach Fenster steht der Text links (breit) oder unten (hoch).
  // Der Rest der Fläche ist der Rahmen für das 3D-Motiv. Den bekommt die Szene mitgeteilt,
  // damit Kopf, Fäden, Strang und Blüte nie über dem Text liegen.
  function ordneBuehne() {
    const B = buehne.clientWidth, H = buehne.clientHeight;
    if (!B || !H) return;
    const breit = B >= 620 && B / H >= 1.15;       // quer genug für Text neben dem Motiv
    buehne.dataset.modus = breit ? 'breit' : 'hoch';
    const oben = Math.round((kopfzeile.offsetHeight || 64) + 4);
    let r;
    if (breit) {
      const rechts = Math.max(...kapitel.map((k) => k.offsetLeft + k.offsetWidth));
      const luft = clamp(B * 0.035, 28, 64);
      r = { x: rechts + luft, y: oben, b: B - rechts - luft * 1.7, h: H - oben - 30 };
    } else {
      const textOben = Math.min(...kapitel.map((k) => k.offsetTop));
      r = { x: 14, y: oben, b: B - 28, h: textOben - oben - 16 };
    }
    // Schwebende Beschriftungen an den Fadenspitzen brauchen Platz. Fehlt er, stehen die sechs Themen im Text.
    const schweben = breit && r.b >= 620;
    buehne.dataset.marken = schweben ? 'an' : 'aus';
    S.rahmen = r; S.modus = breit ? 'breit' : 'hoch'; S.marken = schweben;
    buehne.style.setProperty('--mx', (r.x + r.b / 2).toFixed(0) + 'px');
    buehne.style.setProperty('--my', (r.y + r.h / 2).toFixed(0) + 'px');
    markenMass = marken.map((el) => [el.offsetWidth || 140, el.offsetHeight || 24]);
  }

  function fortschritt() {
    const r = reise.getBoundingClientRect(), lauf = r.height - window.innerHeight;
    return lauf > 0 ? clamp(-r.top / lauf) : 0;
  }
  function beimScrollen() {
    S.ziel = fortschritt();
    kopfzeile.classList.toggle('fest', reise.getBoundingClientRect().bottom < 70);
  }
  window.addEventListener('scroll', beimScrollen, { passive: true });
  // Wird das Fenster breiter oder schmaler, ändert sich die Länge der Bühne. Damit man nicht in ein
  // anderes Kapitel rutscht, bleibt der Scroll-Stand derselbe. (Nur bei geänderter Breite: am Handy
  // ändert sich die Höhe ständig, wenn die Adressleiste ein- und ausfährt.)
  let alteBreite = window.innerWidth;
  window.addEventListener('resize', () => {
    const p = S.ziel, breiteNeu = window.innerWidth !== alteBreite;
    alteBreite = window.innerWidth;
    ordneBuehne();
    if (breiteNeu && p > 0 && p < 1) {
      const lauf = reise.offsetHeight - window.innerHeight;
      window.scrollTo({ top: reise.offsetTop + lauf * p, behavior: 'instant' });
    }
    beimScrollen();
  });
  if ('ResizeObserver' in window) new ResizeObserver(ordneBuehne).observe(buehne);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ordneBuehne);
  ordneBuehne(); beimScrollen();

  let letzterIndex = -1;
  function schalteKapitel(p) {
    kapitel.forEach((el) => {
      const von = +el.dataset.von, bis = +el.dataset.bis;
      const rein = von < 0 ? 1 : weich(von, von + 0.03, p), raus = bis > 1 ? 0 : weich(bis - 0.03, bis, p);
      const a = rein * (1 - raus);
      el.style.opacity = a.toFixed(3);
      el.style.visibility = a > 0.01 ? 'visible' : 'hidden';
      el.style.setProperty('--versatz', ((1 - rein) * 22 - raus * 22).toFixed(1) + 'px');
    });
    let i = 0; while (i < GRENZEN.length && p >= GRENZEN[i]) i++;
    if (i !== letzterIndex) { striche.forEach((li, k) => li.classList.toggle('an', k === i)); buehne.dataset.k = i; letzterIndex = i; }
  }

  if (S.aktiv) {
    S.beiBild = (z) => {
      schalteKapitel(z.p);
      const farbe = (c) => 'rgb(' + c.map((v) => Math.round(v)).join(',') + ')';
      buehne.style.setProperty('--hell', farbe(z.grund.hell));
      buehne.style.setProperty('--tief', farbe(z.grund.tief));
      const B = buehne.clientWidth, H = buehne.clientHeight;

      // Beschriftungen: rechts neben der Fadenspitze, untereinander geordnet, nie übereinander
      if (!z.marken.length) marken.forEach((el) => { if (el.style.opacity !== '0') el.style.opacity = '0'; });
      else {
        const hoehe = markenMass[0][1], luft = hoehe + 7;
        const liste = z.marken.map((m, i) => ({ i, x: m.x + 15, y: m.y - hoehe / 2 })).sort((a, b) => a.y - b.y);
        const ganzOben = z.rahmen.y + 4, ganzUnten = H - hoehe - 20;
        liste.forEach((m, k) => { m.y = Math.max(m.y, k ? liste[k - 1].y + luft : ganzOben); });
        for (let k = liste.length - 1; k >= 0; k--) liste[k].y = Math.min(liste[k].y, k < liste.length - 1 ? liste[k + 1].y - luft : ganzUnten);
        liste.forEach((m) => {
          const el = marken[m.i], x = clamp(m.x, 8, B - markenMass[m.i][0] - 12);
          el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + m.y.toFixed(1) + 'px)';
          el.style.opacity = z.marken[m.i].staerke.toFixed(3);
        });
      }

      const r = z.kern.radius;
      if (z.kern.staerke < 0.004) { if (glut.style.opacity !== '0') glut.style.opacity = '0'; }
      else {
        glut.style.width = glut.style.height = (2 * r).toFixed(0) + 'px';
        glut.style.transform = 'translate(' + (z.kern.x - r).toFixed(1) + 'px,' + (z.kern.y - r).toFixed(1) + 'px)';
        glut.style.opacity = (z.kern.staerke * 0.95).toFixed(3);
      }
    };
  }
  schalteKapitel(fortschritt());      // der Text wartet nicht auf die Grafik

  // =============================================================== Rechner
  const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const R = { rate: $('#rRate'), jahre: $('#rJahre'), rendite: $('#rRendite'), kaufkraft: $('#rKaufkraft') };
  const kurve = $('#kurve'), kx = kurve.getContext('2d');
  const INFLATION = 0.02;
  let zeigt = null, zielwerte = null, laeuft = false;

  // Guthaben nach m Monaten bei Einzahlung am Monatsende
  function guthaben(rate, renditeJahr, monate) {
    const i = Math.pow(1 + renditeJahr, 1 / 12) - 1;
    return i === 0 ? rate * monate : rate * (Math.pow(1 + i, monate) - 1) / i;
  }
  const eingestellt = () => ({ rate: +R.rate.value, jahre: +R.jahre.value, rendite: +R.rendite.value / 100, real: R.kaufkraft.checked });
  function rechne(e) {
    const { rate, jahre, rendite, real } = e;
    const wert = (m, start = 0) => {
      const v = m <= start ? 0 : guthaben(rate, rendite, m - start);
      return real ? v / Math.pow(1 + INFLATION, m / 12) : v;
    };
    const ein = (m) => real ? rate * m / Math.pow(1 + INFLATION, m / 12) : rate * m;
    const M = jahre * 12;
    return { rate, jahre, rendite, real, ende: wert(M), ein: ein(M), spaet: jahre > 5 ? wert(M, 60) : null, wert, einF: ein, M };
  }

  function zeichne(w) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), B = kurve.clientWidth, H = kurve.clientHeight;
    if (kurve.width !== Math.round(B * dpr)) { kurve.width = Math.round(B * dpr); kurve.height = Math.round(H * dpr); }
    kx.setTransform(dpr, 0, 0, dpr, 0, 0);
    kx.clearRect(0, 0, B, H);
    const l = 2, r = B - 26, o = 26, u = H - 30, max = Math.max(w.ende, w.ein, 1) * 1.04;
    const X = (m) => l + (r - l) * m / w.M, Y = (v) => u - (u - o) * v / max;
    const N = 90, pfad = (f, start = 0) => { kx.beginPath(); for (let i = 0; i <= N; i++) { const m = start + (w.M - start) * i / N; i ? kx.lineTo(X(m), Y(f(m))) : kx.moveTo(X(m), Y(f(m))); } };

    // Fläche der Einzahlungen
    pfad(w.einF); kx.lineTo(X(w.M), u); kx.lineTo(l, u); kx.closePath();
    kx.fillStyle = 'rgba(255,253,251,.07)'; kx.fill();
    pfad(w.einF); kx.setLineDash([3, 5]); kx.strokeStyle = 'rgba(255,253,251,.5)'; kx.lineWidth = 1; kx.stroke(); kx.setLineDash([]);

    // später angefangen
    if (w.spaet != null) {
      pfad((m) => w.wert(m, 60), 60); kx.setLineDash([1, 5]); kx.lineCap = 'round';
      kx.strokeStyle = 'rgba(240,138,44,.75)'; kx.lineWidth = 1.4; kx.stroke(); kx.setLineDash([]); kx.lineCap = 'butt';
    }

    // das Guthaben als Bündel feiner Fäden, die an der Spitze zusammenlaufen
    for (let k = 0; k < 9; k++) {
      kx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = i / N, m = w.M * t;
        const ab = (k ? Math.sin(t * (5 + k * 0.9) + k * 1.7) * (3.2 + k * 0.9) * Math.pow(1 - t, 0.7) * Math.min(1, t * 6) : 0);
        i ? kx.lineTo(X(m), Y(w.wert(m)) + ab) : kx.moveTo(X(m), Y(w.wert(m)) + ab);
      }
      kx.strokeStyle = k ? 'rgba(255,253,251,' + (0.34 - k * 0.025) + ')' : '#fffdfb';
      kx.lineWidth = k ? 0.8 : 1.7; kx.stroke();
    }
    const ex = X(w.M), ey = Y(w.ende), g = kx.createRadialGradient(ex, ey, 0, ex, ey, 26);
    g.addColorStop(0, 'rgba(255,220,170,.95)'); g.addColorStop(0.25, 'rgba(255,150,50,.55)'); g.addColorStop(1, 'rgba(255,130,40,0)');
    kx.fillStyle = g; kx.beginPath(); kx.arc(ex, ey, 26, 0, 7); kx.fill();
    kx.fillStyle = '#fff'; kx.beginPath(); kx.arc(ex, ey, 3, 0, 7); kx.fill();

    kx.font = '12px ' + getComputedStyle(document.body).fontFamily; kx.fillStyle = 'rgba(255,253,251,.62)'; kx.textBaseline = 'top';
    kx.textAlign = 'left'; kx.fillText('heute', l, u + 9);
    kx.textAlign = 'right'; kx.fillText('in ' + w.jahre + ' Jahren', r, u + 9);
    if (w.spaet != null && w.jahre >= 10) {
      // „Start fünf Jahre später“ unter seinen Punkt, aber nie in „heute“ oder „in … Jahren“ hinein
      const wort = 'Start fünf Jahre später', breite = kx.measureText(wort).width;
      const frei = l + kx.measureText('heute').width + 12, grenze = r - kx.measureText('in ' + w.jahre + ' Jahren').width - 12 - breite;
      const x = Math.max(frei, Math.min(X(60) - breite / 2, grenze));
      if (grenze >= frei) { kx.textAlign = 'left'; kx.fillStyle = 'rgba(240,138,44,.9)'; kx.fillText(wort, x, u + 9); }
    }
    const ye = Y(w.ein);
    if (Math.abs(ye - ey) > 26) { kx.textAlign = 'right'; kx.textBaseline = 'bottom'; kx.fillStyle = 'rgba(255,253,251,.62)'; kx.fillText('eingezahlt', r - 8, ye - 6); }
  }

  function zeigeZahlen(w) {
    $('#aRate').textContent = euro.format(w.rate);
    $('#aJahre').textContent = w.jahre + ' Jahre';
    $('#aRendite').textContent = (w.rendite * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
    $('#tEnde').textContent = w.real ? 'Am Ende, in heutiger Kaufkraft' : 'Am Ende';
    $('#tEin').textContent = w.real ? 'Eingezahlt, in heutiger Kaufkraft' : 'Eingezahlt';
    $('#eEnde').textContent = euro.format(w.ende);
    $('#eEin').textContent = euro.format(w.ein);
    $('#eErtrag').textContent = euro.format(Math.max(0, w.ende - w.ein));
    // Später anfangen: Lücke, davon weniger eingezahlt, davon weniger Ertrag – alles im selben Maßstab
    const sp = $('#spaeter'); sp.textContent = '';
    if (w.spaet == null) sp.textContent = 'Bei so kurzer Laufzeit zählt vor allem, was du einzahlst.';
    else {
      const luecke = w.ende - w.spaet, wenigerEin = w.ein * 60 / w.M, wenigerErtrag = luecke - wenigerEin;
      sp.append('Fünf Jahre später gestartet, sind es am Ende rund ', neu('b', '', euro.format(luecke)), ' weniger');
      sp.append(wenigerErtrag > 1
        ? ': ' + euro.format(wenigerEin) + ' weniger eingezahlt, ' + euro.format(wenigerErtrag) + ' weniger Ertrag.'
        : ' – genau das, was du nicht eingezahlt hast.');
    }
    Object.values(R).forEach((el) => { if (el.type === 'range') el.style.setProperty('--f', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); });
  }

  // Die Kurve gleitet zum neuen Stand, statt zu springen: die gezeigten
  // Einstellungen laufen den gewählten hinterher, gerechnet wird jedes Bild neu.
  function gleite() {
    const z = zielwerte, a = zeigt, f = 0.2;
    const nah = Math.abs(z.rate - a.rate) < 0.5 && Math.abs(z.jahre - a.jahre) < 0.02 && Math.abs(z.rendite - a.rendite) < 0.0002;
    zeigt = nah ? z : { rate: a.rate + (z.rate - a.rate) * f, jahre: a.jahre + (z.jahre - a.jahre) * f, rendite: a.rendite + (z.rendite - a.rendite) * f, real: z.real };
    const w = rechne(zeigt); w.jahre = z.jahre;
    zeichne(w);
    if (nah) laeuft = false; else requestAnimationFrame(gleite);
  }
  function aktualisiere(sofort) {
    zielwerte = eingestellt(); zeigeZahlen(rechne(zielwerte));
    if (sofort || !zeigt || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { zeigt = zielwerte; zeichne(rechne(zeigt)); return; }
    if (!laeuft) { laeuft = true; requestAnimationFrame(gleite); }
  }
  Object.values(R).forEach((el) => el.addEventListener('input', () => aktualisiere(false)));
  window.addEventListener('resize', () => aktualisiere(true));
  if ('ResizeObserver' in window) new ResizeObserver(() => aktualisiere(true)).observe(kurve);
  aktualisiere(true);

  // ============================================================= Porträt
  function zeichnePortrait(farbe, daten) {
    const K = window.KOPF, c = $('#portrait'), x = c.getContext('2d');
    c.width = K.breite; c.height = K.hoehe;
    const m = document.createElement('canvas'); m.width = K.breite; m.height = K.hoehe;
    const mx = m.getContext('2d'); mx.drawImage(daten, 0, 0);
    const d = mx.getImageData(0, 0, m.width, m.height);
    for (let i = 0; i < d.data.length; i += 4) { d.data[i + 3] = d.data[i + 2]; }      // Blau-Kanal = Deckkraft fürs Porträt
    mx.putImageData(d, 0, 0);
    x.drawImage(farbe, 0, 0);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0); x.globalCompositeOperation = 'source-over';
  }
  if (window.KOPF) {
    const lade = (q) => new Promise((ja) => { const b = new Image(); b.onload = () => ja(b); b.src = q; });
    Promise.all([lade(window.KOPF.farbe), lade(window.KOPF.daten)]).then(([f, d]) => zeichnePortrait(f, d));
  }

  // ====================================================== Einblenden, Kopf
  if ('IntersectionObserver' in window) {
    const seher = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('da'); seher.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    $$('.zeig').forEach((el) => seher.observe(el));

    const dunkle = new Set();
    const obenSeher = new IntersectionObserver((es) => {
      es.forEach((e) => e.isIntersecting ? dunkle.add(e.target) : dunkle.delete(e.target));
      kopfzeile.classList.toggle('auf-dunkel', dunkle.size > 0);
    }, { rootMargin: '-4% 0px -94% 0px' });
    $$('[data-dunkel]').forEach((el) => obenSeher.observe(el));

    const links = $$('.pille a');
    const ortSeher = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle('an', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((a) => { const z = $(a.getAttribute('href')); if (z) ortSeher.observe(z); });
    ortSeher.observe(reise);
  } else {
    $$('.zeig').forEach((el) => el.classList.add('da'));
  }

  // ============================================================ Formular
  $('#formular').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, hinweis = $('#formhinweis'), post = angabe('email');
    const name = f.name.value.trim(), kontakt = f.kontakt.value.trim();
    if (!name || !kontakt) { hinweis.textContent = 'Bitte noch deinen Namen und einen Weg, dich zu erreichen.'; (name ? f.kontakt : f.name).focus(); return; }
    if (post.leer) {
      hinweis.textContent = entwurf ? 'Deine E-Mail-Adresse fehlt noch. Trag sie unten rechts über „Entwurf“ ein.'
        : 'Das Formular ist noch nicht eingerichtet. Bitte melde dich auf einem anderen Weg.';
      return;
    }
    const themen = $$('input[name=thema]:checked', f).map((c) => c.value);
    const text = ['Hallo ' + angabe('vorname').wert + ',', '', 'ich möchte ein Erstgespräch vereinbaren.', '',
      'Name: ' + name, 'Erreichbar unter: ' + kontakt, themen.length ? 'Themen: ' + themen.join(', ') : null,
      f.text.value.trim() ? '\n' + f.text.value.trim() : null].filter((z) => z !== null).join('\n');
    location.href = 'mailto:' + post.wert + '?subject=' + encodeURIComponent('Erstgespräch – ' + name) + '&body=' + encodeURIComponent(text);
    hinweis.textContent = 'Dein E-Mail-Programm sollte sich jetzt öffnen. Passiert nichts? Schreib direkt an ' + post.wert + '.';
  });

  // ============================================================== Prüfen
  // ?zu=rechner springt ohne Gleiten zu einem Abschnitt, ?auf=angaben öffnet ein Blatt,
  // ?nur=inhalt blendet die Bühne aus.
  // Nur bei dir (von der Festplatte oder in der lokalen Vorschau), nie für Besucher im Netz.
  if (lokal) {
    if (frage.get('nur') === 'inhalt') { reise.style.display = 'none'; beimScrollen(); }   // alles unter der Bühne auf einen Blick
    const zu = frage.get('zu') && document.getElementById(frage.get('zu'));
    if (zu) { document.documentElement.style.scrollBehavior = 'auto'; zu.scrollIntoView(); }
    const auf = frage.get('auf') && document.getElementById(frage.get('auf'));
    if (auf && auf.showModal) { if (auf === schub) baueSchublade(); auf.showModal(); }
  }
})();
