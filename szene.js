/* szene.js — die 3D-Bühne der Seite.
 *
 * Ein Bild, vom Scrollen gesteuert, mit Motiven aus der Finanzberatung:
 *   Kopf (rund 160.000 Punkte aus dem Foto)
 *   → Höhenlinien (vermessen, wo jemand steht)
 *   → Wirbel aus Münzen, Unterlagen und Goldstaub (alles liegt lose herum)
 *   → Ordnung: die Unterlagen werden zum Boden, die Münzen zu Säulen
 *   → Wachstum: die Säulen wachsen, darüber steigt eine glühende Kurve.
 *
 * Ohne fremde Bibliothek: reines WebGL 2. Vier Zeichenprogramme teilen sich
 * die Formeln in GEMEINSAM (Wirbel, Kurve), deshalb passen sie zueinander:
 *   Punkte (Kopf, Staub, Strom auf der Kurve) · Dinge (Münzen, Blätter)
 *   · Band (die Kurve) · Glut (das Glühen an ihrer Spitze).
 *
 * Nach außen: window.SZENE
 *   .ziel        Scroll-Fortschritt 0..1 (setzt seite.js)
 *   .rahmen      freier Platz für das Motiv {x, y, b, h} (setzt seite.js)
 *   .beiBild(z)  wird jedes Bild gerufen: z.p, z.grund, z.marken, z.kern
 *   .zeichne(p)  zeichnet einen Scroll-Stand sofort (zum Prüfen, nur lokal)
 */
