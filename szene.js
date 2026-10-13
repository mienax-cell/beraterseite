/* szene.js — die 3D-Bühne der Seite.
 *
 * Ein Bild, vier Zustände, alles vom Scrollen gesteuert:
 *   Kopf (rund 150.000 Punkte aus dem Foto)  →  Höhenlinien  →  Fäden
 *   →  ein Strang  →  eine Blüte mit glühendem Kern.
 *
 * Ohne fremde Bibliothek: reines WebGL 2. Die Form der Fäden steht einmal
 * als Formel im Shader (FAEDEN) und wird von Punkten, Bändern und
 * Glühpunkten gemeinsam benutzt — deshalb bleiben sie immer beieinander.
 *
 * Nach außen: window.SZENE
 *   .ziel        Scroll-Fortschritt 0..1 (setzt seite.js)
 *   .maus        {x,y} in -1..1
 *   .beiBild(z)  wird jedes Bild gerufen: z.p, z.grund, z.marken, z.kern
 *   .zeichne(p)  zeichnet einen Scroll-Stand sofort (zum Prüfen)
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
  // ?p=… in der Adresse: Standbild zum Prüfen, ohne Einblenden
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
  const kreuz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

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

  // Handys bekommen weniger Punkte und Fäden. Ein kleines Fenster am Rechner zählt nicht als Handy.
  const mobil = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900);
  const FOV = 28 * Math.PI / 180;
  const TAN = Math.tan(FOV / 2);

  // ------------------------------------------------------- Form der Fäden
  // s = vier Zufallswerte des Fadens, t = Stelle auf dem Faden (0 Wurzel, 1 Spitze)
  const FAEDEN = `
uniform float uPhase;     // 0 Fäden · 1 Strang · 2 Blüte
uniform float uGrow;      // 0..1: wie weit die Fäden gewachsen sind
uniform float uTime;
uniform vec4  uReach;     // wie weit die Fäden reichen dürfen: links, rechts, oben, unten
uniform vec3  uOrigin;    // Kopfmitte: dort entspringen die Fäden
uniform float uMarken;    // 1 = die sechs beschrifteten Fäden hervorheben
uniform float uTipOn;     // 1 = Kupferspitzen und Glühen zeigen, 0 = aus (in der Blüte)
uniform vec3  uCableEnd;  // dort endet der Strang
uniform vec3  uBloomC;    // Mitte der Blüte
uniform vec3  uAxis;      // Achse der Blüte (zeigt zum Kern)

float weich(float x){ x = clamp(x, 0.0, 1.0); return x*x*(3.0 - 2.0*x); }
float growOf(vec4 s){ return weich(uGrow*1.5 - s.z*0.5); }
vec3 bez(vec3 a, vec3 b, vec3 c, float t){ float u = 1.0 - t; return u*u*a + 2.0*u*t*b + t*t*c; }

// Fäden: sie entspringen im Kopf und wachsen nach außen. Wie weit, bestimmt uReach:
// ein Kasten mit vier Seiten, damit kein Faden in den Text oder aus dem Bild läuft.
vec3 strandA(vec4 s, float t){
  float th = s.x*6.28318;
  float cz = s.y*1.3 - 0.45;
  float r  = sqrt(max(0.0, 1.0 - cz*cz));
  vec3 d   = vec3(r*cos(th), r*sin(th), cz);
  vec2 q   = vec2(cos(th), sin(th));
  vec2 lim = vec2(q.x < 0.0 ? uReach.x : uReach.y, q.y > 0.0 ? uReach.z : uReach.w);
  float reich = 1.0/length(q/lim);
  vec3 root = d*vec3(0.70, 0.95, 0.66)*(0.30 + 0.45*s.w);
  float L = clamp((reich*(0.50 + 0.50*s.z) - length(root.xy))/max(r, 0.4), 0.25, 3.4);
  vec3 side = normalize(cross(d, vec3(0.31, 0.93, 0.2)) + vec3(1e-4, 0.0, 0.0));
  vec3 up   = cross(side, d);
  float bend = (s.w - 0.5)*0.55*L;
  vec3 p = root + d*(L*t) + side*(bend*t*t) + up*(0.10*L*sin(t*3.1 + s.w*6.0)*t);
  p.y -= 0.07*L*t*t;
  p += side*(0.05*sin(uTime*0.7 + s.x*37.0 + t*4.0)*t);
  return uOrigin + p;
}

vec3 strandB(vec4 s, float t){
  vec3 P0 = uCableEnd + vec3(4.8, 3.7, -2.6);
  vec3 P1 = uCableEnd + vec3(2.3, 2.6, 0.3);
  vec3 P2 = uCableEnd;
  float tau = t*(0.80 + 0.20*s.z);
  vec3 c = bez(P0, P1, P2, tau);
  vec3 T = normalize(2.0*(1.0 - tau)*(P1 - P0) + 2.0*tau*(P2 - P1));
  vec3 N = normalize(cross(T, vec3(0.0, 0.0, 1.0)));
  vec3 B = cross(T, N);
  float ang = s.x*6.28318 + 4.2*tau + 0.15*sin(uTime*0.4 + s.y*9.0);
  float rad = 0.17*sqrt(s.y) + (0.25 + 0.9*s.w)*pow(tau, 6.0)*0.9;
  return c + (N*cos(ang) + B*sin(ang))*rad;
}

vec3 strandC(vec4 s, float t){
  vec3 a  = uAxis;
  vec3 e1 = normalize(cross(a, vec3(0.0, 1.0, 0.0)));
  vec3 e2 = cross(a, e1);
  float R  = 1.12*(0.90 + 0.20*s.y);
  float th = s.x*6.28318;
  const float ts = 0.24, phi0 = 0.10;
  if (t < ts) {
    float k = t/ts;
    vec3 Q0 = uBloomC + vec3(5.0, 3.6, -2.4);
    vec3 Q1 = uBloomC - a*(R + 1.7);
    vec3 Q2 = uBloomC - a*R*cos(phi0);
    vec3 ring = e1*cos(th) + e2*sin(th);
    return bez(Q0, Q1, Q2, k) + ring*mix(0.05 + 0.16*sqrt(s.y), R*sin(phi0), k*k);
  }
  float k = (t - ts)/(1.0 - ts);
  float phi = mix(phi0, 3.14159*(0.83 + 0.12*s.z), k);
  float ein = smoothstep(0.70*3.14159, 3.14159, phi);
  float Rr = R*(1.0 - 0.74*ein);               // die Spitzen tauchen zum Kern ab
  float th2 = th + smoothstep(phi0, 0.7, phi)*(0.19*sin(phi*1.5 + s.w*6.28318) + 0.25*phi);
  vec3 ring = e1*cos(th2) + e2*sin(th2);
  return uBloomC + Rr*(-a*cos(phi) + ring*sin(phi));
}

vec3 strandPos(vec4 s, float t){
  if (uPhase <= 0.0) return strandA(s, t);
  if (uPhase < 1.0)  return mix(strandA(s, t), strandB(s, t), weich(uPhase*1.3 - 0.3*s.y));
  if (uPhase < 2.0)  return mix(strandB(s, t), strandC(s, t), weich((uPhase - 1.0)*1.3 - 0.3*s.y));
  return strandC(s, t);
}
`;

  // Dasselbe für Zustand „Fäden“ in JavaScript — nur für die sechs Beschriftungen
  function fadenA(s, t, zeit, U) {
    const th = s[0] * 6.28318, cz = s[1] * 1.3 - 0.45, r = Math.sqrt(Math.max(0, 1 - cz * cz));
    const d = [r * Math.cos(th), r * Math.sin(th), cz], q = [Math.cos(th), Math.sin(th)], R = U.reich;
    const reich = 1 / Math.hypot(q[0] / (q[0] < 0 ? R[0] : R[1]), q[1] / (q[1] > 0 ? R[2] : R[3]));
    const k = 0.30 + 0.45 * s[3], root = [d[0] * 0.70 * k, d[1] * 0.95 * k, d[2] * 0.66 * k];
    const L = clamp((reich * (0.50 + 0.50 * s[2]) - Math.hypot(root[0], root[1])) / Math.max(r, 0.4), 0.25, 3.4);
    const kr = kreuz(d, [0.31, 0.93, 0.2]); kr[0] += 1e-4;
    const side = norm(kr), up = kreuz(side, d);
    const bend = (s[3] - 0.5) * 0.55 * L, w = 0.10 * L * Math.sin(t * 3.1 + s[3] * 6.0) * t;
    const sw = 0.05 * Math.sin(zeit * 0.7 + s[0] * 37.0 + t * 4.0) * t;
    const p = [0, 0, 0];
    for (let i = 0; i < 3; i++) p[i] = root[i] + d[i] * (L * t) + side[i] * (bend * t * t + sw) + up[i] * w;
    p[1] -= 0.07 * L * t * t;
    return [U.origin[0] + p[0], U.origin[1] + p[1], U.origin[2] + p[2]];
  }
  const wachstum = (s, grow) => ease(grow * 1.5 - s[2] * 0.5);

  // --------------------------------------------------------------- Shader
  const VS_PUNKTE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in vec4 aRnd;
layout(location=3) in vec4 aSeed;
uniform mat4 uPV;
uniform mat3 uHead;
uniform vec3 uHeadPos;
uniform float uPx, uSpacing, uContour, uDissolve, uIntro, uLines, uGlitter;
out vec3 vCol; out float vSoft; out float vA;
${FAEDEN}
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

  // Auflösen: erst lose in den Raum, dann auf einen Faden
  vec3 outw = uHead*normalize(aPos + vec3(0.0, 0.0, 0.4));
  vec3 wirbel = vec3(sin(aRnd.y*31.0 + uTime*0.6 + wp.y*2.1),
                     cos(aRnd.z*27.0 + uTime*0.5 + wp.x*1.9),
                     sin(aRnd.w*23.0 + uTime*0.4 + wp.y*1.3));
  vec3 lose = wp + (outw*(0.18 + 0.5*aRnd.y) + wirbel*0.22)*(sin(d*3.14159)*0.8 + d*0.2);
  vec3 ziel = strandPos(aSeed, aRnd.w*growOf(aSeed)) + (aRnd.xyz - 0.5)*0.05;
  vec3 p = mix(lose, ziel, smoothstep(0.30, 1.0, d));

  // Auftritt beim Laden: die Punkte rücken aus leichter Unordnung an ihren Platz
  p += (aRnd.xyz - 0.5)*vec3(1.6, 1.6, 1.2)*uIntro*uIntro;

  // nach dem Auflösen bleibt nur etwas Glitzer auf den Fäden
  float glitzer = step(1.0 - uGlitter, aRnd.z);
  float rest = mix(1.0, glitzer, smoothstep(0.80, 1.0, d));

  vec4 clip = uPV*vec4(p, 1.0);
  float sz = uSpacing*mix(1.9, 1.1 + aRnd.y*1.2, d)*keep*rest;
  gl_Position = sz > 0.0005 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = uPx*sz/clip.w;
  vec3 staub = mix(vec3(1.0, 0.985, 0.96), vec3(1.0, 0.70, 0.32), step(0.88, aRnd.x));
  vCol = mix(col, staub, d*0.92);
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

  const VS_BAND = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
layout(location=1) in vec3 aTSK;     // Stelle, Seite (-1/+1), 1 = beschrifteter Faden
uniform mat4 uPV;
uniform vec3 uCam;
uniform float uWidth, uTip;
out float vU; out float vT; out vec3 vPos; out vec3 vTan; out vec4 vSeed; out float vDepth;
${FAEDEN}
void main(){
  float g = growOf(aSeed);
  float t = aTSK.x*g;
  vec3 p = strandPos(aSeed, t);
  vec3 q = strandPos(aSeed, t + 0.004);
  vec3 T = normalize(q - p + vec3(1e-6));
  vec3 V = normalize(uCam - p);
  vec3 S = normalize(cross(T, V) + vec3(1e-6));
  float w = uWidth*(0.7 + 0.6*aSeed.w)*smoothstep(0.0, 0.05, aTSK.x)*(1.0 + 0.45*aTSK.z*uMarken);
  w *= mix(1.0, 1.22, step(uTip, aTSK.x)*uTipOn);
  w *= smoothstep(0.0, 0.03, g);
  vec3 wp = p + S*aTSK.y*w;
  vec4 clip = uPV*vec4(wp, 1.0);
  gl_Position = clip;
  vU = aTSK.y; vT = aTSK.x; vPos = wp; vTan = T; vSeed = aSeed; vDepth = clip.w;
}`;

  const FS_BAND = `#version 300 es
precision highp float;
in float vU; in float vT; in vec3 vPos; in vec3 vTan; in vec4 vSeed; in float vDepth;
uniform vec3 uCam, uBg, uCorePos;
uniform float uCore, uTip, uBraid, uTwist, uTipOn;
uniform vec2 uFog;
out vec4 o;
void main(){
  vec3 T = normalize(vTan);
  vec3 V = normalize(uCam - vPos);
  vec3 S = normalize(cross(T, V) + vec3(1e-6));
  float u = clamp(vU, -1.0, 1.0);
  float h = sqrt(max(0.0, 1.0 - u*u));
  vec3 N = normalize(S*u + V*h);                        // das flache Band tut, als wäre es rund
  float flecht = sin(vT*uBraid + u*2.6 + vSeed.x*40.0);
  N = normalize(N + T*flecht*uTwist);
  vec3 L = normalize(vec3(-0.5, 0.75, 0.6));
  float dif = dot(N, L)*0.5 + 0.5;
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 28.0);
  vec3 hell = vec3(0.985, 0.975, 0.97);
  vec3 dunkel = uBg*vec3(0.50, 0.48, 0.55);
  vec3 col = mix(dunkel, hell, smoothstep(0.12, 0.92, dif)) + spec*0.18;
  col *= 0.80 + 0.20*h;
  col *= 1.0 - 0.32*uTwist*(1.0 - flecht);
  float cd = distance(vPos, uCorePos);
  col += vec3(1.0, 0.40, 0.06)*uCore*1.5*exp(-cd*cd*4.2);          // Glut vom Kern
  float tip = step(uTip, vT)*uTipOn;
  vec3 kupfer = mix(vec3(0.50, 0.22, 0.07), vec3(0.98, 0.62, 0.26), smoothstep(0.15, 0.95, dif)) + vec3(1.0, 0.42, 0.05)*0.22;
  col = mix(col, kupfer, tip);
  col = mix(col, uBg, smoothstep(uFog.x, uFog.y, vDepth)*0.85);     // Fernes versinkt im Dunst
  o = vec4(col, 1.0);
}`;

  const VS_GLUT = `#version 300 es
precision highp float;
layout(location=0) in vec4 aSeed;
layout(location=1) in float aKind;
uniform mat4 uPV;
uniform float uPx, uGlow;
out float vI;
${FAEDEN}
void main(){
  float g = growOf(aSeed);
  vec4 clip = uPV*vec4(strandPos(aSeed, g), 1.0);
  gl_Position = clip;
  gl_PointSize = uPx*uGlow*(0.8 + 0.6*aSeed.w)*(1.0 + 0.9*aKind*uMarken)/clip.w;
  vI = smoothstep(0.03, 0.2, g)*(0.78 + 0.22*sin(uTime*2.0 + aSeed.x*50.0))*uTipOn;
}`;

  const FS_GLUT = `#version 300 es
precision highp float;
in float vI;
out vec4 o;
void main(){
  vec2 q = gl_PointCoord*2.0 - 1.0;
  float r2 = dot(q, q);
  float a = exp(-r2*5.0)*(1.0 - smoothstep(0.6, 1.0, r2))*vI;
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

  let P, B, G;
  function baueProgramme() {
    P = programm(VS_PUNKTE, FS_PUNKTE, 'Punkte');
    B = programm(VS_BAND, FS_BAND, 'Band');
    G = programm(VS_GLUT, FS_GLUT, 'Glut');
  }

  // --------------------------------------------------------------- Fäden
  const ANZAHL = mobil ? 96 : 150;
  const TEILE = mobil ? 72 : 108;
  const SPITZE = 0.972;
  // Die ersten sechs Fäden tragen die Beschriftungen: feste Richtung statt Zufall.
  // [Winkel in Grad, Tiefe, Länge, Biegung]
  const BESCHRIFTET = [
    [64, 0.44, 0.84, 0.54], [36, 0.46, 0.96, 0.46], [8, 0.42, 0.88, 0.55],
    [-18, 0.46, 0.97, 0.45], [-44, 0.44, 0.86, 0.56], [-68, 0.46, 0.80, 0.47],
  ];
  const saaten = [];
  for (let i = 0; i < ANZAHL; i++) {
    if (i < BESCHRIFTET.length) {
      const b = BESCHRIFTET[i];
      saaten.push([((b[0] + 360) % 360) / 360, b[1], b[2], b[3]]);
    } else {
      saaten.push([(i + zufall() * 0.7) / ANZAHL, zufall(), zufall(), zufall()]);
    }
  }

  const bandVAO = gl.createVertexArray();
  let bandZahl = 0, bandTyp = gl.UNSIGNED_SHORT;
  (function baueBaender() {
    const proFaden = (TEILE + 1) * 2;
    const v = new Float32Array(ANZAHL * proFaden * 7);
    const Index = ANZAHL * proFaden > 65535 ? Uint32Array : Uint16Array;
    const idx = new Index(ANZAHL * TEILE * 6);
    let a = 0, b = 0;
    for (let i = 0; i < ANZAHL; i++) {
      const s = saaten[i], basis = i * proFaden;
      for (let j = 0; j <= TEILE; j++) {
        for (let seite = -1; seite <= 1; seite += 2) {
          v[a++] = s[0]; v[a++] = s[1]; v[a++] = s[2]; v[a++] = s[3];
          v[a++] = j / TEILE; v[a++] = seite; v[a++] = i < BESCHRIFTET.length ? 1 : 0;
        }
        if (j < TEILE) {
          const k = basis + j * 2;
          idx[b++] = k; idx[b++] = k + 1; idx[b++] = k + 2;
          idx[b++] = k + 1; idx[b++] = k + 3; idx[b++] = k + 2;
        }
      }
    }
    gl.bindVertexArray(bandVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 16);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    bandZahl = idx.length;
    bandTyp = Index === Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    gl.bindVertexArray(null);
  })();

  const glutVAO = gl.createVertexArray();
  (function baueGlut() {
    const v = new Float32Array(ANZAHL * 5);
    for (let i = 0; i < ANZAHL; i++) { v.set(saaten[i], i * 5); v[i * 5 + 4] = i < BESCHRIFTET.length ? 1 : 0; }
    gl.bindVertexArray(glutVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
    gl.bindVertexArray(null);
  })();

  // ---------------------------------------------------------------- Kopf
  const punktVAO = gl.createVertexArray();
  let punktZahl = 0, punktAbstand = 0.006;
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
    x.drawImage(daten, 0, 0); const D = x.getImageData(0, 0, W, H).data;

    const schritt = mobil ? 2.5 : 1.7;                 // Bildpunkte zwischen zwei Punkten
    const hw = K.halbe_kopfbreite;
    punktAbstand = schritt / hw;
    const max = Math.ceil((W / schritt) * (H / (schritt * 0.87)));
    const pos = new Float32Array(max * 3), col = new Uint8Array(max * 4);
    const rnd = new Uint8Array(max * 4), sat = new Float32Array(max * 4);
    let n = 0, reihe = 0;
    for (let y = 0; y < H; y += schritt * 0.87, reihe++) {            // versetzte Reihen decken dichter
      for (let xx = (reihe % 2) * schritt * 0.5; xx < W; xx += schritt) {
        const px = Math.min(W - 1, Math.round(xx)), py = Math.min(H - 1, Math.round(y)), i = (py * W + px) * 4;
        const a = D[i + 1] / 255;
        if (a < 0.05 || a < zufall() * 0.92) continue;             // weicher, gestreuter Rand
        pos[n * 3] = (xx - K.mitte[0]) / hw;
        pos[n * 3 + 1] = -(y - K.mitte[1]) / hw;
        pos[n * 3 + 2] = (D[i] / 255) * K.tiefe_massstab - 0.45;
        col[n * 4] = F[i]; col[n * 4 + 1] = F[i + 1]; col[n * 4 + 2] = F[i + 2]; col[n * 4 + 3] = 255;
        for (let k = 0; k < 4; k++) rnd[n * 4 + k] = zufall() * 256;
        sat.set(saaten[(zufall() * ANZAHL) | 0], n * 4);
        n++;
      }
    }
    punktZahl = n;
    gl.bindVertexArray(punktVAO);
    const puffer = (ort, feld, groesse, typ, normiert) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, feld, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(ort); gl.vertexAttribPointer(ort, groesse, typ, normiert, 0, 0);
    };
    puffer(0, pos.subarray(0, n * 3), 3, gl.FLOAT, false);
    puffer(1, col.subarray(0, n * 4), 4, gl.UNSIGNED_BYTE, true);
    puffer(2, rnd.subarray(0, n * 4), 4, gl.UNSIGNED_BYTE, true);
    puffer(3, sat.subarray(0, n * 4), 4, gl.FLOAT, false);
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
    beiBild: null, punkte: 0, faeden: ANZAHL, bilder: null,
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
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
      pxProEinheit = H / (2 * TAN);
      if (Z && Z.bereit && Z.sichtbar) rendere(Z.fest ? festZeit : letzteZeit);     // sonst blitzt ein leeres Bild auf
    }
    pxProEinheit = H / (2 * TAN);
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
      else if (v.length === 3) gl.uniform3fv(ort, v);
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
    const drehung = ease(seg(0.05, 0.24, p));
    const linien = seg(0.09, 0.22, p);
    const wachsen = seg(0.23, 0.43, p);          // die Fäden wachsen, während sich der Kopf auflöst
    const einblenden = ease(seg(0.24, 0.31, p)); // und werden dabei erst sichtbar (keine weißen Stäbchen im Linienkopf)
    const aufloesen = seg(0.25, 0.43, p);
    const phase = seg(0.50, 0.66, p) + seg(0.72, 0.90, p);
    const kern = ease(seg(0.80, 0.95, p));
    const wende = ease(seg(0.78, 0.98, p));

    // ---- Bildaufbau: Das Motiv gehört in den freien Rahmen neben oder über dem Text.
    // Aus dem Rahmen folgt für jeden Zustand ein Maßstab (Bildpunkte je Welt-Einheit),
    // aus dem Maßstab der Abstand der Kamera. Die Mitte des Rahmens wird per Linsenversatz
    // getroffen: Das Motiv rückt zur Seite, ohne dass sich die Perspektive verzieht.
    const asp = W / H;
    const cssB = canvas.clientWidth || 1, cssH = canvas.clientHeight || 1;
    const R = Z.rahmen && Z.rahmen.b > 60 && Z.rahmen.h > 60 ? Z.rahmen
      : { x: cssB * 0.06, y: cssH * 0.10, b: cssB * 0.88, h: cssH * 0.82 };
    const breit = Z.modus !== 'hoch';
    const mx = R.x + R.b / 2, my = R.y + R.h / 2;
    const sKopf = Math.min(R.b / 2.6, R.h / 3.5, cssH * 0.78 / 3.5, 210) * 0.97;       // Kopf: 2,6 breit, 3,5 hoch
    const sFaeden = sKopf * 0.80, sStrang = sKopf * 0.86;
    const sBluete = Math.min(Math.min(R.b, R.h) * 0.40 / 1.32, sKopf * 1.45);           // Blüte: Halbmesser 1,32
    const e1 = ease(seg(0.20, 0.40, p)), e2 = ease(seg(0.50, 0.66, p)), e3 = ease(seg(0.72, 0.92, p));
    const massstab = mix(mix(mix(sKopf, sFaeden, e1), sStrang, e2), sBluete, e3);
    const D = cssH / (2 * TAN * massstab);
    const versatzY = 0.10 * massstab * (1 - e1);                 // der Kopf sitzt etwas über seinem Drehpunkt
    const proj = perspektive(FOV, asp, 0.5, D + 40);
    proj[8] = -((mx / cssB) * 2 - 1);
    proj[9] = -(1 - ((my + versatzY) / cssH) * 2);
    const gier = -blick.x * 0.11 + (ruhig ? 0 : 0.02 * Math.sin(zeit * 0.31));
    const nick = blick.y * 0.07;
    const PV = mal(proj, mal(schieb(0, 0, -D), mal(drehX(nick), drehY(gier))));
    const cam = [-Math.sin(gier) * Math.cos(nick) * D, Math.sin(nick) * D, Math.cos(gier) * Math.cos(nick) * D];

    // Reichweite der Fäden: bis an den Text, sonst bis an den Bildrand; rechts bleibt Platz für die Beschriftungen
    const mitMarken = breit && Z.marken !== false;
    const rand = 12, platzMarke = mitMarken ? 158 : 0;
    const reichRoh = [
      (mx - (breit ? R.x : rand)) / sFaeden,
      (cssB - rand - platzMarke - mx) / sFaeden,
      (my - R.y) / sFaeden,
      (R.y + R.h - my) / sFaeden,
    ];
    const kleinste = Math.max(0.9, Math.min(...reichRoh));
    const reich = reichRoh.map((v) => clamp(v * 0.90, 0.9, kleinste * 1.4));          // nicht mehr als 1,4-mal so lang wie kurz
    // Strang: sein aufgefächertes Ende (Halbmesser gut 1) muss vor dem Text enden
    const endeX = Math.max(mx - R.b * 0.10, (breit ? R.x : rand) + 1.25 * sStrang);
    const strangEnde = [(endeX - mx) / sStrang, -(R.h * 0.12) / sStrang, 0.5];

    const schweben = ruhig ? 0 : 1 - drehung;
    const kopfDreh = mat3aus(mal(
      drehY(0.62 * drehung + 0.05 * Math.sin(zeit * 0.5) * schweben + blick.x * 0.10 * schweben),
      drehX(-0.10 * drehung + 0.025 * Math.sin(zeit * 0.37) * schweben - blick.y * 0.05 * schweben)));
    const kopfPos = [0, 0.04 * Math.sin(zeit * 0.6) * schweben, 0];

    const achse = norm([mix(-0.72, -0.10, wende), mix(-0.42, 0.05, wende), mix(0.55, 1.0, wende)]);
    const bluete = [0, 0, 0];
    const kernPos = [bluete[0] + achse[0] * 0.38, bluete[1] + achse[1] * 0.38, bluete[2] + achse[2] * 0.38];
    const g = grundBei(p);
    const bg = [0, 1, 2].map((i) => (g.hell[i] * 0.45 + g.tief[i] * 0.55) / 255);
    const spitzen = 1 - ease(seg(1.15, 1.75, phase));             // in der Blüte verschwinden Kupfer und Glühen
    const gemeinsam = {
      uPV: PV, uTime: zeit, uPhase: phase, uGrow: wachsen, uReach: reich,
      uOrigin: [0, 0.05, 0], uCableEnd: strangEnde, uBloomC: bluete, uAxis: achse,
      uPx: pxProEinheit, uMarken: mitMarken ? 1 : 0, uTipOn: spitzen,
    };
    Z.masse = { rahmen: R, modus: Z.modus, massstab, abstand: D, reich };

    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);

    // 1 · Bänder
    if (wachsen > 0.001) {
      gl.disable(gl.BLEND);
      const t1 = clamp(phase), t2 = clamp(phase - 1);
      setze(B, Object.assign({}, gemeinsam, {
        uCam: cam, uBg: bg, uCorePos: kernPos, uCore: kern,
        uTip: mix(SPITZE, 0.991, clamp(phase)),                  // im langen Strang bleibt die Kupferspitze kurz
        uWidth: einblenden * Math.max(mix(mix(0.0115, 0.021, t1), 0.034, t2), mix(mix(1.05, 1.6, t1), 2.4, t2) / massstab),   // nie dünner als gut ein Bildpunkt
        uBraid: mix(mix(120, 210, t1), 260, t2),
        uTwist: mix(mix(0.07, 0.20, t1), 0.24, t2),              // dünne Fäden glatt, dicke gedreht wie ein Seil
        uFog: [D + 1.4, D + 6.5],
      }));
      gl.bindVertexArray(bandVAO);
      gl.drawElements(gl.TRIANGLES, bandZahl, bandTyp, 0);
    }

    // 2 · Punkte
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    setze(P, Object.assign({}, gemeinsam, {
      uHead: kopfDreh, uHeadPos: kopfPos, uSpacing: punktAbstand,
      uContour: linien, uDissolve: aufloesen, uIntro: auftritt, uLines: 9.5,
      uGlitter: mix(0.07, 0.03, clamp(phase)),
    }));
    gl.bindVertexArray(punktVAO);
    gl.drawArrays(gl.POINTS, 0, punktZahl);

    // 3 · glühende Spitzen
    if (wachsen > 0.001) {
      gl.depthMask(false);
      setze(G, Object.assign({}, gemeinsam, { uGlow: einblenden * Math.max(mix(mix(0.15, 0.23, clamp(phase)), 0.25, clamp(phase - 1)), 11 / massstab) }));
      gl.bindVertexArray(glutVAO);
      gl.drawArrays(gl.POINTS, 0, ANZAHL);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null);

    // ---- an die Seite melden: Farben, Beschriftungen, Kern
    if (Z.beiBild) {
      const U = { reich, origin: gemeinsam.uOrigin };
      const stark = mitMarken ? ease(seg(0.39, 0.44, p)) * (1 - ease(seg(0.49, 0.53, p))) : 0;
      const marken = stark < 0.005 ? [] : BESCHRIFTET.map((_, i) => {
        const f = saaten[i], ort = projiziere(PV, fadenA(f, wachstum(f, wachsen), zeit, U));
        return { x: ort.x * cssB, y: ort.y * cssH, staerke: stark };
      });
      const k = projiziere(PV, kernPos);
      Z.beiBild({
        p, grund: g, marken, rahmen: R,
        kern: { x: k.x * cssB, y: k.y * cssH, staerke: kern, radius: 1.2 * massstab },
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
    new IntersectionObserver((e) => { Z.sichtbar = e[0].isIntersecting; }, { rootMargin: '80px' }).observe(canvas);
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
    try { baueProgramme(); } catch (e) { console.error('[szene]', e.message); return aus('Shader: ' + e.message); }
    baueKopf().then((b) => {
      Z.bilder = b; Z.punkte = punktZahl; Z.bereit = true;
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
