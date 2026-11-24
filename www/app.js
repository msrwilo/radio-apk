import { buildVisualizers } from './visualizers.js?v=8';
import { buildVisualizers2 } from './visualizers2.js?v=14';
import { crearFuentes, crearSesionMedios } from './fuentes.js?v=3';
import { crearRemotoUI } from './ui-remoto.js?v=7';
import { crearPestanas } from './ui-pestanas.js?v=3';
import { crearBiblioteca } from './biblioteca.js?v=2';
import { crearLocal } from './local.js?v=1';
import { crearBibliotecaMaqueta } from './maqueta.js?v=1';
const APP_VERSION = 'app.js v34';
import { crearReproductorUI } from './ui-reproductor.js?v=2';
const STREAM_URL = 'https://radio.lafortalezaceramica.com/mp3.ogg';
const THREE_SOURCES = [
'./vendor/three.module.min.js',
'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js'
];
const $ = id => document.getElementById(id);
const body = document.body;
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// Modo Wallpaper Engine (?we=1): sin barra ni inicio; el audio llega del fondo de pantalla.
const WE_PARAMS = new URLSearchParams(location.search);
const WE = WE_PARAMS.get('we') === '1';
const store = {
get(k) { try { return localStorage.getItem(k); } catch { return null; } },
set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } }
};
function fatal(msg) {
const p = $('intro').querySelector('p'); if (p) p.textContent = msg;
$('intro').classList.remove('hide');
body.classList.add('fatal');
}
async function loadThree() {
for (const src of THREE_SOURCES) {
try { return await import(src); } catch (e) { console.warn('three.js no cargó desde', src); }
}
throw new Error('three.js');
}
const QUALITY = [
{ id: 'auto', label: 'Auto', badge: 'aut', dpr: 2, lite: null, fps: 60, adaptive: true, particles: true },
{ id: 'alta', label: 'Alta', badge: 'alta', dpr: 2, lite: false, fps: 60, adaptive: false, particles: true },
{ id: 'media', label: 'Media', badge: 'med', dpr: 1.25, lite: false, fps: 60, adaptive: false, particles: true },
{ id: 'baja', label: 'Baja', badge: 'baja', dpr: 0.85, lite: true, fps: 60, adaptive: false, particles: false },
{ id: 'ahorro', label: 'Ahorro', badge: 'eco', dpr: 0.6, lite: true, fps: 30, adaptive: false, particles: false }
];
const TIMES = [0, 60, 180, 300, 900, -1];
const TIME_BADGE = { 0: 'no', 60: '1m', 180: '3m', 300: '5m', 900: '15m', '-1': 'azar' };
const TIME_LABEL = { 0: 'Cambio automático: apagado', 60: 'Cambio cada 1 minuto', 180: 'Cambio cada 3 minutos', 300: 'Cambio cada 5 minutos', 900: 'Cambio cada 15 minutos', '-1': 'Cambio en tiempos al azar' };
class Radio {
constructor(url, onStatus) {
this.url = url; this.onStatus = onStatus;
this.wanted = false; this.mode = 'cors'; this.triedPlain = false;
this.el = null; this.ctx = null; this.nodes = null;
this.retry = 0; this.retryTimer = null;
this.lastTime = 0; this.lastProgress = 0;
setInterval(() => this.watchdog(), 3000);
}
get active() { return !!(this.el && !this.el.paused); }
status(s) { this.state = s; this.onStatus(s, this.mode); }
ensureCtx() {
const AC = window.AudioContext || window.webkitAudioContext;
if (!this.ctx && AC) { this.ctx = new AC(); }
if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
}
build(cors) {
if (this.el) this.teardown();
const el = new Audio();
el.preload = 'none';
if (cors) el.crossOrigin = 'anonymous';
el.addEventListener('playing', () => { this.retry = 0; this.lastProgress = performance.now(); this.status('live'); });
el.addEventListener('waiting', () => this.status('buffer'));
el.addEventListener('error', () => this.fail());
el.addEventListener('ended', () => this.fail());
this.el = el;
this.nodes = null;
if (cors && this.ctx) {
try {
const c = this.ctx;
const src = c.createMediaElementSource(el);
const an = c.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
const anLow = c.createAnalyser(); anLow.fftSize = 8192; anLow.smoothingTimeConstant = 0;
const sp = c.createChannelSplitter(2);
const aL = c.createAnalyser(); aL.fftSize = 2048;
const aR = c.createAnalyser(); aR.fftSize = 2048;
src.connect(c.destination); src.connect(an); src.connect(anLow);
src.connect(sp); sp.connect(aL, 0); sp.connect(aR, 1);
this.nodes = { src, an, anLow, sp, aL, aR };
} catch (e) { console.warn('Web Audio no disponible', e); }
}
}
teardown() {
const el = this.el; if (!el) return;
this.el = null;
try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* */ }
if (this.nodes) { try { this.nodes.src.disconnect(); this.nodes.an.disconnect(); this.nodes.sp.disconnect(); } catch { /* */ } }
this.nodes = null;
}
play() { this.wanted = true; this.ensureCtx(); this.start(); }
start() {
clearTimeout(this.retryTimer);
this.build(this.mode === 'cors');
this.el.src = this.url;
this.status('connecting');
this.lastProgress = performance.now(); this.lastTime = 0;
const p = this.el.play();
if (p) p.catch(err => {
if (err && err.name === 'NotAllowedError') { this.wanted = false; this.teardown(); this.status('blocked'); }
});
}
pause() { this.wanted = false; clearTimeout(this.retryTimer); this.teardown(); this.status('paused'); }
fail() {
if (!this.wanted) return;
if (this.mode === 'cors' && !this.triedPlain) { this.triedPlain = true; this.mode = 'plain'; this.start(); return; }
this.mode = 'cors'; this.triedPlain = false;
this.teardown();
this.retry++;
const delay = Math.min(15000, 1500 * this.retry);
this.status('retry');
this.retryTimer = setTimeout(() => { if (this.wanted) this.start(); }, delay);
}
watchdog() {
if (!this.wanted || !this.el) return;
const t = this.el.currentTime;
if (t !== this.lastTime) { this.lastTime = t; this.lastProgress = performance.now(); return; }
if (performance.now() - this.lastProgress > 14000) { this.mode = 'cors'; this.triedPlain = false; this.lastProgress = performance.now(); this.start(); }
}
}
const BANDS = { sub: [20, 60], kick: [60, 160], body: [160, 500], mids: [500, 2000], pres: [2000, 6000], air: [6000, 16000] };
const ONSETS = { kick: [40, 150, 1.6, 0.22], snare: [1500, 5000, 2.0, 0.16], hat: [7000, 14000, 1.8, 0.09] };
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
class Tracker {
constructor(span) { this.min = span; this.c = null; this.dev = 3; this.v = 0; }
push(db, dt, attack = 0.035, release = 0.16) {
if (this.c === null) this.c = db;
this.c += (db - this.c) * ease(dt, 2.5);
this.dev += (Math.abs(db - this.c) - this.dev) * ease(dt, 2.5);
const span = Math.max(this.min, this.dev * 3.2);
const target = Math.max(0, Math.min(1, 0.42 + (db - this.c) / span));
this.v += (target - this.v) * ease(dt, target > this.v ? attack : release);
return this.v;
}
}
class Onset {
constructor(lo, hi, k, gap) { this.lo = lo; this.hi = hi; this.k = k; this.gap = gap; this.mean = 0; this.dev = 1; this.last = -9; this.prev = null; this.pulse = 0; this.count = 0; }
push(bins, binHz, dt, t) {
const a = Math.max(1, Math.floor(this.lo / binHz)), b = Math.min(bins.length - 1, Math.ceil(this.hi / binHz));
let flux = 0;
if (!this.prev || this.prev.length !== bins.length) this.prev = new Float32Array(bins.length).fill(-200);
for (let i = a; i < b; i++) { const v = Math.max(bins[i], -100), d = v - Math.max(this.prev[i], -100); if (d > 0) flux += d; this.prev[i] = v; }
flux /= (b - a);
const hit = flux > this.mean + this.k * this.dev + 0.6 && t - this.last > this.gap;
const r = ease(dt, 1.2);
this.mean += (flux - this.mean) * r;
this.dev += (Math.abs(flux - this.mean) - this.dev) * r;
if (hit) { this.last = t; this.pulse = 1; this.count++; }
else this.pulse *= Math.exp(-dt * 6);
return hit;
}
}
class AudioState {
constructor(THREE) {
this.N = 256;
this.spec = new Float32Array(this.N);
this.wave = new Float32Array(1024);
this.fHi = null; this.fLo = null;
this.wL = new Float32Array(2048); this.wR = new Float32Array(2048);
this.bass = 0; this.mid = 0; this.high = 0; this.level = 0;
this.beat = 0; this.flow = 0; this.energy = 0; this.build = 0; this.drop = 0;
this.kick = 0; this.snare = 0; this.hat = 0;
this.band = { sub: 0, kick: 0, body: 0, mids: 0, pres: 0, air: 0 };
this.tracks = {}; for (const k in BANDS) this.tracks[k] = new Tracker(7);
this.levelTrack = new Tracker(8);
this.onsets = {}; for (const k in ONSETS) { const o = ONSETS[k]; this.onsets[k] = new Onset(o[0], o[1], o[2], o[3]); }
this.specHi = new Float32Array(this.N).fill(-60);
this.loudFast = -60; this.loudSlow = -60; this.lastKick = -9; this.lastDrop = -9;
this.simulated = true; this.silent = false; this.quietFor = 0;
this.texData = new Uint8Array(256 * 2);
this.tex = new THREE.DataTexture(this.texData, 256, 2, THREE.RedFormat, THREE.UnsignedByteType);
this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
this.tex.needsUpdate = true;
}
dbAt(f, sr) {
const lo = f < 700, arr = lo ? this.fLo : this.fHi, binHz = sr / 2 / arr.length;
const x = f / binHz, i = Math.floor(x), k = x - i;
return arr[Math.min(arr.length - 1, i)] * (1 - k) + arr[Math.min(arr.length - 1, i + 1)] * k;
}
bandDb(f0, f1, sr) {
const arr = f1 <= 700 ? this.fLo : this.fHi, binHz = sr / 2 / arr.length;
const a = Math.max(1, Math.floor(f0 / binHz)), b = Math.max(a + 1, Math.min(arr.length, Math.ceil(f1 / binHz)));
let p = 0; for (let i = a; i < b; i++) p += Math.pow(10, arr[i] / 10);
return 10 * Math.log10(p / (b - a) + 1e-12);
}
update(dt, t, radio, intensity) {
const n = radio.nodes;
let real = false;
if (n && n.anLow && radio.active) {
if (!this.fHi) { this.fHi = new Float32Array(n.an.frequencyBinCount); this.fLo = new Float32Array(n.anLow.frequencyBinCount); }
n.an.getFloatFrequencyData(this.fHi); n.anLow.getFloatFrequencyData(this.fLo);
n.aL.getFloatTimeDomainData(this.wL); n.aR.getFloatTimeDomainData(this.wR);
let ms = 0;
for (let i = 0; i < 2048; i++) { const v = (this.wL[i] + this.wR[i]) * 0.5; ms += v * v; if (i < 1024) this.wave[i] = v; }
const rms = 10 * Math.log10(ms / 2048 + 1e-12);
this.quietFor = rms < -62 ? this.quietFor + dt : 0;
this.silent = this.quietFor > 2;
real = isFinite(this.fHi[10]) && this.fHi[10] > -1000;
if (real && !this.silent) this.analyse(dt, t, radio.ctx.sampleRate, rms);
}
this.simulated = !real;
if (!real || this.silent) this.fallback(dt, t, real ? 0.12 : intensity);
this.flow += dt * (0.35 + this.level * 1.4 + this.beat * 0.6);
const d = this.texData;
for (let k = 0; k < 256; k++) {
d[k] = Math.round(this.spec[k] * 255);
d[256 + k] = Math.max(0, Math.min(255, Math.round((this.wave[k * 4] * 0.5 + 0.5) * 255)));
}
this.tex.needsUpdate = true;
}
analyse(dt, t, sr, rms) {
const N = this.N, lo = 30, hi = 16000;
for (let k = 0; k < N; k++) {
const f0 = lo * Math.pow(hi / lo, k / N), f1 = lo * Math.pow(hi / lo, (k + 1) / N);
const db = (f1 - f0) < 40 ? this.dbAt((f0 + f1) / 2, sr) : this.bandDb(f0, f1, sr);
const tilt = Math.log2((f0 + f1) / 2 / 1000) * 3;
const e = db + tilt;
this.specHi[k] = e > this.specHi[k] ? e : this.specHi[k] - dt * 3;
const v = Math.max(0, Math.min(1, (e - (this.specHi[k] - 26)) / 26));
const s = this.spec[k];
this.spec[k] = s + (v - s) * ease(dt, v > s ? 0.03 : 0.14);
}
const B = this.band;
for (const k in BANDS) B[k] = this.tracks[k].push(this.bandDb(BANDS[k][0], BANDS[k][1], sr), dt);
this.bass = Math.min(1, B.kick * 0.7 + B.sub * 0.45);
this.mid = (B.body + B.mids) * 0.5;
this.high = (B.pres + B.air) * 0.5;
this.level = this.levelTrack.push(rms, dt, 0.05, 0.3);
const o = this.onsets, hz = sr / 2;
const kHit = o.kick.push(this.fLo, hz / this.fLo.length, dt, t);
const sHit = o.snare.push(this.fHi, hz / this.fHi.length, dt, t);
o.hat.push(this.fHi, hz / this.fHi.length, dt, t);
this.kick = o.kick.pulse; this.snare = o.snare.pulse; this.hat = o.hat.pulse;
if (kHit) { this.beat = 1; this.lastKick = t; }
else if (sHit && t - this.lastKick > 1.5) this.beat = Math.max(this.beat, 0.75);
else this.beat *= Math.exp(-dt * 5);
this.loudFast += (rms - this.loudFast) * ease(dt, 0.6);
this.loudSlow += (rms - this.loudSlow) * ease(dt, 8);
const trend = this.loudFast - this.loudSlow;
this.energy += (Math.max(0, Math.min(1, (trend + 6) / 12)) - this.energy) * ease(dt, 0.4);
this.build += (Math.max(0, Math.min(1, trend / 4)) - this.build) * ease(dt, 1.5);
if (trend > 4 && t - this.lastDrop > 8) { this.drop = 1; this.lastDrop = t; } else this.drop *= Math.exp(-dt * 1.5);
}
fallback(dt, t, amt) {
const kick = Math.exp(-((t * 2) % 1) * 7) * (amt > 0.3 ? 1 : 0);
const hat = Math.exp(-((t * 4 + 0.5) % 1) * 18) * (amt > 0.3 ? 1 : 0);
for (let k = 0; k < this.N; k++) {
const x = k / this.N;
const n = 0.5 + 0.5 * Math.sin(k * 0.21 + t * 3.1) * Math.sin(k * 0.07 - t * 1.7);
const v = Math.min(1, (Math.pow(1 - x, 1.4) * 0.55 * (0.45 + 0.55 * n) + kick * Math.exp(-k / 18) * 0.75 + hat * (x > 0.6 ? 0.28 : 0)) * amt);
this.spec[k] += (v - this.spec[k]) * ease(dt, 0.08);
}
const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += this.spec[i]; return s / (b - a); };
const k2 = ease(dt, 0.08);
this.bass += (avg(10, 50) - this.bass) * k2; this.mid += (avg(50, 160) - this.mid) * k2; this.high += (avg(160, 250) - this.high) * k2;
this.level += (avg(0, 256) - this.level) * k2;
const B = this.band; B.sub = B.kick = this.bass; B.body = B.mids = this.mid; B.pres = B.air = this.high;
if (kick > 0.97) { this.beat = 1; this.kick = 1; } else { this.beat *= Math.exp(-dt * 5); this.kick *= Math.exp(-dt * 6); }
this.snare *= Math.exp(-dt * 6); this.hat = hat;
this.energy += (amt * 0.5 - this.energy) * ease(dt, 1); this.build *= Math.exp(-dt); this.drop *= Math.exp(-dt * 1.5);
if (amt <= 0.3) { const sr = 48000; for (let i = 0; i < 1024; i++) this.wave[i] *= 0.9; return; }
const sr = 48000;
for (let i = 0; i < 1024; i++) {
const s = (t * sr + i) / sr;
this.wave[i] = amt * (0.45 * Math.sin(6.2832 * 110 * s) + 0.28 * Math.sin(6.2832 * 165.4 * s + t * 0.7) + 0.16 * Math.sin(6.2832 * 220.9 * s + t * 0.3) + kick * 0.3 * Math.sin(6.2832 * 55 * s));
}
}
}
const T_VS = /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;
const T_NOISE = /* glsl */`
float th(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float tvn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(th(i),th(i+vec2(1.0,0.0)),f.x),mix(th(i+vec2(0.0,1.0)),th(i+vec2(1.0,1.0)),f.x),f.y);}
float tfb(vec2 p){return tvn(p)*0.5+tvn(p*2.1+3.1)*0.25+tvn(p*4.3+7.7)*0.125+tvn(p*8.7+1.3)*0.0625;}
`;
function makeTransitions(THREE, renderer) {
const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const qU = { uSnap: { value: null }, uP: { value: 0 }, uMode: { value: 0 }, uAspect: { value: 1 }, uSeed: { value: 0 } };
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
uniforms: qU, transparent: true, depthTest: false, depthWrite: false, vertexShader: T_VS,
fragmentShader: T_NOISE + /* glsl */`
uniform sampler2D uSnap; uniform float uP,uMode,uAspect,uSeed; varying vec2 vUv;
void main(){
vec2 uv=vUv; float p=uP; float a=1.0; vec3 glow=vec3(0.0);
float n=tfb(vUv*4.0+uSeed);
if(uMode<1.5){
float sa=1.0-smoothstep(0.03,0.12,p);
float veil=1.0-smoothstep(0.8,0.97,p);
a=max(sa,veil);
gl_FragColor=vec4(texture2D(uSnap,vUv).rgb*sa/max(a,0.001),a);
return;
}else if(uMode<2.5){
vec2 c=vUv-0.5; c.x*=uAspect; float r=length(c);
float ang=p*p*9.0*(1.2-smoothstep(0.0,0.8,r));
c=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*c; c*=1.0+p*p*0.8; c.x/=uAspect; uv=c+0.5;
float t=p*1.25-0.15;
a=1.0-smoothstep(t-0.08,t,n);
glow=vec3(1.0,0.7,0.4)*smoothstep(0.08,0.0,abs(n-t))*(1.0-p);
}else{
uv.y+=p*p*(0.25+n*0.9); uv.x+=(n-0.5)*p*0.15;
float m=n*0.6+(1.0-vUv.y)*0.4;
float t=p*1.3-0.2;
a=1.0-smoothstep(t-0.06,t,m);
glow=vec3(0.6,0.9,1.0)*smoothstep(0.06,0.0,abs(m-t))*(1.0-p);
}
vec3 col=texture2D(uSnap,clamp(uv,0.0,1.0)).rgb;
float ao=clamp(a+length(glow)*0.6,0.0,1.0);
float veil=1.0-smoothstep(0.6,0.95,p);
float af=max(ao,veil);
gl_FragColor=vec4((col+glow)*ao/max(af,0.001),af);
}`
}));
quad.frustumCulled = false; scene.add(quad);
const pU = { uSnapA: { value: null }, uSnapB: { value: null }, uHasB: { value: 0 }, uP: { value: 0 }, uMode: { value: 0 }, uPS: { value: 4 }, uSeed: { value: 0 }, uAspect: { value: 1 } };
const pMat = new THREE.ShaderMaterial({
uniforms: pU, transparent: true, depthTest: false, depthWrite: false,
vertexShader: /* glsl */`
attribute vec2 aUV; attribute vec2 aUV2; attribute float aR; uniform sampler2D uSnapA,uSnapB; uniform float uHasB,uP,uMode,uPS,uSeed,uAspect; varying vec4 vC;
void main(){
float t=clamp((uP-0.07-aR*0.22)/0.52,0.0,1.0);
float e=t*t*t*(t*(t*6.0-15.0)+10.0);
vec2 pa=aUV*2.0-1.0, pb=aUV2*2.0-1.0;
vec2 mid=(pa+pb)*0.5;
vec2 c;
if(uMode<0.5){
float an=(aR-0.5)*3.0+uSeed;
mid.x*=uAspect; mid=mat2(cos(an),-sin(an),sin(an),cos(an))*mid*1.35; mid.x/=uAspect; c=mid;
}else{
vec2 d=pa; d.x*=uAspect; d=normalize(d+0.0001)*(1.4+aR*1.4); d.x/=uAspect; c=pa+d;
}
float k=1.0-e;
vec2 p=k*k*pa+2.0*e*k*c+e*e*pb;
gl_Position=vec4(p,0.0,1.0);
float fly=sin(3.14159*e);
gl_PointSize=uPS*(1.0+fly*0.9);
vec3 ca=texture2D(uSnapA,aUV).rgb;
vec3 cb=uHasB>0.5?texture2D(uSnapB,aUV2).rgb:ca;
vec3 col=mix(ca,cb,smoothstep(0.25,0.75,e));
col*=1.0+fly*0.7;
float lum=max(col.r,max(col.g,col.b));
float alpha=smoothstep(0.0,0.06,uP)*(1.0-smoothstep(0.86,1.0,uP))*smoothstep(0.015,0.07,lum);
vC=vec4(col,alpha);
}`,
fragmentShader: /* glsl */`
varying vec4 vC;
void main(){ float d=length(gl_PointCoord-0.5); gl_FragColor=vec4(vC.rgb,smoothstep(0.5,0.32,d)*vC.a); }`
});
let points = null, cols = 0, rows = 0;
const buildPoints = (c, r) => {
if (points) { scene.remove(points); points.geometry.dispose(); }
cols = c; rows = r;
const n = c * r, uv = new Float32Array(n * 2), uv2 = new Float32Array(n * 2), rr = new Float32Array(n), perm = new Uint32Array(n);
for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) { const k = j * c + i; uv[k * 2] = (i + 0.5) / c; uv[k * 2 + 1] = (j + 0.5) / r; perm[k] = k; rr[k] = Math.random(); }
for (let k = n - 1; k > 0; k--) { const m = Math.floor(Math.random() * (k + 1)); const tmp = perm[k]; perm[k] = perm[m]; perm[m] = tmp; }
for (let k = 0; k < n; k++) { uv2[k * 2] = uv[perm[k] * 2]; uv2[k * 2 + 1] = uv[perm[k] * 2 + 1]; }
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
g.setAttribute('aUV2', new THREE.BufferAttribute(uv2, 2));
g.setAttribute('aR', new THREE.BufferAttribute(rr, 1));
points = new THREE.Points(g, pMat); points.frustumCulled = false; scene.add(points);
};
let snapA = null, snapB = null, tookB = false;
const size = new THREE.Vector2();
const st = { active: false, p: 0, dur: 3.2, mode: 0, last: -1 };
const grab = old => {
renderer.getDrawingBufferSize(size);
let s = old;
if (!s || s.image.width !== size.x || s.image.height !== size.y) {
if (s) s.dispose();
s = new THREE.FramebufferTexture(size.x, size.y);
s.minFilter = s.magFilter = THREE.LinearFilter;
}
renderer.setRenderTarget(null);
renderer.copyFramebufferToTexture(s);
return s;
};
return {
get active() { return st.active; },
capture() { snapA = grab(snapA); },
start(allowParticles) {
const modes = allowParticles ? [0, 1] : [2, 3];
let m; do { m = modes[Math.floor(Math.random() * modes.length)]; } while (m === st.last && modes.length > 1);
st.mode = st.last = m; st.p = 0; st.active = true; tookB = false;
st.dur = m < 2 ? 3.2 : 2.6;
const seed = Math.random() * 6.28;
qU.uSnap.value = pU.uSnapA.value = snapA; pU.uHasB.value = 0;
qU.uMode.value = pU.uMode.value = m; qU.uSeed.value = seed; pU.uSeed.value = seed;
qU.uAspect.value = pU.uAspect.value = size.x / Math.max(1, size.y);
if (m < 2) {
const c = isMobile ? 150 : 260, r = Math.max(8, Math.round(c * size.y / Math.max(1, size.x)));
if (c !== cols || r !== rows) buildPoints(c, r);
pU.uPS.value = size.x / c * 1.45;
points.visible = true;
} else if (points) points.visible = false;
},
draw(dt) {
if (!st.active) return;
st.p += Math.min(dt, 1 / 30) / st.dur;
if (st.p >= 1) { st.active = false; return; }
if (st.mode < 2 && !tookB && st.p > 0.05) { try { snapB = grab(snapB); pU.uSnapB.value = snapB; pU.uHasB.value = 1; } catch (e) { /* sin segunda captura */ } tookB = true; }
qU.uP.value = pU.uP.value = st.p;
const ac = renderer.autoClear; renderer.autoClear = false;
renderer.setRenderTarget(null);
renderer.render(scene, cam);
renderer.autoClear = ac;
}
};
}
class DeviceAudio {
constructor() { this.stream = null; this.nodes = null; this.ctx = null; this.on = false; }
get active() { return this.on; }
static supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !isMobile; }
async start(ctx, onEnd) {
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: 'include', selfBrowserSurface: 'exclude' });
const tracks = stream.getAudioTracks();
if (!tracks.length) { stream.getTracks().forEach(tr => tr.stop()); throw Object.assign(new Error('sin audio'), { name: 'NoAudio' }); }
const src = ctx.createMediaStreamSource(new MediaStream(tracks));
const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
const anLow = ctx.createAnalyser(); anLow.fftSize = 8192; anLow.smoothingTimeConstant = 0;
const sp = ctx.createChannelSplitter(2);
const aL = ctx.createAnalyser(); aL.fftSize = 2048;
const aR = ctx.createAnalyser(); aR.fftSize = 2048;
src.connect(an); src.connect(anLow); src.connect(sp); sp.connect(aL, 0); sp.connect(aR, 1);
this.stream = stream; this.ctx = ctx; this.nodes = { src, an, anLow, sp, aL, aR }; this.on = true;
stream.getTracks().forEach(tr => tr.addEventListener('ended', () => { if (this.on) { this.stop(); if (onEnd) onEnd(); } }));
}
stop() {
this.on = false;
if (this.nodes) { try { this.nodes.src.disconnect(); this.nodes.sp.disconnect(); } catch { /* */ } }
if (this.stream) this.stream.getTracks().forEach(tr => tr.stop());
this.stream = null; this.nodes = null;
}
}
// Wallpaper Engine manda 128 valores (64 por canal, de graves a agudos); aquí se vuelven datos de analizador.
class WEAudio {
constructor() {
this.v = new Float32Array(64); this.last = -1e9; this.ph = 0;
this.ctx = { sampleRate: 48000 };
const map = n => { const hz = 24000 / n, m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = Math.max(0, Math.min(63, 64 * Math.log(Math.max(20, i * hz) / 20) / Math.log(800))); return m; };
const fill = m => a => { const v = this.v; for (let i = 0; i < a.length; i++) { const x = m[i], k = Math.floor(x), t = x - k; a[i] = 20 * Math.log10(v[k] * (1 - t) + v[Math.min(63, k + 1)] * t + 3e-4) - 20; } };
const node = (n, f) => ({ frequencyBinCount: n, getFloatFrequencyData: f, getFloatTimeDomainData: a => this.wave(a) });
const td = node(1024, () => {});
this.nodes = { an: node(1024, fill(map(1024))), anLow: node(4096, fill(map(4096))), aL: td, aR: td };
}
push(arr) { for (let i = 0; i < 64; i++) { const x = ((+arr[i] || 0) + (+arr[i + 64] || 0)) * 0.5; this.v[i] = x > 0 ? Math.min(1, x) : 0; } this.last = performance.now(); this.count = (this.count || 0) + 1; }
get active() { return performance.now() - this.last < 3000; }
wave(a) { let s = 0; for (let i = 0; i < 64; i++) s += this.v[i]; const amp = Math.min(1, s / 64 * 1.5); for (let i = 0; i < a.length; i++) { this.ph += 0.031; a[i] = amp * Math.sin(this.ph) * (0.7 + 0.3 * Math.sin(this.ph * 7.3)); } }
}
const STATUS_TXT = {
ready: 'Listo', connecting: 'Conectando…', buffer: 'Cargando…', live: 'En vivo',
retry: 'Sin señal · reintentando', paused: 'En pausa', blocked: 'Toca para escuchar'
};
async function main() {
let THREE;
try { THREE = await loadThree(); }
catch { fatal('No se pudo cargar el visualizador'); return; }
const canvas = $('stage');
let renderer;
try {
renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance', alpha: false });
} catch {
fatal('Este navegador no soporta WebGL 2'); return;
}
renderer.setClearColor(0x0d0b0a, 1);
const SKEY = WE ? 'radio.we.settings' : 'radio.settings';
const saved = (() => { try { return JSON.parse(store.get(SKEY) || '{}'); } catch { return {}; } })();
const settings = { auto: TIMES.includes(saved.auto) ? saved.auto : 0, random: saved.random ? 1 : 0, quality: QUALITY.some(q => q.id === saved.quality) ? saved.quality : (saved.low ? 'ahorro' : 'auto') };
if (WE && !store.get(SKEY)) { settings.auto = 180; settings.random = 1; }
const saveSettings = () => store.set(SKEY, JSON.stringify(settings));
const Q = () => QUALITY.find(q => q.id === settings.quality) || QUALITY[0];
const lite = () => { const q = Q(); return q.lite === null ? isMobile : q.lite; };
const input = { yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, x: 0, y: 0, active: false, strength: 0, idle: 99 };
const A = new AudioState(THREE);
A.input = input;
const trans = makeTransitions(THREE, renderer);
const vizList = [...buildVisualizers(THREE), ...buildVisualizers2(THREE)];
let silentShown = false;
const device = new DeviceAudio();
const weAudio = WE ? new WEAudio() : null;
if (WE) {
// Wallpaper Engine entrega el audio de la computadora a esta función (unas 30 veces por segundo).
if (window.wallpaperRegisterAudioListener) window.wallpaperRegisterAudioListener(a => { if (a && a.length >= 128) weAudio.push(a); });
window.addEventListener('message', e => { const d = e.data; if (d && Array.isArray(d.we) && d.we.length >= 128) weAudio.push(d.we); });
// Sin radio: fuera play, fuente, pantalla completa y la pantalla de inicio. La barra y el menú se quedan.
document.head.insertAdjacentHTML('beforeend', '<style>body.we #play,body.we #source,body.we #fs,body.we:not(.fatal) #intro{display:none!important}#weDiag{position:fixed;left:12px;top:60px;z-index:50;font:12px/1.4 monospace;color:#e8dcc8;background:rgba(0,0,0,.6);padding:6px 9px;border-radius:6px;pointer-events:none;white-space:pre;display:none}body.diag #weDiag{display:block}</style>');
body.insertAdjacentHTML('beforeend', '<div id="weDiag"></div>');
}
let UI = null, RM = null, tabOtra = false, bgFijo = false;
// Música puesta desde Remoto: suena en Prometeo y llega por la radio. Solo manda cuando la fuente es la radio.
const usaRemoto = () => !!(RM && F.source === 'radio' && RM.activo());
function paintFranja() {
if (!UI) return;
if (F.source === 'local' && local && local.pista) {
const p = local.pista, d = local.duracion();
UI.franja({ titulo: p.titulo, sub: [p.artista, p.album].filter(Boolean).join(' · ') || 'Música de este dispositivo', anterior: true, siguiente: true, progreso: d > 0 ? local.tiempo() / d : 0, imagen: local.portada.chica || null });
return;
}
if (usaRemoto()) { const f = RM.franja(); if (f) { UI.franja(f); return; } }
const dev = F.source === 'device';
UI.franja({ titulo: dev ? 'Audio del dispositivo' : 'La Fortaleza Radio', sub: dev ? (silentShown ? 'Sin audio' : 'Visualizando') : $('statusText').textContent, anterior: false, siguiente: false, progreso: null });
}
function pintarFondo() {
bgFijo = tabOtra && (settings.quality === 'baja' || settings.quality === 'ahorro');
body.classList.toggle('bg-fijo', bgFijo);
}
function aplicarPestana(id) {
tabOtra = id !== 'visuales';
body.classList.remove('sheet');
if (RM) { if (id === 'remoto') RM.alMostrar(); else RM.alOcultar(); }
pintarFondo(); paintFranja();
}
const paintStatus = () => {
const s = radio.state, mode = radio.mode;
let txt = STATUS_TXT[s] || s;
if (WE) { $('statusText').textContent = weAudio.active ? (silentShown ? 'Sin sonido' : 'Audio de la computadora') : 'No llega el audio'; body.dataset.st = 'live'; return; }
if (F.source === 'local') { $('statusText').textContent = silentShown ? 'Música · sin audio' : 'Música de este dispositivo'; body.dataset.st = 'live'; paintFranja(); return; }
if (F.source === 'device') { $('statusText').textContent = silentShown ? 'Dispositivo · sin audio' : 'Audio del dispositivo'; body.dataset.st = 'live'; paintFranja(); return; }
if (s === 'live' && mode === 'plain') txt = 'En vivo · visual libre';
else if (s === 'live' && silentShown) txt = 'En vivo · sin audio';
$('statusText').textContent = txt;
paintFranja();
};
const radio = new Radio(STREAM_URL, (s, mode) => {
body.dataset.st = s;
paintStatus();
paintPlaying();
updateMediaSession(isPlaying());
});
const VKEY = WE ? 'radio.we.viz' : 'radio.viz';
let index = Math.min(vizList.length - 1, Math.max(0, parseInt(store.get(VKEY) || '0', 10) || 0));
if (WE && store.get(VKEY) === null) index = Math.floor(Math.random() * vizList.length);
let current = null, quality = 1, W = 1, H = 1, PR = 1, autoT = 0, autoTarget = 60, pendingIdx = null;
const pad = n => String(n).padStart(2, '0');
const grid = $('grid');
vizList.forEach((v, i) => {
const b = document.createElement('button');
b.innerHTML = `<b>${pad(i + 1)}</b><span>${v.name}</span>`;
b.addEventListener('click', e => { e.stopPropagation(); setViz(i); body.classList.remove('sheet'); });
grid.appendChild(b);
});
const pickAutoTarget = () => {
autoT = 0;
autoTarget = settings.auto === -1 ? [60, 180, 300, 900][Math.floor(Math.random() * 4)] : settings.auto;
};
const paintSettings = () => {
document.querySelectorAll('.seg').forEach(seg => {
const k = seg.dataset.k;
seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(settings[k]) === b.dataset.v));
});
body.classList.toggle('auto', settings.auto !== 0);
$('timerBadge').textContent = TIME_BADGE[settings.auto];
$('qualBadge').textContent = Q().badge;
};
const setQuality = id => {
const wasLite = lite();
settings.quality = id; saveSettings(); paintSettings(); quality = 1; pintarFondo();
if (wasLite !== lite()) setViz(index, false); else applySize();
};
const setAuto = v => { settings.auto = v; saveSettings(); paintSettings(); pickAutoTarget(); };
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', e => {
e.stopPropagation();
const k = b.parentElement.dataset.k, raw = b.dataset.v;
if (k === 'quality') setQuality(raw);
else if (k === 'auto') setAuto(parseInt(raw, 10));
else { settings[k] = parseInt(raw, 10); saveSettings(); paintSettings(); }
}));
$('timer').addEventListener('click', () => {
const next = TIMES[(TIMES.indexOf(settings.auto) + 1) % TIMES.length];
setAuto(next); showToast(TIME_LABEL[next], settings.random ? 'Visual aleatorio' : 'Visual en orden');
});
$('quality').addEventListener('click', () => {
const i = QUALITY.findIndex(q => q.id === settings.quality);
const q = QUALITY[(i + 1) % QUALITY.length];
setQuality(q.id); showToast('Calidad: ' + q.label, q.id === 'auto' ? 'Se ajusta sola' : '');
});
paintSettings(); pickAutoTarget();
if (WE) {
// Propiedades de Wallpaper Engine: solo se aplica lo que cambió desde la última vez, así no pisan lo elegido en el menú.
window.__weApply = o => {
let last = {}; try { last = JSON.parse(store.get('radio.we.props') || '{}'); } catch { /* */ }
for (const k in o) {
const v = String(o[k]);
if (k === 'diagnostico') { body.classList.toggle('diag', v === 'true'); continue; }
if (last[k] === v) continue;
if (k === 'cambio') { const au = parseInt(v, 10); if (TIMES.includes(au)) setAuto(au); }
else if (k === 'orden') { settings.random = v === '0' ? 0 : 1; saveSettings(); paintSettings(); }
else if (k === 'calidad') { if (QUALITY.some(x => x.id === v)) setQuality(v); }
else if (k === 'visual') { const n = parseInt(v, 10); if (n >= 1 && n <= vizList.length) pendingVizProp = n - 1; }
}
store.set('radio.we.props', JSON.stringify(Object.assign(last, o)));
};
}
let pendingVizProp = null;
function applySize() {
W = window.innerWidth; H = window.innerHeight;
const q = Q();
const max = Math.min(q.dpr, (current && current.maxDpr) || 2);
const dpr = window.devicePixelRatio || 1;
PR = Math.max(0.4, Math.min(dpr, max) * (q.adaptive ? quality : 1));
renderer.setPixelRatio(PR);
renderer.setSize(W, H, false);
if (current) current.inst.resize(W, H, PR);
}
function createViz(i) {
if (current) { try { current.inst.dispose(); } catch (e) { console.warn(e); } }
renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1;
renderer.setClearColor(0x0d0b0a, 1);
input.yaw = input.pitch = input.vyaw = input.vpitch = 0;
index = i;
const def = vizList[i];
try {
current = { maxDpr: def.maxDpr, inst: def.create({ THREE, renderer, A, mobile: lite() }) };
} catch (e) {
console.error('Visualizador falló', def.name, e);
current = null;
}
applySize();
store.set(VKEY, String(i));
$('vizIndex').textContent = pad(i + 1);
$('vizName').textContent = def.name;
[...grid.children].forEach((b, k) => b.classList.toggle('on', k === i));
return def;
}
function setViz(i, toast = true) {
i = (i + vizList.length) % vizList.length;
pickAutoTarget();
if (!current) {
const def = createViz(i);
$('veil').classList.add('off');
if (toast) showToast(def.name, `${pad(i + 1)} / ${pad(vizList.length)}`);
return;
}
pendingIdx = i; pendingToast = toast;
}
let pendingToast = true;
function doSwitch() {
const i = pendingIdx; pendingIdx = null;
let captured = false;
try { trans.capture(); captured = true; } catch (e) { console.warn('Sin captura para transición', e); }
const def = createViz(i);
if (captured) trans.start(Q().particles);
if (pendingToast && !body.classList.contains('menu')) showToast(def.name, `${pad(i + 1)} / ${pad(vizList.length)}`);
}
const nextAuto = () => {
if (settings.random) {
let j = index;
while (j === index && vizList.length > 1) j = Math.floor(Math.random() * vizList.length);
setViz(j);
} else setViz(index + 1);
};
let toastTimer = null;
function showToast(txt, sub) {
const t = $('toast');
t.innerHTML = sub ? `${txt}<small>${sub}</small>` : txt;
t.classList.add('show');
clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}
// 24 nov 2026 (Wilo): sin portada «Toca para escuchar»; la app arranca sola (ver arrancar() al final).
if (WE) body.classList.add('we');
if (WE && window.__weOpts && window.__weGot) window.__weApply(window.__weOpts);
const intro = $('intro');
function start() {
intro.classList.add('hide'); body.classList.remove('intro');
body.classList.add('menu');
if (local && store.get('radio.fuente') === 'local' && local.hayCola) {
F.setSource('local', { iniciar: false }).then(() => local.reanudar()).then(ok => { if (ok) requestWake(); else F.setSource('radio').catch(() => {}); }).catch(() => { radio.play(); requestWake(); });
} else { radio.play(); requestWake(); }
}
// Si el navegador no deja sonar sin un toque (política de reproducción automática), la radio empieza con el primer
// toque o tecla en cualquier parte. Se espera a que el propio botón actúe: si ya la puso o la pausó, no se toca.
function armarPrimerToque() {
const quitar = () => { document.removeEventListener('click', alTocar, true); document.removeEventListener('keydown', alTocar, true); };
const alTocar = () => { setTimeout(() => {
if (F.source !== 'radio') { quitar(); return; }
if (radio.state === 'blocked' && !radio.wanted) { radio.play(); requestWake(); }
if (radio.state !== 'blocked') quitar();
}, 0); };
document.addEventListener('click', alTocar, true);
document.addEventListener('keydown', alTocar, true);
}
let dragDist = 0, lastPX = 0, lastPY = 0, pointerId = null;
const isUI = el => el && el.closest && el.closest('.ui, .ui-sheet, #intro');
window.addEventListener('pointerdown', e => {
if (isUI(e.target) || pointerId !== null || tabOtra) return;
pointerId = e.pointerId; dragDist = 0; lastPX = e.clientX; lastPY = e.clientY;
input.active = true; input.idle = 0;
input.x = e.clientX / W * 2 - 1; input.y = -(e.clientY / H * 2 - 1);
});
window.addEventListener('pointermove', e => {
if (e.pointerId !== pointerId) return;
const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
lastPX = e.clientX; lastPY = e.clientY;
dragDist += Math.abs(dx) + Math.abs(dy);
input.x = e.clientX / W * 2 - 1; input.y = -(e.clientY / H * 2 - 1);
if (dragDist > 10) {
const k = 4 / Math.max(W, 1), kp = 2.2 / Math.max(H, 1);
input.yaw += dx * k; input.pitch = Math.max(-1.1, Math.min(1.1, input.pitch + dy * kp));
input.vyaw = dx * k * 60; input.vpitch = dy * kp * 60;
}
});
const endPointer = e => { if (e.pointerId !== pointerId) return; pointerId = null; input.active = false; input.idle = 0; };
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
function onTap(e) {
if (e.target.closest('.ui, .ui-sheet')) return;
if (body.classList.contains('intro')) { start(); return; }
if (tabOtra) return;
if (dragDist > 10) { dragDist = 0; return; }
if (body.classList.contains('sheet')) { body.classList.remove('sheet'); return; }
body.classList.toggle('menu');
if (!body.classList.contains('menu')) body.classList.remove('sheet');
}
document.addEventListener('click', onTap);
const paintSource = () => {
$('srcBadge').textContent = F.source === 'device' ? 'disp' : F.source === 'local' ? 'música' : 'radio';
$('source').classList.toggle('on', F.source !== 'radio');
};
const params = new URLSearchParams(location.search);
const maqueta = params.get('maqueta');
// 24 nov 2026 (Wilo): la pestaña Reproductor (música de una carpeta) es solo para la APK. En el navegador no hay
// biblioteca ni reproductor local; con ?maqueta= sí, para probar.
const ES_APK = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const biblioteca = WE ? null : (maqueta ? crearBibliotecaMaqueta({ modo: maqueta === 'vacia' || maqueta === 'permiso' ? maqueta : '1' }) : (ES_APK ? crearBiblioteca() : null));
const local = biblioteca ? crearLocal({ radio, bib: biblioteca }) : null;
const F = crearFuentes({
defs: {
radio: { iniciar: () => { radio.play(); requestWake(); }, parar: () => radio.pause() },
local: { preparar: () => local.preparar(), iniciar: () => { local.reanudar().then(ok => { if (ok) requestWake(); }); }, parar: () => local.pausar() },
device: {
preparar: async () => {
radio.ensureCtx();
await device.start(radio.ctx, () => { F.setSource('radio').catch(() => {}); showToast('Radio', 'Se dejó de compartir el audio'); });
},
iniciar: () => requestWake(),
parar: () => device.stop()
}
}
});
const isPlaying = () => F.source === 'device' || (F.source === 'local' ? local.sonando : radio.wanted);
const paintPlaying = () => body.classList.toggle('playing', F.source === 'device' || (F.source === 'local' ? local.sonando : (radio.wanted && radio.state !== 'blocked')));
F.onChange(src => {
if (src !== 'device') store.set('radio.fuente', src);
paintSource(); paintPlaying(); paintStatus(); updateMediaSession(isPlaying());
if (src === 'device') showToast('Audio del dispositivo', 'Visualizando lo que suena en tu equipo');
});
const useDevice = async () => {
showToast('Audio del dispositivo', 'Elige la pantalla y activa «Compartir audio»');
try { await F.setSource('device'); }
catch (e) {
showToast('No se pudo capturar el audio', e && e.name === 'NoAudio' ? 'Activa «Compartir audio» al elegir la pantalla' : (e && e.name === 'NotAllowedError' ? 'Cancelado' : 'Tu navegador no lo permite'));
}
};
if (DeviceAudio.supported()) {
$('source').addEventListener('click', () => { if (F.source !== 'radio') { F.setSource('radio'); showToast('Radio', 'La Fortaleza en vivo'); } else useDevice(); });
} else $('source').style.display = 'none';
let RU = null;
// Tocar la franja «Ahora suena» lleva a la vista de lo que suena: música propia → Reproductor (ya ahí, abre la hoja);
// YouTube desde Remoto → Remoto; radio o audio del dispositivo → Visuales. Radio Garden y SoundCloud se suman aquí.
const irAAhoraSuena = () => {
  if (!UI) return;
  if (F.source === 'local' && local && local.pista) { if (UI.actual === 'reproductor') { if (RU) RU.abrirAhoraSuena(); } else UI.elegir('reproductor'); return; }
  if (usaRemoto() && RM.franja()) { if (UI.actual !== 'remoto') UI.elegir('remoto'); return; }
  if (UI.actual !== 'visuales') UI.elegir('visuales');
};
const alRadio = () => { F.setSource('radio').then(() => showToast('Radio', 'La Fortaleza en vivo')).catch(() => {}); };
let listoLocal = Promise.resolve();
if (!WE) {
UI = crearPestanas({ body, store, alPulsarPlay: () => togglePlay(), alPulsarPrev: () => (usaRemoto() ? RM.anterior() : local && local.anterior()), alPulsarNext: () => (usaRemoto() ? RM.siguiente() : local && local.siguiente()), alPulsarInfo: irAAhoraSuena, alCambiar: aplicarPestana, disponible: id => id !== 'reproductor' || !!(biblioteca && biblioteca.disponible()) });
RM = crearRemotoUI({ seccion: document.getElementById('p-remoto'), store, toast: showToast, alRadio, oyendoLocal: () => F.source === 'local' });
RM.alCambio(() => { paintFranja(); updateMediaSession(); });
F.onChange(() => RM.refrescar());
aplicarPestana(UI.actual);
if (biblioteca && biblioteca.disponible()) {
const reproducir = async (rutas, i, o) => {
try { await F.setSource('local', { iniciar: false }); } catch (e) { showToast('No se pudo reproducir', (e && e.message) || ''); return; }
const ok = await local.reproducirLista(rutas, i, o); if (ok) requestWake();
};
const aleatorio = async rutas => {
try { await F.setSource('local', { iniciar: false }); } catch (e) { showToast('No se pudo reproducir', (e && e.message) || ''); return; }
const ok = await local.reproducirAleatorio(rutas); if (ok) requestWake();
};
RU = crearReproductorUI({
seccion: document.getElementById('p-reproductor'), biblioteca, local, store, toast: showToast, version: 'Radio ' + APP_VERSION,
acciones: {
reproducir, reproducirAleatorio: aleatorio, radio: alRadio, visuales: () => UI.elegir('visuales'), verReproductor: () => { if (UI.actual !== 'reproductor') UI.elegir('reproductor'); },
enCola: async (donde, rutas) => {
if (!local.hayCola) { await reproducir(rutas, 0, { aleatorio: false }); return; }
if (donde === 'sig') local.agregarSiguiente(rutas); else local.agregarAlFinal(rutas);
}
}
});
local.alError(msg => showToast('Reproductor', msg));
local.alCambio(() => {
if (F.source !== 'local') return;
paintPlaying(); paintFranja(); updateMediaSession();
if (!local.sonando && !local.hayCola) releaseWake();
});
listoLocal = biblioteca.iniciar().then(() => local.restaurar()).then(() => { paintFranja(); }).catch(e => console.warn('Biblioteca', e));
}
}
const togglePlay = () => {
if (F.source === 'device') { F.setSource('radio', { iniciar: false }); return; }
if (F.source === 'local') { local.alternar().then(ok => { if (ok) requestWake(); else releaseWake(); }); return; }
if (radio.wanted) { radio.pause(); releaseWake(); }
else { radio.play(); requestWake(); }
paintPlaying();
};
$('play').addEventListener('click', togglePlay);
$('prev').addEventListener('click', () => setViz(index - 1));
$('next').addEventListener('click', () => setViz(index + 1));
$('name').addEventListener('click', () => body.classList.toggle('sheet'));
const de = document.documentElement;
const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
if (!fsEnabled) body.classList.add('nofs');
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFs() {
if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
else {
const req = de.requestFullscreen || de.webkitRequestFullscreen;
if (req) { const r = req.call(de, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); }
}
}
$('fs').addEventListener('click', toggleFs);
const onFs = () => { body.classList.toggle('fs', !!fsEl()); setTimeout(applySize, 120); };
document.addEventListener('fullscreenchange', onFs);
document.addEventListener('webkitfullscreenchange', onFs);
window.addEventListener('keydown', e => {
if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
if (e.key === ' ') { e.preventDefault(); if (body.classList.contains('intro')) start(); else togglePlay(); }
else if (e.key === 'ArrowRight' && !tabOtra) setViz(index + 1);
else if (e.key === 'ArrowLeft' && !tabOtra) setViz(index - 1);
else if (e.key === 'f' || e.key === 'F') toggleFs();
else if (e.key === 'm' || e.key === 'M') body.classList.toggle('menu');
});
let wake = null;
async function requestWake() {
try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch { /* */ }
}
function releaseWake() { try { wake && wake.release(); } catch { /* */ } wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && isPlaying()) requestWake(); });
const sesion = crearSesionMedios({
acciones: {
radio: { play: () => { if (!radio.wanted) togglePlay(); }, pause: () => { if (radio.wanted) togglePlay(); } },
remoto: { play: () => { if (!radio.wanted) togglePlay(); }, pause: () => { if (radio.wanted) togglePlay(); }, previoustrack: () => RM && RM.anterior(), nexttrack: () => RM && RM.siguiente() },
local: local ? {
play: () => { local.reanudar(); }, pause: () => local.pausar(), stop: () => local.pausar(),
previoustrack: () => local.anterior(), nexttrack: () => local.siguiente(),
seekto: d => { if (d && isFinite(d.seekTime)) local.buscar(d.seekTime); },
seekbackward: d => local.saltar(-((d && d.seekOffset) || 10)), seekforward: d => local.saltar((d && d.seekOffset) || 10)
} : {}
}
});
if (params.get('depurar')) window.__rf = { A, F, local, radio, biblioteca };
const updateMediaSession = () => {
if (F.source === 'local' && local && local.pista) {
const p = local.pista;
sesion({ fuente: 'local', reproduciendo: local.sonando, titulo: p.titulo, artista: p.artista, album: p.album, portada: local.portada.grande || local.portada.chica || '', duracion: local.duracion(), posicion: local.tiempo() });
} else if (usaRemoto() && RM.sesion()) {
const r = RM.sesion();
sesion({ fuente: 'remoto', reproduciendo: isPlaying(), titulo: r.titulo, artista: r.artista, album: 'Prometeo', portada: r.portada, portadaTipo: 'image/jpeg' });
} else sesion({ fuente: F.source, reproduciendo: isPlaying(), titulo: F.source === 'device' ? 'Audio del dispositivo' : 'La Fortaleza Radio', artista: F.source === 'device' ? '' : 'En vivo', album: '', portada: '' });
};
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); }, false);
canvas.addEventListener('webglcontextrestored', () => location.reload(), false);
window.addEventListener('resize', applySize);
window.addEventListener('orientationchange', () => setTimeout(applySize, 200));
setViz(index, false);
$('statusText').textContent = STATUS_TXT.ready;
paintFranja();
// Arranque directo: en la APK se espera (máximo 1.5 s) a que se restaure la música local, para reanudarla si era lo último.
if (!WE) Promise.race([listoLocal, new Promise(r => setTimeout(r, 1500))]).then(() => { start(); armarPrimerToque(); });
if (!WE && 'serviceWorker' in navigator && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
const regSw = () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('Sin trabajo sin conexión', e));
if (document.readyState === 'complete') regSw(); else window.addEventListener('load', regSw);
}
let weT = 0, weN = 0, weWas = null, localT = 0;
let last = performance.now() / 1000, T = 0, fAcc = 0, fN = 0, goodWindows = 0, skipAcc = 0;
function frame(ms) {
requestAnimationFrame(frame);
const now = ms / 1000;
let dt = Math.min(0.1, Math.max(0.001, now - last)); last = now;
const q = Q();
// En Wallpaper Engine se respeta el límite de cuadros que el usuario puso en su configuración (Rendimiento).
const fpsCap = Math.min(q.fps, tabOtra ? 30 : 999, (WE && window.__weFps > 0) ? window.__weFps : 999);
if (fpsCap < 60) { skipAcc += dt; if (skipAcc < 1 / (fpsCap + 2)) return; dt = Math.min(0.1, skipAcc); skipAcc = 0; }
T += dt;
if (!input.active) {
input.idle += dt;
input.yaw += input.vyaw * dt; input.pitch = Math.max(-1.1, Math.min(1.1, input.pitch + input.vpitch * dt * 0.3));
input.vyaw *= Math.exp(-dt * 2.5); input.vpitch *= Math.exp(-dt * 4);
if (input.idle > 6) {
input.yaw = Math.atan2(Math.sin(input.yaw), Math.cos(input.yaw));
const k = Math.exp(-dt * 0.7); input.yaw *= k; input.pitch *= k;
}
} else { input.vyaw *= Math.exp(-dt * 10); }
input.strength = input.active ? 1 : input.strength * Math.exp(-dt * 3);
if (settings.auto !== 0 && !tabOtra && !body.classList.contains('intro') && pendingIdx === null && !trans.active) {
autoT += dt;
if (autoT > autoTarget) nextAuto();
}
const intensity = (F.source === 'device' || (F.source === 'local' ? local.sonando : radio.wanted)) ? 1 : 0.45;
A.update(dt, T, weAudio || (F.source === 'device' ? device : F.source === 'local' ? local : radio), WE ? 0.45 : intensity);
if (F.source === 'local' && (localT += dt) > 0.5) { localT = 0; paintFranja(); updateMediaSession(); }
if (A.silent !== silentShown) { silentShown = A.silent; paintStatus(); }
if (WE) {
if (pendingVizProp !== null && current) { setViz(pendingVizProp); pendingVizProp = null; }
weT += dt; weN++;
if (weT > 0.5) {
if (weAudio.active !== weWas) { weWas = weAudio.active; paintStatus(); }
if (body.classList.contains('diag')) $('weDiag').textContent = `Audio de Wallpaper Engine: ${weAudio.active ? 'llega' : 'NO llega'} (${weAudio.count || 0} paquetes)\nGraves ${A.bass.toFixed(2)} · medios ${A.mid.toFixed(2)} · agudos ${A.high.toFixed(2)} · bombos ${A.onsets.kick.count}\n${Math.round(weN / weT)} cuadros por segundo · ${vizList[index].name}`;
weT = 0; weN = 0;
}
}
if (current && !bgFijo) {
try { current.inst.update(dt, T); } catch (e) { console.error(e); current = null; }
}
if (pendingIdx !== null && !bgFijo) doSwitch();
if (!bgFijo) trans.draw(dt);
fAcc += dt; fN++;
if (fAcc > 2.5) {
const avg = fAcc / fN; fAcc = 0; fN = 0;
if (q.adaptive && !tabOtra && !trans.active && !(WE && window.__weFps > 0 && window.__weFps < 50)) {
if (avg > 1 / 38 && quality > 0.5) { quality = Math.max(0.5, quality - 0.15); goodWindows = 0; applySize(); }
else if (avg < 1 / 57 && quality < 1) { if (++goodWindows >= 3) { quality = Math.min(1, quality + 0.1); goodWindows = 0; applySize(); } }
}
}
}
requestAnimationFrame(frame);
}
main();