(function () {
  'use strict';

  const K = window.KOPF;
  const canvas = document.getElementById('szene');
  let Z = null;
  const aus = (grund) => {
    document.documentElement.classList.add('ohne-3d');
    if (Z) { Z.aktiv = false; Z.bereit = false; Z.grund = grund; }
    else window.SZENE = { aktiv: false, grund, ziel: 0, maus: { x: 0, y: 0 } };
  };
  // Prüf-Griffe (?p=…) gelten nur bei dir: von der Festplatte oder in der lokalen Vorschau.
  const lokal = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!canvas || !K) return aus('Kopfdaten fehlen');
  if (lokal && new URLSearchParams(location.search).has('p')) document.documentElement.classList.add('standbild');
  const gl = canvas.getContext('webgl2', {
    antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance',
  });
  if (!gl) return aus('WebGL 2 fehlt');

  // ------------------------------------------------------------ Kleinkram
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (a, b, x) => clamp((x - a) / (b - a));
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const mix = (a, b, t) => a + (b - a) * t;
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  const eins = () => { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; };
  function mal(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function perspektive(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  }
  const schieb = (x, y, z) => { const o = eins(); o[12] = x; o[13] = y; o[14] = z; return o; };
  const drehX = (a) => { const c = Math.cos(a), s = Math.sin(a), o = eins(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; };
  const drehY = (a) => { const c = Math.cos(a), s = Math.sin(a), o = eins(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; };
  const mat3aus = (m) => new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);

  // Zufall mit festem Startwert: die Seite sieht bei jedem Laden gleich aus
  let saat = 20261013;
  const zufall = () => { saat = (saat * 1664525 + 1013904223) >>> 0; return saat / 4294967296; };

  // Handys bekommen weniger Punkte. Ein kleines Fenster am Rechner zählt nicht als Handy.
  const mobil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900);
  const FOV = 28 * Math.PI / 180;
  const TAN = Math.tan(FOV / 2);

  // --------------------------------------------------- Maße des Schaubilds
  // Acht Säulen in zwei Reihen. Ihre Höhen folgen einer Zinseszins-Kurve (4 → 32 Münzen).
  const SAEULEN = 8, REIHEN = 2, ABSTAND = 0.5, DICKE = 0.07, MUENZE = 0.20, BODEN = -1.25;
  const HOCH = Array.from({ length: SAEULEN }, (_, c) => Math.round(4 * Math.pow(8, c / (SAEULEN - 1))));   // am Ende
  const ANFANG = HOCH.map((h) => Math.max(2, Math.round(h * 0.5)));                                      // beim Ordnen
  const saeuleX = (c) => (c - (SAEULEN - 1) / 2) * ABSTAND;
  const SCHAUBILD = [0, -0.27, 0];                    // rückt das Schaubild in die Bildmitte
  // Die Kurve läuft knapp über den Säulen. Dieselbe Formel steht unten im Shader.
  function kurve(u) {
    const x = mix(-2.0, 2.05, u);
    return [x + SCHAUBILD[0], BODEN + DICKE * 4 * Math.pow(8, (x + 1.75) / 3.5) + 0.32 + SCHAUBILD[1], SCHAUBILD[2]];
  }

  // ---------------------------------------------- gemeinsame Formeln (GLSL)
  const GEMEINSAM = `
uniform float uTime;
uniform float uDreh;      // Drehung des Wirbels durch das Scrollen
uniform vec3  uOrigin;    // Mitte von Kopf und Wirbel
uniform vec3  uWirbel;    // Ausdehnung des Wirbels (passt sich dem freien Rahmen an)
uniform vec3  uChartO;    // Lage des Schaubilds
uniform float uGrow;      // 0..1: wie weit die Kurve gezeichnet ist

float weich(float x){ x = clamp(x, 0.0, 1.0); return x*x*(3.0 - 2.0*x); }

// Bahn eines Teils im Wirbel: eine gekippte, sich drehende Scheibe, innen schneller als außen.
vec3 wirbel(vec4 s, float zeit){
  float bahn = 0.95 + 1.35*sqrt(s.x);
  float tempo = (0.30 + 0.45*s.y)/bahn;
  float ang = s.z*6.28318 + zeit*tempo + uDreh*(0.55 + 0.7*s.y);
  float hoehe = (s.w - 0.5)*0.95*(0.45 + 0.55*bahn/2.3) + 0.10*sin(zeit*0.8 + s.x*20.0);
  vec3 p = vec3(cos(ang)*bahn, hoehe, sin(ang)*bahn);
  const float k = 0.95;                                        // Neigung der Scheibe
  p = vec3(p.x, p.y*cos(k) - p.z*sin(k), p.y*sin(k) + p.z*cos(k));
  return uOrigin + p*uWirbel/2.3*vec3(1.0, 1.0, 0.75);
}

// Die Wachstumskurve über den Säulen (u = 0 links, 1 rechts oben).
vec3 kurve(float u){
  float x = mix(-2.0, 2.05, u);
  return vec3(x, ${BODEN.toFixed(3)} + ${DICKE.toFixed(3)}*4.0*pow(8.0, (x + 1.75)/3.5) + 0.32, 0.0) + uChartO;
}

// Ein Strang der Kurve: viele feine Fäden, leicht verdreht, an der Spitze aufgefächert.
vec3 strandPos(vec4 s, float t){
  float u = t*(0.94 + 0.06*s.z);
  vec3 c = kurve(u);
  vec3 T = normalize(kurve(u + 0.01) - c);
  vec3 N = normalize(cross(T, vec3(0.0, 0.0, 1.0)));
  vec3 B = cross(T, N);
  float ang = s.x*6.28318 + 5.0*u + 0.2*sin(uTime*0.5 + s.y*9.0);
  float rad = 0.05*sqrt(s.y) + 0.12*(0.3 + s.w)*pow(u, 9.0);
  return c + (N*cos(ang) + B*sin(ang))*rad;
}
float growOf(vec4 s){ return weich(uGrow*1.25 - s.z*0.25); }
`;

  // --------------------------------------------------------------- Shader
  const VS_PUNKTE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in vec4 aRnd;
uniform mat4 uPV;
uniform mat3 uHead;
uniform vec3 uHeadPos;
uniform float uPx, uSpacing, uContour, uDissolve, uIntro, uLines, uStaub, uStrom;
out vec3 vCol; out float vSoft; out float vA;
${GEMEINSAM}
void main(){
  vec3 hp = uHead*aPos;
  vec3 wp = hp + uHeadPos;
  // Reihenfolge: Hinterkopf und Rand zuerst, die Nase zuletzt
  float order = clamp(0.30 + 0.45*aPos.z + 0.10*hp.x + (aRnd.x - 0.5)*0.2, 0.0, 1.0);
  float c = smoothstep(order*0.7, order*0.7 + 0.3, uContour);
  float d = smoothstep(order*0.6, order*0.6 + 0.4, uDissolve);

  // Höhenlinien: nur Punkte auf den Linien bleiben stehen
  float field = aPos.y + aPos.z*0.55 + 0.045*sin(aPos.x*6.5 + aPos.y*2.5);
  float ln = abs(fract(field*uLines) - 0.5)*2.0;
  float onLine = 1.0 - smoothstep(0.34, 0.58, ln);
  float keep = mix(1.0, onLine, c);
  vec3 col = mix(aCol.rgb, mix(aCol.rgb, vec3(1.0, 0.99, 0.97), 0.34), c);

  // Auflösen: die Punkte lösen sich vom Kopf …
  vec3 outw = uHead*normalize(aPos + vec3(0.0, 0.0, 0.4));
  vec3 wirr = vec3(sin(aRnd.y*31.0 + uTime*0.6 + wp.y*2.1),
                   cos(aRnd.z*27.0 + uTime*0.5 + wp.x*1.9),
                   sin(aRnd.w*23.0 + uTime*0.4 + wp.y*1.3));
  vec3 lose = wp + (outw*(0.18 + 0.5*aRnd.y) + wirr*0.22)*(sin(d*3.14159)*0.8 + d*0.2);
  // … ein Teil kreist als Goldstaub im Wirbel mit …
  vec4 ds = vec4(aRnd.w, aRnd.y, aRnd.x, aRnd.z);
  vec3 staub = wirbel(ds, uTime) + (aRnd.zxy - 0.5)*0.12;
  // … und strömt später die Wachstumskurve hinauf.
  float lauf = fract(aRnd.w + uTime*0.05*(0.5 + aRnd.y))*max(uGrow, 0.02);
  vec3 strom = kurve(lauf) + (aRnd.xyz - 0.5)*vec3(0.20, 0.24, 0.30)*(0.35 + 0.65*aRnd.z);
  staub = mix(staub, strom, weich(uStrom*1.4 - aRnd.x*0.4)*smoothstep(0.03, 0.30, uGrow));   // erst wenn die Kurve wächst
  vec3 p = mix(lose, staub, smoothstep(0.35, 1.0, d));

  // Auftritt beim Laden: die Punkte rücken aus leichter Unordnung an ihren Platz
  p += (aRnd.xyz - 0.5)*vec3(1.6, 1.6, 1.2)*uIntro*uIntro;

  // nach dem Auflösen bleibt nur der Staub
  float bleibt = step(1.0 - uStaub, aRnd.z);
  float rest = mix(1.0, bleibt, smoothstep(0.70, 1.0, d));

  vec4 clip = uPV*vec4(p, 1.0);
  float sz = uSpacing*mix(1.9, 1.0 + aRnd.y*1.5, d)*keep*rest;
  gl_Position = sz > 0.0005 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = uPx*sz/clip.w;
  vec3 gold = mix(vec3(1.0, 0.985, 0.96), vec3(1.0, 0.74, 0.30), step(0.45, aRnd.x));
  vCol = mix(col, gold, d*0.94);
  vSoft = max(d, uIntro);
  vA = 1.0 - uIntro*uIntro;
}`;

  const FS_PUNKTE = `#version 300 es
precision highp float;
in vec3 vCol; in float vSoft; in float vA;
out vec4 o;
void main(){
  vec2 q = gl_PointCoord*2.0 - 1.0;
  float r = dot(q, q);
  if (r > 1.0) discard;
  float a = vA*mix(1.0, 1.0 - smoothstep(0.45, 1.0, r), vSoft);
  o = vec4(vCol*a, a);
}`;

  // Münzen und Blätter: jede Form wird einmal gebaut und viele Male gezeichnet.
  const VS_DINGE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aP;       // Form: Münze (Zylinder, Achse nach oben) oder Blatt (liegendes Rechteck)
layout(location=1) in vec3 aN;
layout(location=2) in vec2 aUV;
layout(location=3) in float aTeil;   // Münze: 0 Deckel, 1 Rand
layout(location=4) in vec4 aSeed;    // je Stück: Zufall
layout(location=5) in vec4 aPlatz;   // je Stück: Platz in der Ordnung (xyz) und Reihenfolge (w)
layout(location=6) in vec2 aSorte;   // Münze: 1 = kommt erst beim Wachsen · Blatt: Nummer der Themenkarte oder -1; y = Größe im Wirbel
uniform mat4 uPV;
uniform float uArt;                  // 0 Münze, 1 Blatt
uniform vec3 uMass;                  // Größe der Form
uniform float uGeburt, uOrd, uWachs, uSechs;
uniform vec3 uKarten[6];             // wo die sechs Themenkarten im Wirbel stehen
out vec3 vN; out vec3 vPos; out vec2 vUV; out float vTeil; out vec4 vSeed; out float vSpez; out float vDepth;
${GEMEINSAM}
mat3 dreh(vec3 a, float w){
  float c = cos(w), s = sin(w), t = 1.0 - c;
  return mat3(t*a.x*a.x + c,     t*a.x*a.y + s*a.z, t*a.x*a.z - s*a.y,
              t*a.x*a.y - s*a.z, t*a.y*a.y + c,     t*a.y*a.z + s*a.x,
              t*a.x*a.z + s*a.y, t*a.y*a.z - s*a.x, t*a.z*a.z + c);
}
void main(){
  bool karte = uArt > 0.5 && aSorte.x >= 0.0 && uSechs > 0.5;
  float o = weich(uOrd*1.6 - aPlatz.w*0.6);              // jedes Stück ordnet sich zu seiner Zeit ein
  float da = 1.0;
  vec3 ort;
  if (uArt < 0.5 && aSorte.x > 0.5) {
    // Wachstums-Münze: fällt später von oben auf ihre Säule
    float k = weich(uWachs*1.5 - aPlatz.w*0.5);
    ort = aPlatz.xyz + uChartO + vec3((aSeed.x - 0.5)*0.5*(1.0 - k), (1.0 - k)*(1.0 - k)*(2.2 + 1.6*aSeed.y), (aSeed.z - 0.5)*0.5*(1.0 - k));
    da = smoothstep(0.25, 0.6, k);
    o = 1.0;
  } else {
    float g = weich(uGeburt*1.4 - aSeed.y*0.4);          // kommt aus dem Kopf
    vec3 chaos = wirbel(aSeed, uTime);
    if (karte) chaos = uKarten[int(aSorte.x)];
    vec3 start = uOrigin + (aSeed.xyz - 0.5)*vec3(0.9, 1.3, 0.6);
    ort = mix(mix(start, chaos, g), aPlatz.xyz + uChartO, o);
    ort.y += sin(o*3.14159)*(0.30 + 0.55*aSeed.z);       // im Bogen an den Platz
    da = smoothstep(0.0, 0.5, g);
  }
  // im Wirbel taumeln, in der Ordnung flach liegen
  vec3 achse = normalize(aSeed.zxy - 0.5 + vec3(0.013));
  float w = mod(uTime*(0.5 + 1.1*aSeed.w) + aSeed.x*31.0, 6.28318)*(1.0 - o);
  if (uArt < 0.5 && aSorte.x > 0.5) w = 5.0*aSeed.w*(1.0 - weich(uWachs*1.5 - aPlatz.w*0.5));
  if (karte) { achse = vec3(1.0, 0.0, 0.0); w = (1.45 + 0.10*sin(uTime*0.7 + aSorte.x*1.7))*(1.0 - o); }   // Themenkarten stehen dem Betrachter zugewandt
  mat3 R = dreh(achse, w);
  float gr = da*mix(aSorte.y*(uArt < 0.5 ? 0.78 : 1.0), 1.0, o);
  vec3 wp = ort + R*(aP*uMass*gr);
  vec4 clip = uPV*vec4(wp, 1.0);
  gl_Position = da > 0.001 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
  vN = R*aN; vPos = wp; vUV = aUV; vTeil = aTeil; vSeed = aSeed; vSpez = karte || (uArt > 0.5 && aSorte.x >= 0.0) ? 1.0 : 0.0; vDepth = clip.w;
}`;

  const FS_DINGE = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vPos; in vec2 vUV; in float vTeil; in vec4 vSeed; in float vSpez; in float vDepth;
uniform vec3 uCam, uBg;
uniform float uArt;
uniform vec2 uFog;
out vec4 o;
void main(){
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vPos);
  vec3 L = normalize(vec3(-0.45, 0.8, 0.55));
  float dif = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  vec3 col;
  if (uArt < 0.5) {
    // Münze: Gold mit Glanzlicht, geprägtem Ring und geriffeltem Rand
    float sp = pow(max(dot(N, H), 0.0), 42.0);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float hell = smoothstep(-0.15, 0.95, dif*0.85 + 0.22*N.y + 0.18);
    col = mix(vec3(0.42, 0.23, 0.05), vec3(0.97, 0.70, 0.25), hell);
    if (vTeil < 0.5) {
      float r = length(vUV);
      float ring = smoothstep(0.78, 0.82, r) - smoothstep(0.92, 0.96, r);
      float mitte = 1.0 - smoothstep(0.50, 0.54, r);
      col *= 1.0 + 0.14*ring + 0.07*mitte;
    } else {
      col *= 0.84 + 0.16*sin(vUV.x*14.0);
    }
    col += vec3(1.0, 0.93, 0.72)*sp*0.85 + vec3(0.95, 0.62, 0.25)*fres*0.30;
  } else {
    // Blatt: Papier mit angedeuteten Zeilen; die sechs Themenkarten tragen einen farbigen Kopf
    float licht = 0.74 + 0.26*smoothstep(0.0, 0.9, dif*0.7 + 0.35);
    col = vec3(0.988, 0.980, 0.970)*licht;
    if (gl_FrontFacing) {
      float reihe = floor(vUV.y*13.0), f = fract(vUV.y*13.0);
      float lang = 0.40 + 0.50*fract(sin(reihe*12.9898 + vSeed.x*78.233)*43758.5453);
      float text = step(0.28, f)*step(f, 0.62)*step(0.12, vUV.x)*step(vUV.x, 0.12 + 0.76*lang)*step(2.5, reihe)*step(reihe, 11.5);
      float kopf = step(0.12, vUV.x)*step(vUV.x, 0.62)*step(0.06, vUV.y)*step(vUV.y, 0.135);
      col = mix(col, vec3(0.66, 0.64, 0.68)*licht, text*0.75);
      col = mix(col, mix(vec3(0.10, 0.09, 0.12), vec3(0.94, 0.54, 0.17), vSpez), kopf);
    } else col *= 0.93;
  }
  col = mix(col, uBg, smoothstep(uFog.x, uFog.y, vDepth)*0.8);
  o = vec4(col, 1.0);
}`;

  const VS_BAND = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
layout(location=1) in vec2 aTS;      // Stelle (0 Anfang, 1 Spitze), Seite (-1/+1)
uniform mat4 uPV;
uniform vec3 uCam;
uniform float uWidth, uTip;
out float vU; out float vT; out vec3 vPos; out vec3 vTan; out vec4 vSeed; out float vDepth;
${GEMEINSAM}
void main(){
  float g = growOf(aSeed);
  float t = aTS.x*g;
  vec3 p = strandPos(aSeed, t);
  vec3 q = strandPos(aSeed, t + 0.004);
  vec3 T = normalize(q - p + vec3(1e-6));
  vec3 V = normalize(uCam - p);
  vec3 S = normalize(cross(T, V) + vec3(1e-6));
  float w = uWidth*(0.7 + 0.6*aSeed.w)*smoothstep(0.0, 0.04, aTS.x)*smoothstep(0.0, 0.03, g);
  vec3 wp = p + S*aTS.y*w;
  vec4 clip = uPV*vec4(wp, 1.0);
  gl_Position = clip;
  vU = aTS.y; vT = aTS.x; vPos = wp; vTan = T; vSeed = aSeed; vDepth = clip.w;
}`;

  const FS_BAND = `#version 300 es
precision highp float;
in float vU; in float vT; in vec3 vPos; in vec3 vTan; in vec4 vSeed; in float vDepth;
uniform vec3 uCam, uBg;
uniform float uTip;
uniform vec2 uFog;
out vec4 o;
void main(){
  vec3 T = normalize(vTan);
  vec3 V = normalize(uCam - vPos);
  vec3 S = normalize(cross(T, V) + vec3(1e-6));
  float u = clamp(vU, -1.0, 1.0);
  float h = sqrt(max(0.0, 1.0 - u*u));
  vec3 N = normalize(S*u + V*h);                        // das flache Band tut, als wäre es rund
  vec3 L = normalize(vec3(-0.5, 0.75, 0.6));
  float dif = dot(N, L)*0.5 + 0.5;
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0);
  vec3 col = mix(uBg*vec3(0.50, 0.48, 0.55), vec3(0.985, 0.975, 0.97), smoothstep(0.12, 0.92, dif)) + spec*0.18;
  col *= 0.80 + 0.20*h;
  // zur Spitze hin wird der Strang golden und glüht
  float warm = smoothstep(0.55, 1.0, vT);
  col = mix(col, vec3(1.0, 0.80, 0.42), warm*0.55);
  col = mix(col, vec3(1.0, 0.62, 0.22) + vec3(0.25, 0.18, 0.05), step(uTip, vT));
  col = mix(col, uBg, smoothstep(uFog.x, uFog.y, vDepth)*0.8);
  o = vec4(col, 1.0);
}`;

  const VS_GLUT = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
uniform mat4 uPV;
uniform float uPx, uGlow;
out float vI;
${GEMEINSAM}
void main(){
  float g = growOf(aSeed);
  vec4 clip = uPV*vec4(strandPos(aSeed, g), 1.0);
  gl_Position = clip;
  gl_PointSize = uPx*uGlow*(0.8 + 0.6*aSeed.w)/clip.w;
  vI = smoothstep(0.02, 0.15, g)*(0.78 + 0.22*sin(uTime*2.0 + aSeed.x*50.0));
}`;

  const FS_GLUT = `#version 300 es
precision highp float;
in float vI;
out vec4 o;
void main(){
  vec2 q = gl_PointCoord*2.0 - 1.0;
  float r2 = dot(q, q);
  float a = exp(-r2*5.0)*(1.0 - smoothstep(0.6, 1.0, r2))*vI*0.55;
  vec3 c = mix(vec3(1.0, 0.50, 0.10), vec3(1.0, 0.93, 0.78), exp(-r2*38.0));
  o = vec4(c*a, a*0.55);
}`;

  function programm(vs, fs, name) {
    const bau = (art, text) => {
      const s = gl.createShader(art);
      gl.shaderSource(s, text); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, bau(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, bau(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  let P, DINGE, B, G;
  function baueProgramme() {
    P = programm(VS_PUNKTE, FS_PUNKTE, 'Punkte');
    DINGE = programm(VS_DINGE, FS_DINGE, 'Dinge');
    B = programm(VS_BAND, FS_BAND, 'Band');
    G = programm(VS_GLUT, FS_GLUT, 'Glut');
  }

  // ----------------------------------------------------- Münzen und Blätter
  function form(vao, f, stuecke) {
    // f: {P, N, UV, T, I} die Form · stuecke: je Stück zehn Zahlen (Zufall 4, Platz 4, Sorte 2)
    gl.bindVertexArray(vao);
    const feld = (ort, daten, n) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(daten), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(ort); gl.vertexAttribPointer(ort, n, gl.FLOAT, false, 0, 0);
    };
    feld(0, f.P, 3); feld(1, f.N, 3); feld(2, f.UV, 2); feld(3, f.T, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(stuecke), gl.STATIC_DRAW);
    [[4, 4, 0], [5, 4, 16], [6, 2, 32]].forEach(([ort, n, ab]) => {
      gl.enableVertexAttribArray(ort); gl.vertexAttribPointer(ort, n, gl.FLOAT, false, 40, ab); gl.vertexAttribDivisor(ort, 1);
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(f.I), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, ecken: f.I.length, anzahl: stuecke.length / 10 };
  }

  function muenzForm(teile) {
    const f = { P: [], N: [], UV: [], T: [], I: [] };
    const dazu = (p, n, uv, t) => { f.P.push(...p); f.N.push(...n); f.UV.push(...uv); f.T.push(t); return f.P.length / 3 - 1; };
    for (const oben of [1, -1]) {                                   // Deckel und Boden
      const mitte = dazu([0, 0.5 * oben, 0], [0, oben, 0], [0, 0], 0), rand = [];
      for (let i = 0; i <= teile; i++) {
        const a = i / teile * 6.28318, c = Math.cos(a), s = Math.sin(a);
        rand.push(dazu([c, 0.5 * oben, s], [0, oben, 0], [c, s], 0));
      }
      for (let i = 0; i < teile; i++) oben > 0 ? f.I.push(mitte, rand[i + 1], rand[i]) : f.I.push(mitte, rand[i], rand[i + 1]);
    }
    const ab = f.P.length / 3;                                      // der Rand
    for (let i = 0; i <= teile; i++) {
      const a = i / teile * 6.28318, c = Math.cos(a), s = Math.sin(a);
      dazu([c, 0.5, s], [c, 0, s], [a, 1], 1); dazu([c, -0.5, s], [c, 0, s], [a, 0], 1);
    }
    for (let i = 0; i < teile; i++) { const k = ab + i * 2; f.I.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    return f;
  }
  const blattForm = () => ({
    P: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    N: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    UV: [0, 0, 1, 0, 1, 1, 0, 1], T: [0, 0, 0, 0], I: [0, 2, 1, 0, 3, 2],
  });

  let muenzen = null, blaetter = null;
  const KARTEN = 6;                                    // die ersten sechs Blätter sind die Themenkarten
  function baueDinge() {
    const m = [];
    for (let r = 0; r < REIHEN; r++) for (let c = 0; c < SAEULEN; c++) for (let l = 0; l < HOCH[c]; l++) {
      const spaeter = l >= ANFANG[c];
      const reihenfolge = spaeter
        ? clamp((l - ANFANG[c]) / Math.max(1, HOCH[c] - ANFANG[c]) * 0.75 + c / (SAEULEN - 1) * 0.25)
        : clamp(c / (SAEULEN - 1) * 0.6 + l / 16 * 0.4);
      m.push(zufall(), zufall(), zufall(), zufall(),
        saeuleX(c) + (zufall() - 0.5) * 0.012, BODEN + (l + 0.5) * DICKE, (r - (REIHEN - 1) / 2) * 0.52 + (zufall() - 0.5) * 0.012, reihenfolge,
        spaeter ? 1 : 0, 1);
    }
    muenzen = form(gl.createVertexArray(), muenzForm(mobil ? 20 : 30), m);

    // Die Blätter ordnen sich zu einem Boden aus zwölf mal fünf Kacheln, auf dem die Säulen stehen.
    const b = [], SP = 12, ZE = 5;
    const plaetze = [];
    for (let j = 0; j < ZE; j++) for (let i = 0; i < SP; i++) plaetze.push([(i - (SP - 1) / 2) * 0.40, BODEN - 0.012, (j - (ZE - 1) / 2) * 0.50, clamp(i / (SP - 1) * 0.7 + j / (ZE - 1) * 0.3)]);
    // die Themenkarten landen vorn in der Mitte
    const vorn = plaetze.filter((q) => q[2] > 0.9).sort((a, c) => Math.abs(a[0]) - Math.abs(c[0])).slice(0, KARTEN);
    const rest = plaetze.filter((q) => !vorn.includes(q));
    [...vorn, ...rest].forEach((q, n) => {
      b.push(zufall(), zufall(), zufall(), zufall(), q[0], q[1], q[2], q[3], n < KARTEN ? n : -1, n < KARTEN ? 1.55 : 1);
    });
    blaetter = form(gl.createVertexArray(), blattForm(), b);
  }

  // ------------------------------------------------------- Kurve und Glut
  const FAEDEN = mobil ? 40 : 64, TEILE = mobil ? 70 : 110, SPITZE = 0.985;
  const saaten = [];
  for (let i = 0; i < FAEDEN; i++) saaten.push([(i + zufall() * 0.7) / FAEDEN, zufall(), zufall(), zufall()]);
  let bandVAO = null, bandZahl = 0, glutVAO = null;
  function baueKurve() {
    const proFaden = (TEILE + 1) * 2;
    const v = new Float32Array(FAEDEN * proFaden * 6), idx = new Uint16Array(FAEDEN * TEILE * 6);
    let a = 0, b = 0;
    for (let i = 0; i < FAEDEN; i++) {
      const s = saaten[i], basis = i * proFaden;
      for (let j = 0; j <= TEILE; j++) {
        for (let seite = -1; seite <= 1; seite += 2) { v[a++] = s[0]; v[a++] = s[1]; v[a++] = s[2]; v[a++] = s[3]; v[a++] = j / TEILE; v[a++] = seite; }
        if (j < TEILE) { const k = basis + j * 2; idx[b++] = k; idx[b++] = k + 1; idx[b++] = k + 2; idx[b++] = k + 1; idx[b++] = k + 3; idx[b++] = k + 2; }
      }
    }
    bandVAO = gl.createVertexArray(); gl.bindVertexArray(bandVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    bandZahl = idx.length;

    glutVAO = gl.createVertexArray(); gl.bindVertexArray(glutVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(saaten.flat()), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------- Kopf
  let punktVAO = null, punktZahl = 0, punktAbstand = 0.006;
  const ladeBild = (quelle) => new Promise((ja, nein) => {
    const b = new Image(); b.onload = () => ja(b); b.onerror = () => nein(new Error('Bild lädt nicht')); b.src = quelle;
  });
  async function baueKopf() {
    const [farbe, daten] = await Promise.all([ladeBild(K.farbe), ladeBild(K.daten)]);
    const W = K.breite, H = K.hoehe;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(farbe, 0, 0); const F = x.getImageData(0, 0, W, H).data;
    x.clearRect(0, 0, W, H);
    x.drawImage(daten, 0, 0); const Dt = x.getImageData(0, 0, W, H).data;

    const schritt = mobil ? 2.5 : 1.7;                 // Bildpunkte zwischen zwei Punkten
    const hw = K.halbe_kopfbreite;
    punktAbstand = schritt / hw;
    const max = Math.ceil((W / schritt) * (H / (schritt * 0.87)));
    const pos = new Float32Array(max * 3), col = new Uint8Array(max * 4), rnd = new Uint8Array(max * 4);
    let n = 0, reihe = 0;
    for (let y = 0; y < H; y += schritt * 0.87, reihe++) {            // versetzte Reihen decken dichter
      for (let xx = (reihe % 2) * schritt * 0.5; xx < W; xx += schritt) {
        const px = Math.min(W - 1, Math.round(xx)), py = Math.min(H - 1, Math.round(y)), i = (py * W + px) * 4;
        const a = Dt[i + 1] / 255;
        if (a < 0.05 || a < zufall() * 0.92) continue;             // weicher, gestreuter Rand
        pos[n * 3] = (xx - K.mitte[0]) / hw;
        pos[n * 3 + 1] = -(y - K.mitte[1]) / hw;
        pos[n * 3 + 2] = (Dt[i] / 255) * K.tiefe_massstab - 0.45;
        col[n * 4] = F[i]; col[n * 4 + 1] = F[i + 1]; col[n * 4 + 2] = F[i + 2]; col[n * 4 + 3] = 255;
        for (let k = 0; k < 4; k++) rnd[n * 4 + k] = zufall() * 256;
        n++;
      }
    }
    punktZahl = n;
    punktVAO = gl.createVertexArray(); gl.bindVertexArray(punktVAO);
    const puffer = (ort, feld, groesse, typ, normiert) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, feld, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(ort); gl.vertexAttribPointer(ort, groesse, typ, normiert, 0, 0);
    };
    puffer(0, pos.subarray(0, n * 3), 3, gl.FLOAT, false);
    puffer(1, col.subarray(0, n * 4), 4, gl.UNSIGNED_BYTE, true);
    puffer(2, rnd.subarray(0, n * 4), 4, gl.UNSIGNED_BYTE, true);
    gl.bindVertexArray(null);
    return { farbe, daten };
  }

  // ------------------------------------------------- Farbe des Hintergrunds
  // [Fortschritt, hell (Mitte), tief (Rand)]
  const GRUND = [
    [0.00, [236, 228, 225], [213, 200, 200]],
    [0.20, [214, 199, 201], [181, 163, 169]],
    [0.42, [198, 181, 187], [160, 141, 150]],
    [0.68, [200, 191, 200], [163, 156, 171]],
    [0.88, [213, 217, 225], [180, 186, 199]],
    [1.00, [224, 227, 233], [193, 198, 208]],
  ];
  function grundBei(p) {
    let i = 0;
    while (i < GRUND.length - 2 && p > GRUND[i + 1][0]) i++;
    const a = GRUND[i], b = GRUND[i + 1], t = seg(a[0], b[0], p);
    const f = (k) => [0, 1, 2].map((j) => mix(a[k][j], b[k][j], t));
    return { hell: f(1), tief: f(2) };
  }

  // ----------------------------------------------------------- Zustand
  Z = {
    aktiv: true, ziel: 0, p: 0, maus: { x: 0, y: 0 }, bereit: false, sichtbar: true,
    beiBild: null, punkte: 0, muenzen: 0, bilder: null,
    rahmen: null,      // freier Platz für das Motiv in Bildpunkten {x, y, b, h} — setzt seite.js
    modus: 'breit',    // 'breit' = Text links, Motiv rechts · 'hoch' = Motiv oben, Text unten
    marken: true,      // false = keine schwebenden Beschriftungen (zu wenig Platz; die Themen stehen dann im Text)
    masse: null,       // zuletzt benutzter Bildaufbau (zum Prüfen)
  };
  window.SZENE = Z;
  const blick = { x: 0, y: 0 };
  let W = 1, H = 1, pxProEinheit = 1, start = performance.now(), auftritt = 1, letzte = 0, festZeit = 0, letzteZeit = 0;
  const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function groesse() {
    const r = canvas.getBoundingClientRect();
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const flaeche = r.width * r.height * dpr * dpr;
    if (flaeche > 4.2e6) dpr *= Math.sqrt(4.2e6 / flaeche);       // sehr große Bildschirme deckeln
    W = Math.max(2, Math.round(r.width * dpr)); H = Math.max(2, Math.round(r.height * dpr));
    pxProEinheit = H / (2 * TAN);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
      if (Z.bereit && Z.sichtbar) rendere(Z.fest ? festZeit : letzteZeit);     // sonst blitzt ein leeres Bild auf
    }
  }

  function projiziere(PV, w) {
    const x = PV[0] * w[0] + PV[4] * w[1] + PV[8] * w[2] + PV[12];
    const y = PV[1] * w[0] + PV[5] * w[1] + PV[9] * w[2] + PV[13];
    const ww = PV[3] * w[0] + PV[7] * w[1] + PV[11] * w[2] + PV[15];
    return { x: (x / ww * 0.5 + 0.5), y: (1 - (y / ww * 0.5 + 0.5)), w: ww };
  }

  function setze(prog, U) {
    const u = prog.u;
    gl.useProgram(prog.p);
    for (const k in U) {
      const ort = u[k]; if (ort == null) continue;
      const v = U[k];
      if (typeof v === 'number') gl.uniform1f(ort, v);
      else if (v.length === 2) gl.uniform2fv(ort, v);
      else if (v.length === 3 || v.length === 18) gl.uniform3fv(ort, v);
      else if (v.length === 4) gl.uniform4fv(ort, v);
      else if (v.length === 9) gl.uniformMatrix3fv(ort, false, v);
      else if (v.length === 16) gl.uniformMatrix4fv(ort, false, v);
    }
  }

  function bild(jetzt) {
    requestAnimationFrame(bild);
    if (!Z.bereit) return;
    if (!Z.sichtbar) { Z.p = Z.ziel; return; }       // unsichtbar: Stand mitführen, damit beim Wiederkommen nichts nachläuft
    if (Z.fest) { rendere(festZeit); return; }       // Standbild: denselben Stand immer neu zeichnen
    const dt = Math.min(0.05, (jetzt - letzte) / 1000 || 0.016); letzte = jetzt;

    // Weiches Nachziehen: Scrollen fühlt sich dadurch flüssig an. Bei großen Sprüngen (Neuladen
    // mitten in der Seite, Sprungmarke) rastet der Stand sofort ein, statt alle Zustände zu durchrasen.
    const sprung = Math.abs(Z.ziel - Z.p) > 0.25 || jetzt - start < 500;
    Z.p += (Z.ziel - Z.p) * (ruhig || sprung ? 1 : 1 - Math.pow(0.0012, dt));
    if (ruhig) blick.x = blick.y = 0;                // „weniger Bewegung“: das Bild folgt der Maus nicht
    else {
      blick.x += (Z.maus.x - blick.x) * (1 - Math.pow(0.02, dt));
      blick.y += (Z.maus.y - blick.y) * (1 - Math.pow(0.02, dt));
    }
    auftritt = ruhig ? 0 : clamp(1 - (jetzt - start) / 1400);
    letzteZeit = ruhig ? 0 : (jetzt - start) / 1000;
    rendere(letzteZeit);
  }

  // Zum Prüfen: einen bestimmten Scroll-Stand sofort zeichnen, ohne Nachziehen.
  // Hält die Bühne danach an; SZENE.fest = false lässt sie weiterlaufen.
  Z.zeichne = (p, zeit = 0, maus) => {
    if (!Z.bereit) return false;
    Z.fest = true; festZeit = zeit; Z.p = Z.ziel = p; auftritt = 0;
    if (maus) { blick.x = maus.x; blick.y = maus.y; }
    groesse(); rendere(zeit);
    return true;
  };

  function rendere(zeit) {
    const p = Z.p;

    // ---- Drehbuch: was ist bei welchem Scroll-Stand wie weit
    const drehung = ease(seg(0.05, 0.24, p));     // der Kopf dreht sich
    const linien = seg(0.09, 0.22, p);            // … und wird zu Höhenlinien
    const aufloesen = seg(0.23, 0.40, p);         // die Punkte lösen sich
    const geburt = seg(0.24, 0.40, p);            // Münzen und Blätter kommen aus dem Kopf
    const ordnung = seg(0.50, 0.68, p);           // der Wirbel ordnet sich
    const strom = seg(0.56, 0.76, p);             // der Staub sammelt sich auf der Kurve
    const wachsen = seg(0.72, 0.93, p);           // die Säulen wachsen
    const zeichnen = seg(0.70, 0.94, p);          // die Kurve zeichnet sich
    const glut = ease(seg(0.80, 0.95, p));

    // ---- Bildaufbau: Das Motiv gehört in den freien Rahmen neben oder über dem Text.
    // Aus dem Rahmen folgt für jeden Zustand ein Maßstab (Bildpunkte je Welt-Einheit),
    // aus dem Maßstab der Abstand der Kamera. Die Mitte des Rahmens wird per Linsenversatz
    // getroffen: Das Motiv rückt zur Seite, ohne dass sich die Perspektive verzieht.
    const asp = W / H;
    const cssB = canvas.clientWidth || 1, cssH = canvas.clientHeight || 1;
    const R = Z.rahmen && Z.rahmen.b > 60 && Z.rahmen.h > 60 ? Z.rahmen
      : { x: cssB * 0.06, y: cssH * 0.10, b: cssB * 0.88, h: cssH * 0.82 };
    const breit = Z.modus !== 'hoch';
    const mitMarken = breit && Z.marken !== false;
    const mx = R.x + R.b / 2, my = R.y + R.h / 2;
    const sKopf = Math.min(R.b / 2.6, R.h / 3.5, cssH * 0.78 / 3.5, 210) * 0.97;       // Kopf: 2,6 breit, 3,5 hoch
    const sWirbel = sKopf * 0.82;
    const sBild = Math.min(R.b / 5.3, R.h / 3.9, sKopf * 1.1);                          // Schaubild: 5,3 breit, 3,9 hoch
    const e1 = ease(seg(0.22, 0.40, p)), e2 = ease(seg(0.50, 0.68, p));
    const massstab = mix(mix(sKopf, sWirbel, e1), sBild, e2);
    const D = cssH / (2 * TAN * massstab);
    const versatzY = 0.10 * massstab * (1 - e1);                 // der Kopf sitzt etwas über seinem Drehpunkt
    const proj = perspektive(FOV, asp, 0.5, D + 40);
    proj[8] = -((mx / cssB) * 2 - 1);
    proj[9] = -(1 - ((my + versatzY) / cssH) * 2);
    // Das Schaubild sieht man schräg von oben, damit die Säulen Körper haben.
    const gier = -blick.x * 0.11 + (ruhig ? 0 : 0.02 * Math.sin(zeit * 0.31)) - 0.36 * e2 + 0.10 * ease(seg(0.72, 1, p));
    const nick = blick.y * 0.07 + 0.21 * e2;
    const PV = mal(proj, mal(schieb(0, 0, -D), mal(drehX(nick), drehY(gier))));
    const cam = [-Math.sin(gier) * Math.cos(nick) * D, Math.sin(nick) * D, Math.cos(gier) * Math.cos(nick) * D];

    // Der Wirbel füllt den Platz zwischen Text und Bildrand; rechts bleibt Raum für die Beschriftungen.
    const rand = 14, platzMarke = mitMarken ? 172 : 0;
    const links = (mx - (breit ? R.x : rand)) / sWirbel, rechts = (cssB - rand - platzMarke - mx) / sWirbel;
    const hoehe = Math.min(my - R.y, R.y + R.h - my) / sWirbel;
    const ry = Math.max(0.8, hoehe * 0.86), rx = clamp((links + rechts) / 2 * 0.9, 0.8, ry * 1.55);
    const mitte = [clamp((rechts - links) / 2, -0.6, 0.6) * 0.9, 0.05, 0];

    const schweben = ruhig ? 0 : 1 - drehung;
    const kopfDreh = mat3aus(mal(
      drehY(0.62 * drehung + 0.05 * Math.sin(zeit * 0.5) * schweben + blick.x * 0.10 * schweben),
      drehX(-0.10 * drehung + 0.025 * Math.sin(zeit * 0.37) * schweben - blick.y * 0.05 * schweben)));
    const kopfPos = [0, 0.04 * Math.sin(zeit * 0.6) * schweben, 0];

    // Die sechs Themenkarten stehen im Wirbel ruhig am rechten Rand, jede mit ihrer Beschriftung.
    const karten = new Float32Array(KARTEN * 3);
    for (let i = 0; i < KARTEN; i++) {
      const a = (62 - i * 24.8) * Math.PI / 180;
      karten[i * 3] = mitte[0] + Math.cos(a) * rx * 0.50 + rx * 0.50;
      karten[i * 3 + 1] = mitte[1] + Math.sin(a) * ry * 0.98 + 0.035 * Math.sin(zeit * 0.9 + i * 1.3);
      karten[i * 3 + 2] = 0.9;
    }

    const g = grundBei(p);
    const bg = [0, 1, 2].map((i) => (g.hell[i] * 0.45 + g.tief[i] * 0.55) / 255);
    const gemeinsam = {
      uPV: PV, uTime: zeit, uDreh: p * 16, uOrigin: mitte, uWirbel: [rx, ry, rx], uChartO: SCHAUBILD,
      uGrow: zeichnen, uPx: pxProEinheit, uCam: cam, uBg: bg, uFog: [D + 2.2, D + 8],
    };
    Z.masse = { rahmen: R, modus: Z.modus, massstab, abstand: D, wirbel: [rx, ry] };

    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.disable(gl.BLEND);

    // 1 · Münzen und Blätter
    if (geburt > 0.001) {
      const dinge = Object.assign({}, gemeinsam, { uGeburt: geburt, uOrd: ordnung, uWachs: wachsen, uSechs: mitMarken ? 1 : 0, 'uKarten[0]': karten });
      setze(DINGE, Object.assign(dinge, { uArt: 1, uMass: [0.36, 1, 0.46] }));
      gl.bindVertexArray(blaetter.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, blaetter.ecken, gl.UNSIGNED_SHORT, 0, blaetter.anzahl);
      setze(DINGE, Object.assign(dinge, { uArt: 0, uMass: [MUENZE, DICKE * 0.94, MUENZE] }));
      gl.bindVertexArray(muenzen.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, muenzen.ecken, gl.UNSIGNED_SHORT, 0, muenzen.anzahl);
    }

    // 2 · die Kurve
    if (zeichnen > 0.001) {
      setze(B, Object.assign({}, gemeinsam, { uTip: SPITZE, uWidth: Math.max(0.013, 1.25 / massstab) }));
      gl.bindVertexArray(bandVAO);
      gl.drawElements(gl.TRIANGLES, bandZahl, gl.UNSIGNED_SHORT, 0);
    }

    // 3 · Punkte: Kopf, Staub, Strom
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    setze(P, Object.assign({}, gemeinsam, {
      uHead: kopfDreh, uHeadPos: kopfPos, uSpacing: punktAbstand,
      uContour: linien, uDissolve: aufloesen, uIntro: auftritt, uLines: 9.5,
      uStaub: mix(0.20, 0.12, strom), uStrom: strom,
    }));
    gl.bindVertexArray(punktVAO);
    gl.drawArrays(gl.POINTS, 0, punktZahl);

    // 4 · das Glühen an der Spitze der Kurve
    if (zeichnen > 0.001) {
      gl.depthMask(false);
      setze(G, Object.assign({}, gemeinsam, { uGlow: Math.max(0.30, 16 / massstab) }));
      gl.bindVertexArray(glutVAO);
      gl.drawArrays(gl.POINTS, 0, FAEDEN);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null);

    // ---- an die Seite melden: Farben, Beschriftungen, Glut
    if (Z.beiBild) {
      const stark = mitMarken ? ease(seg(0.37, 0.43, p)) * (1 - ease(seg(0.49, 0.53, p))) : 0;
      const marken = [];
      if (stark > 0.005) for (let i = 0; i < KARTEN; i++) {
        const ort = projiziere(PV, [karten[i * 3] + 0.36 * 1.55 * 0.5, karten[i * 3 + 1], karten[i * 3 + 2]]);   // rechte Kante der Karte
        marken.push({ x: ort.x * cssB, y: ort.y * cssH, staerke: stark });
      }
      const spitze = projiziere(PV, kurve(clamp(ease(zeichnen * 1.25) * 0.97)));
      Z.beiBild({
        p, grund: g, marken, rahmen: R,
        kern: { x: spitze.x * cssB, y: spitze.y * cssH, staerke: glut * 0.8, radius: 0.85 * massstab },
      });
    }
  }

  // ------------------------------------------------------------- Start
  groesse();
  window.addEventListener('resize', groesse);
  if ('ResizeObserver' in window) new ResizeObserver(groesse).observe(canvas);
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    Z.maus.x = (e.clientX / window.innerWidth) * 2 - 1;
    Z.maus.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((e) => { Z.sichtbar = e[e.length - 1].isIntersecting; }, { rootMargin: '80px' }).observe(canvas);
  }
  // Geht die Grafik verloren (Treiber, Handy holt den Tab zurück), hält die Bühne nur an. Gibt der
  // Browser sie zurück, lädt die Seite neu und steht dank Einrasten am selben Scroll-Stand.
  let verlustUhr = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); Z.bereit = false;
    verlustUhr = setTimeout(() => aus('Grafik verloren'), 8000);
  });
  canvas.addEventListener('webglcontextrestored', () => { clearTimeout(verlustUhr); location.reload(); });

  // Erst die Seite zeigen, dann die Grafik bauen: der Text wartet nicht auf die Shader.
  setTimeout(() => {
    try { baueProgramme(); baueDinge(); baueKurve(); } catch (e) { console.error('[szene]', e.message); return aus('Grafik: ' + e.message); }
    baueKopf().then((b) => {
      Z.bilder = b; Z.punkte = punktZahl; Z.muenzen = muenzen.anzahl; Z.bereit = true;
      start = performance.now();
      document.documentElement.classList.add('szene-bereit');
      window.dispatchEvent(new Event('szene-bereit'));
      // Zum Prüfen (nur lokal): ?p=0.47 in der Adresse zeigt genau diesen Scroll-Stand als Standbild
      const fest = lokal ? new URLSearchParams(location.search).get('p') : null;
      if (fest !== null && !isNaN(+fest)) requestAnimationFrame(() => Z.zeichne(clamp(+fest), 1));
    }).catch((e) => { console.error('[szene]', e); aus(e.message); });
  }, 0);
  requestAnimationFrame(bild);
})();
