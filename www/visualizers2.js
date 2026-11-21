import { NOISE, QUAD_VS, SOFT_POINT_FS, WARP_FS, fit, disposeScene, smooth, applyOrbit, makeFeedback, gauss } from './visualizers.js?v=8';
const HEAD = NOISE + /* glsl */`
uniform vec2 uRes; uniform float uT,uFlow,uBass,uMid,uHigh,uLevel,uBeat; uniform vec2 uSteer; uniform vec3 uTouch; uniform sampler2D uAudio;
float hash1(float n){return fract(sin(n)*43758.5453);}
float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash2(i),hash2(i+vec2(1.0,0.0)),f.x),mix(hash2(i+vec2(0.0,1.0)),hash2(i+vec2(1.0,1.0)),f.x),f.y);}
float fbm2(vec2 p){float f=0.0,a=0.5;for(int i=0;i<5;i++){f+=a*vnoise(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return f;}
float spec(float x){return texture2D(uAudio,vec2(0.02+clamp(x,0.0,1.0)*0.9,0.25)).r;}
`;
function fsShader(THREE, renderer, A, frag, extra = {}) {
const uni = Object.assign({
uRes: { value: new THREE.Vector2() }, uT: { value: 0 }, uFlow: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 },
uHigh: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 }, uSteer: { value: new THREE.Vector2() },
uTouch: { value: new THREE.Vector3() }, uAudio: { value: A.tex }
}, extra);
const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: uni, vertexShader: QUAD_VS, fragmentShader: HEAD + frag, depthTest: false })));
return {
uni,
render(t) {
const I = A.input;
uni.uT.value = t; uni.uFlow.value = A.flow; uni.uBass.value = A.bass; uni.uMid.value = A.mid; uni.uHigh.value = A.high;
uni.uLevel.value = A.level; uni.uBeat.value = A.beat;
uni.uSteer.value.set(Math.sin(I.yaw), I.pitch); uni.uTouch.value.set(I.x, I.y, I.strength);
renderer.render(scene, cam);
},
resize(w, h, pr) { uni.uRes.value.set(w * pr, h * pr); },
dispose() { disposeScene(scene); }
};
}
function makeSky(THREE, { top, hor, glow = 0x000000, radius = 400 }) {
const uni = {
uT: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 }, uGlowK: { value: 1 },
uTop: { value: new THREE.Color(top) }, uHor: { value: new THREE.Color(hor) }, uGlow: { value: new THREE.Color(glow) }
};
const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.ShaderMaterial({
uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
vertexShader: /* glsl */`varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
fragmentShader: /* glsl */`
uniform float uT,uHigh,uBeat,uGlowK; uniform vec3 uTop,uHor,uGlow; varying vec3 vD;
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}
void main(){
vec3 d=normalize(vD);
float h=clamp(d.y,0.0,1.0);
vec3 col=mix(uHor,uTop,pow(h,0.55));
col+=uGlow*exp(-abs(d.y)*10.0)*uGlowK;
float s=h3(floor(d*220.0));
float tw=0.55+0.45*sin(uT*2.5+s*60.0);
col+=vec3(0.9,0.95,1.0)*step(0.9965,s)*smoothstep(0.03,0.3,d.y)*tw*(0.5+uHigh*1.5);
gl_FragColor=vec4(col,1.0);
}`
}));
mesh.frustumCulled = false;
return { mesh, uni, update(t, A, cam) { uni.uT.value = t; uni.uHigh.value = A.high; uni.uBeat.value = A.beat; mesh.position.copy(cam.position); } };
}
function glowTexture(THREE, inner = 'rgba(255,220,150,1)', mid = 'rgba(255,200,120,0.5)', outer = 'rgba(255,140,40,0)') {
const c = document.createElement('canvas'); c.width = c.height = 128;
const g = c.getContext('2d');
const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
gr.addColorStop(0, inner); gr.addColorStop(0.25, mid); gr.addColorStop(1, outer);
g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
return new THREE.CanvasTexture(c);
}
export function buildVisualizers2() {
return [
{ name: 'Julia', maxDpr: 1, create({ THREE, renderer, A, mobile }) {
const IT = mobile ? 72 : 110;
const fs = fsShader(THREE, renderer, A, `#define ITER ${IT}\n` + /* glsl */`
uniform vec2 uC; uniform float uZoom,uRot;
void main(){
vec2 uv=(gl_FragCoord.xy-0.5*uRes)/min(uRes.x,uRes.y);
float a=uRot; uv=mat2(cos(a),-sin(a),sin(a),cos(a))*uv;
vec2 z=uv*uZoom;
float trap=1e9, trap2=1e9, m2=0.0, it=0.0;
for(int i=0;i<ITER;i++){
z=vec2(z.x*z.x-z.y*z.y,2.0*z.x*z.y)+uC;
m2=dot(z,z);
trap=min(trap,abs(sqrt(m2)-0.55-uBass*0.35));
trap2=min(trap2,abs(z.x*z.y));
if(m2>256.0) break;
it+=1.0;
}
vec3 col=vec3(0.02,0.015,0.03);
if(m2>256.0){
float tt=(it-log2(log2(m2))+4.0)/float(ITER);
col=0.5+0.5*cos(6.28318*(tt*3.0-uFlow*0.06+vec3(0.0,0.12,0.25)));
col*=0.2+1.1*pow(clamp(tt,0.0,1.0),0.6);
col*=0.6+0.9*spec(tt*1.5);
}
col+=vec3(1.0,0.62,0.3)*exp(-trap*22.0)*(0.35+uHigh*1.6+uBeat*0.7);
col+=vec3(0.3,0.7,1.0)*exp(-trap2*60.0)*0.3*(0.3+uMid);
col*=smoothstep(1.4,0.3,length(uv));
gl_FragColor=vec4(col,1.0);
}`, { uC: { value: new THREE.Vector2() }, uZoom: { value: 1.5 }, uRot: { value: 0 } });
let ang = 0, zoom = 1.5;
return {
update(dt, t) {
ang += dt * (0.05 + A.level * 0.14 + A.beat * 0.1);
const R = 0.7885 + A.bass * 0.014 + Math.sin(t * 0.07) * 0.01;
fs.uni.uC.value.set(R * Math.cos(ang), R * Math.sin(ang));
zoom += ((1.55 - A.bass * 0.3 - A.beat * 0.12) - zoom) * Math.min(1, dt * 5);
fs.uni.uZoom.value = zoom * Math.exp(-A.input.pitch * 0.6);
fs.uni.uRot.value = t * 0.03 + A.input.yaw;
fs.render(t);
},
resize: fs.resize, dispose: fs.dispose
};
} },
{ name: 'Tinta líquida', maxDpr: 1, create({ THREE, renderer, A }) {
const fs = fsShader(THREE, renderer, A, /* glsl */`
void main(){
vec2 uv=(gl_FragCoord.xy-0.5*uRes)/min(uRes.x,uRes.y);
vec2 p=uv*2.2+uSteer*vec2(0.6,0.4);
float t=uFlow*0.08;
vec2 q=vec2(fbm2(p+vec2(0.0,t)),fbm2(p+vec2(5.2,1.3)-t));
float w=3.0+uBass*3.5+uBeat*1.5;
vec2 r=vec2(fbm2(p+w*q+vec2(1.7,9.2)+t*0.6),fbm2(p+w*q+vec2(8.3,2.8)-t*0.4));
float f=fbm2(p+w*r);
vec3 c1=vec3(0.03,0.09,0.13), c2=vec3(0.77,0.6,0.45), c3=vec3(0.14,0.05,0.22), c4=vec3(0.95,0.86,0.72);
vec3 col=mix(c1,c2,clamp(f*f*3.2,0.0,1.0));
col=mix(col,c3,clamp(length(q)*0.9-0.2,0.0,1.0)*0.8);
col=mix(col,c4,clamp(r.x*r.x*1.6,0.0,1.0)*0.7);
float s=spec(f);
col+=vec3(0.15,0.55,0.6)*s*s*0.7;
float k=uRes.y*0.15;
vec3 n=normalize(vec3(-dFdx(f)*k,-dFdy(f)*k,1.0));
vec3 L=normalize(vec3(0.4,0.6,0.7));
col+=vec3(1.0,0.9,0.8)*pow(max(dot(reflect(-L,n),vec3(0.0,0.0,1.0)),0.0),24.0)*(0.35+uHigh*1.3);
col*=0.55+0.9*f;
col*=smoothstep(1.5,0.4,length(uv));
gl_FragColor=vec4(col,1.0);
}`);
return { update(dt, t) { fs.render(t); }, resize: fs.resize, dispose: fs.dispose };
} },
{ name: 'Ballenas de luz', create({ THREE, renderer, A, mobile }) {
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
const sky = makeSky(THREE, { top: 0x02040c, hor: 0x0b1a33, glow: 0x0a1a2a });
scene.add(sky.mesh);
const RINGS = 6;
const ringC = Array.from({ length: RINGS }, () => new THREE.Vector3(0, -99, 0));
const ringR = new Float32Array(RINGS).fill(99), ringA = new Float32Array(RINGS);
const uniW = { uT: { value: 0 }, uSplash: { value: new THREE.Vector4(0, 0, -99, 0) }, uWhale: { value: new THREE.Vector3() }, uRC: { value: ringC }, uRR: { value: ringR }, uRA: { value: ringA }, uBass: { value: 0 } };
const surface = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShaderMaterial({
uniforms: uniW, transparent: true, depthWrite: false,
vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
fragmentShader: /* glsl */`
uniform float uT,uBass; uniform vec4 uSplash; uniform vec3 uWhale; uniform vec3 uRC[6]; uniform float uRR[6]; uniform float uRA[6]; varying vec3 vW;
void main(){
vec3 col=vec3(0.01,0.025,0.06);
float d=length(vW.xz-uSplash.xy); float age=uT-uSplash.z;
float ring=exp(-pow((d-age*3.2)*1.4,2.0))*exp(-age*0.45)*step(0.0,age)*uSplash.w;
ring+=exp(-pow((d-age*2.1)*1.8,2.0))*exp(-age*0.6)*step(0.0,age)*uSplash.w*0.6;
col+=vec3(0.4,0.9,1.0)*ring*0.7;
for(int i=0;i<6;i++){ float rd=length(vW.xz-uRC[i].xz); col+=vec3(0.1,0.7,0.8)*exp(-pow((rd-uRR[i])*1.3,2.0))*uRA[i]*0.35; }
float wd=length(vW.xz-uWhale.xz);
col+=vec3(0.08,0.45,0.55)*exp(-wd*0.22)*exp(min(uWhale.y,0.0)*0.3)*(0.15+uBass*0.7);
float fade=smoothstep(70.0,30.0,length(vW-cameraPosition));
gl_FragColor=vec4(col,0.62*fade+0.3);
}`
}));
surface.rotation.x = -Math.PI / 2; surface.position.z = -20;
scene.add(surface);
const WN = mobile ? 9000 : 18000;
const wp = new Float32Array(WN * 3), wu = new Float32Array(WN), wr = new Float32Array(WN), wk = new Float32Array(WN);
for (let i = 0; i < WN; i++) {
const kind = Math.random(); let x, y, z, u, part = 0;
if (kind < 0.78) {
u = Math.pow(Math.random(), 0.9);
const prof = 0.85 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.06)), 0.55) * (1 - 0.6 * u) + 0.04;
const th = Math.random() * Math.PI * 2, rr = prof * (0.82 + 0.18 * Math.random());
x = Math.cos(th) * rr; y = Math.sin(th) * rr * 0.78; z = 3 - u * 6;
} else if (kind < 0.9) {
const s = Math.random() < 0.5 ? -1 : 1, k = Math.random();
x = s * (0.55 + k * 1.7); z = 1.2 - k * 1.0 - Math.random() * 0.25 * (1 - k); y = -0.3 - k * 0.35 + (Math.random() - 0.5) * 0.05;
u = 0.3 + k * 0.05; part = 1 + k;
} else {
const s = Math.random() < 0.5 ? -1 : 1, k = Math.random();
x = s * k * 1.5; z = -3.15 - Math.random() * 0.55 * (1 - k * 0.6) + k * 0.25; y = (Math.random() - 0.5) * 0.05;
u = 0.98 + Math.random() * 0.02; part = -1;
}
wp[i * 3] = x; wp[i * 3 + 1] = y; wp[i * 3 + 2] = z; wu[i] = u; wr[i] = Math.random(); wk[i] = part;
}
const wg = new THREE.BufferGeometry();
wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
wg.setAttribute('aU', new THREE.BufferAttribute(wu, 1));
wg.setAttribute('aR', new THREE.BufferAttribute(wr, 1));
wg.setAttribute('aK', new THREE.BufferAttribute(wk, 1));
const uni = {
uT: { value: 0 }, uSwim: { value: 0 }, uFlap: { value: 0.2 }, uFin: { value: 0 }, uHat: { value: 0 }, uHigh: { value: 0 }, uBass: { value: 0 }, uPR: { value: 1 },
uPulse: { value: new THREE.Vector4(9, 9, 9, 9) }, uPulseA: { value: new THREE.Vector4() }, uGlow: { value: 0 },
uAudio: { value: A.tex }, uWhale: { value: new THREE.Vector3() }, uRC: { value: ringC }, uRR: { value: ringR }, uRA: { value: ringA }
};
const whale = new THREE.Points(wg, new THREE.ShaderMaterial({
uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`
attribute float aU,aR,aK; uniform float uT,uSwim,uFlap,uFin,uHat,uHigh,uBass,uPR,uGlow; uniform vec4 uPulse,uPulseA; uniform sampler2D uAudio; varying vec3 vC;
float wave(float age,float amp){ float f=age*1.5; return exp(-pow((aU-f)*7.0,2.0))*amp*step(0.0,age)*smoothstep(1.3,0.6,f); }
void main(){
float s=texture2D(uAudio,vec2(0.03+aU*0.6,0.25)).r;
vec3 p=position;
float body=smoothstep(0.15,1.0,aU);
float amp=(0.08+uFlap*0.22)*body*body;
p.y+=sin(aU*3.0-uSwim)*amp;
if(aK>0.5){ float k=aK-1.0; p.y+=sin(uSwim*0.8+1.0)*k*(0.25+uFin*0.6); }
if(aK<-0.5){ float sl=-0.5*cos(3.0-uSwim)*(0.08+uFlap*0.22); p.y+=sl*(position.z+3.0)*1.3; }
float pw=wave(uPulse.x,uPulseA.x)+wave(uPulse.y,uPulseA.y)+wave(uPulse.z,uPulseA.z)+wave(uPulse.w,uPulseA.w);
p*=1.0+uBass*0.06;
p+=normalize(position+0.001)*(pw*0.12+s*s*0.06);
vec4 wp=modelMatrix*vec4(p,1.0);
vec4 mv=viewMatrix*wp;
gl_Position=projectionMatrix*mv;
float under=step(wp.y,0.0);
float fade=mix(1.15,0.85*exp(wp.y*0.25),under);
float spark=step(1.0-uHat*0.12,fract(aR*91.7+floor(uT*14.0)*0.371))*uHat;
gl_PointSize=(1.1+aR*1.6+pw*3.5+spark*3.0+s*1.2)*uPR*(9.0/-mv.z);
vec3 c=mix(vec3(0.2,0.85,1.0),vec3(0.55,1.0,0.8),aR);
c=mix(c,vec3(1.0,0.9,0.7),clamp(pw,0.0,1.0)*0.5);
vC=(c*(0.07+uGlow*0.25+s*s*0.45+pw*1.6)+vec3(0.8,0.95,1.0)*spark*1.5)*fade;
}`,
fragmentShader: SOFT_POINT_FS
}));
whale.frustumCulled = false; whale.scale.setScalar(1.35);
const whaleG = new THREE.Group(); whaleG.add(whale); scene.add(whaleG);
const PN = mobile ? 9000 : 20000;
const pp = new Float32Array(PN * 3), ps = new Float32Array(PN * 3);
for (let i = 0; i < PN; i++) {
pp[i * 3] = (Math.random() - 0.5) * 50; pp[i * 3 + 1] = -0.3 - Math.random() * 7; pp[i * 3 + 2] = 8 - Math.random() * 45;
ps[i * 3] = Math.random(); ps[i * 3 + 1] = Math.random(); ps[i * 3 + 2] = Math.random();
}
const pg = new THREE.BufferGeometry();
pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
pg.setAttribute('aSeed', new THREE.BufferAttribute(ps, 3));
const plankton = new THREE.Points(pg, new THREE.ShaderMaterial({
uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`
attribute vec3 aSeed; uniform float uT,uHigh,uHat,uPR,uBass; uniform vec3 uWhale; uniform vec3 uRC[6]; uniform float uRR[6]; uniform float uRA[6]; uniform sampler2D uAudio; varying vec3 vC;
void main(){
vec3 p=position;
p.x+=sin(uT*0.2+aSeed.x*30.0)*0.6; p.y+=sin(uT*0.3+aSeed.y*20.0)*0.25; p.z+=cos(uT*0.17+aSeed.z*25.0)*0.6;
float glow=exp(-length(p-uWhale)*0.35);
float wave=0.0;
for(int i=0;i<6;i++){ float d=length(p-uRC[i]); float w=exp(-pow(d-uRR[i],2.0)*0.6)*uRA[i]; wave+=w; p+=normalize(p-uRC[i]+0.001)*w*0.3; }
vec4 mv=modelViewMatrix*vec4(p,1.0);
gl_Position=projectionMatrix*mv;
float s=texture2D(uAudio,vec2(0.25+aSeed.x*0.7,0.25)).r;
float tw=step(1.0-uHat*0.25,fract(aSeed.y*53.1+floor(uT*10.0)*0.29))*uHat;
gl_PointSize=(0.9+aSeed.z*1.4+glow*2.5+wave*3.0+tw*2.5)*uPR*(6.0/-mv.z);
vec3 c=mix(vec3(0.15,0.75,0.65),vec3(0.6,0.9,1.0),clamp(wave,0.0,1.0));
vC=c*(0.05+glow*0.8+s*s*0.35+wave*1.8+tw*1.2)*exp(p.y*0.14);
}`,
fragmentShader: SOFT_POINT_FS
}));
plankton.frustumCulled = false; scene.add(plankton);
const SPN = 500;
const sp = new Float32Array(SPN * 3).fill(-100), sv = new Float32Array(SPN * 3), sl = new Float32Array(SPN);
const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
const splashPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9feaff, size: 0.14, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
splashPts.frustumCulled = false; scene.add(splashPts);
let spi = 0;
const splash = (x, z, t) => {
uniW.uSplash.value.set(x, z, t, 1);
for (let k = 0; k < 260; k++) {
const i = spi = (spi + 1) % SPN;
sp[i * 3] = x + (Math.random() - 0.5) * 2; sp[i * 3 + 1] = 0.1; sp[i * 3 + 2] = z + (Math.random() - 0.5) * 2;
sv[i * 3] = (Math.random() - 0.5) * 5; sv[i * 3 + 1] = 3 + Math.random() * 6; sv[i * 3 + 2] = (Math.random() - 0.5) * 5;
sl[i] = 2 + Math.random();
}
};
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const pathAt = (a, out) => out.set(Math.cos(a) * 5.5 + Math.sin(a * 2) * 0.8, -2.4 + Math.sin(a * 2) * 0.3, -6.5 + Math.sin(a) * 3.2);
const breachY = b => b < 0 ? 0 : 6.2 * Math.sin(Math.PI * (b * b * (3 - 2 * b)));
let ang = 0, speed = 0.15, breach = -1, lastBreach = null, ri = 0, pi = 0, lastPulse = -9, f = 1, swim = 0, flap = 0.2, fin = 0, glow = 0;
const cur = new THREE.Vector3(), a1 = new THREE.Vector3(), a2 = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(1, 0, 0), upv = new THREE.Vector3();
const WY = new THREE.Vector3(0, 1, 0), r2 = new THREE.Vector3(), m = new THREE.Matrix4(), qT = new THREE.Quaternion();
let wasUnder = true, first = true;
const target = new THREE.Vector3(0, -0.8, -5.5);
const pulse = new THREE.Vector4(9, 9, 9, 9), pulseA = new THREE.Vector4();
return {
update(dt, t) {
uni.uT.value = t; uniW.uT.value = t;
uni.uHigh.value = A.high; uni.uBass.value = A.bass; uniW.uBass.value = A.bass;
uni.uHat.value += (A.hat - uni.uHat.value) * ease(dt, 0.05);
speed += ((0.1 + A.energy * 0.12 + A.level * 0.08) * (breach >= 0 ? 1.4 : 1) - speed) * ease(dt, 1.5);
ang += dt * speed;
if (A.kick > 0.99 || (A.beat > 0.99 && t - lastPulse > 0.25)) {
if (t - lastPulse > 0.12) {
lastPulse = t; pi = (pi + 1) % 4;
pulse.setComponent(pi, 0); pulseA.setComponent(pi, 0.6 + A.bass * 0.6);
ri = (ri + 1) % RINGS; ringC[ri].copy(cur); ringR[ri] = 0; ringA[ri] = 0.5 + A.bass * 0.7;
flap = Math.min(1, flap + 0.45);
}
}
for (let k = 0; k < 4; k++) pulse.setComponent(k, pulse.getComponent(k) + dt);
for (let k = 0; k < RINGS; k++) { ringR[k] += dt * 8; ringA[k] *= Math.exp(-dt * 0.9); }
uni.uPulse.value.copy(pulse); uni.uPulseA.value.copy(pulseA);
flap += (0.2 + A.level * 0.25 - flap) * ease(dt, 0.6);
fin += (A.snare - fin) * ease(dt, 0.08);
glow += (A.level * 0.6 + A.mid * 0.4 - glow) * ease(dt, 0.5);
swim += dt * (1.6 + speed * 8 + flap * 2.5);
uni.uSwim.value = swim; uni.uFlap.value = flap; uni.uFin.value = fin; uni.uGlow.value = glow;
if (lastBreach === null) lastBreach = t - 8;
if (breach < 0 && t - lastBreach > 20 && (A.drop > 0.9 || (A.build > 0.6 && A.kick > 0.9) || t - lastBreach > 70)) { breach = 0; lastBreach = t; }
if (breach >= 0) { breach += dt / 6; if (breach >= 1) breach = -1; }
pathAt(ang, cur); cur.y += breachY(breach);
const bd = 0.05 / (6 * Math.max(0.05, speed));
pathAt(ang + 0.05, a1); a1.y += breachY(breach >= 0 ? Math.min(1, breach + bd) : -1);
pathAt(ang - 0.05, a2); a2.y += breachY(breach >= 0 ? Math.max(0, breach - bd) : -1);
fwd.subVectors(a1, a2).normalize();
r2.crossVectors(WY, fwd);
if (r2.lengthSq() > 0.02) right.lerp(r2.normalize(), ease(dt, 0.3)).normalize();
upv.crossVectors(fwd, right).normalize();
right.crossVectors(upv, fwd).normalize();
m.makeBasis(right, upv, fwd);
qT.setFromRotationMatrix(m);
if (first) { whaleG.quaternion.copy(qT); first = false; } else whaleG.quaternion.slerp(qT, ease(dt, 0.18));
whaleG.position.copy(cur);
const under = cur.y < 0;
if (under !== wasUnder) splash(cur.x, cur.z, t);
wasUnder = under;
uni.uWhale.value.copy(cur); uniW.uWhale.value.copy(cur);
uniW.uSplash.value.w *= Math.exp(-dt * 0.15);
for (let i = 0; i < SPN; i++) {
if (sl[i] <= 0) continue;
sl[i] -= dt; sv[i * 3 + 1] -= 9.8 * dt;
sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
if (sl[i] <= 0 || sp[i * 3 + 1] < -0.5) { sl[i] = 0; sp[i * 3 + 1] = -100; }
}
sg.attributes.position.needsUpdate = true;
cam.position.set(Math.sin(t * 0.05) * 2, 2.8 + A.bass * 0.12, 7.5 * f);
applyOrbit(THREE, cam, target, A.input);
sky.update(t, A, cam);
renderer.render(scene, cam);
},
resize(w, h, pr) { cam.aspect = w / h; f = fit(cam.aspect, 0.9); cam.updateProjectionMatrix(); uni.uPR.value = pr; },
dispose() { disposeScene(scene); }
};
} },
{ name: 'Flujo', create({ THREE, renderer, A, mobile }) {
const S = mobile ? 128 : 256, COUNT = S * S;
const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
let pa = new THREE.WebGLRenderTarget(S, S, opts), pb = new THREE.WebGLRenderTarget(S, S, opts);
const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simU = { uPos: { value: null }, uT: { value: 0 }, uDt: { value: 0.016 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 }, uLevel: { value: 0 }, uInit: { value: 1 } };
const simScene = new THREE.Scene();
simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
uniforms: simU, vertexShader: QUAD_VS, depthTest: false, depthWrite: false,
fragmentShader: NOISE + /* glsl */`
uniform sampler2D uPos; uniform float uT,uDt,uBass,uMid,uHigh,uBeat,uLevel,uInit; varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 spawn(vec2 uv){
float a=h(uv+uT)*6.28318, b=acos(2.0*h(uv*1.7+uT*0.3)-1.0);
float r=0.3+0.35*h(uv*3.1+uT);
return vec3(sin(b)*cos(a),cos(b),sin(b)*sin(a))*r;
}
vec3 field(vec3 p,float t){
return vec3(snoise(p+vec3(0.0,t,0.0)),snoise(p+vec3(31.3,-t,7.7)),snoise(p+vec3(-11.9,4.2,t)));
}
void main(){
vec4 s=texture2D(uPos,vUv);
if(uInit>0.5){ gl_FragColor=vec4(spawn(vUv*7.3),h(vUv)); return; }
vec3 p=s.xyz; float life=s.w;
float t=uT*0.12;
vec3 v1=field(p*1.1,t), v2=field(p*1.9+vec3(5.0),t*1.3);
vec3 vel=cross(v1,v2)*1.5+v1*0.4;
vel+=vec3(-p.z,0.0,p.x)*(0.3+uMid*1.6);
vel-=p*(0.35*length(p));
vel+=normalize(p+0.0001)*uBeat*3.0;
float speed=0.25+uLevel*1.4+uBass*0.8;
p+=vel*uDt*speed;
life-=uDt*(0.15+uHigh*0.4);
if(life<0.0){ p=spawn(vUv); life=0.6+h(vUv+uT)*0.8; }
gl_FragColor=vec4(p,life);
}`
})));
const step = () => {
simU.uPos.value = pa.texture;
renderer.setRenderTarget(pb); renderer.render(simScene, qcam); renderer.setRenderTarget(null);
const t = pa; pa = pb; pb = t;
};
step(); simU.uInit.value = 0;
const g = new THREE.BufferGeometry();
const ref = new Float32Array(COUNT * 2);
for (let i = 0; i < COUNT; i++) { ref[i * 2] = (i % S + 0.5) / S; ref[i * 2 + 1] = (Math.floor(i / S) + 0.5) / S; }
g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
g.setAttribute('aRef', new THREE.BufferAttribute(ref, 2));
const drawU = { uPos: { value: null }, uPR: { value: 1 }, uAudio: { value: A.tex }, uT: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 } };
const pts = new THREE.Points(g, new THREE.ShaderMaterial({
uniforms: drawU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`
attribute vec2 aRef; uniform sampler2D uPos,uAudio; uniform float uPR,uT,uHigh,uBeat; varying vec3 vC;
void main(){
vec4 s=texture2D(uPos,aRef);
vec4 mv=modelViewMatrix*vec4(s.xyz,1.0);
gl_Position=projectionMatrix*mv;
float r=length(s.xyz);
float sp=texture2D(uAudio,vec2(0.02+clamp(r*0.55,0.0,1.0)*0.85,0.25)).r;
float fade=smoothstep(0.0,0.25,s.w);
gl_PointSize=(1.0+sp*2.5+uBeat)*uPR*(3.0/-mv.z);
vec3 c=0.5+0.5*cos(6.28318*(r*0.7+uT*0.03+vec3(0.0,0.15,0.3)));
vC=c*(0.1+sp*0.6+uHigh*0.2)*fade;
}`,
fragmentShader: SOFT_POINT_FS
}));
pts.frustumCulled = false;
const scene = new THREE.Scene(); scene.add(pts);
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
const fb = makeFeedback(THREE, renderer, WARP_FS, { uT: { value: 0 }, uZoom: { value: 1.0 }, uRot: { value: 0.0 }, uWarp: { value: 0.0 }, uMid: { value: 0 }, uDecay: { value: 0.9 }, uHue: { value: 0.0 } }, mobile ? 640 : 1000);
const target = new THREE.Vector3();
let f = 1;
return {
update(dt, t) {
simU.uT.value = t; simU.uDt.value = Math.min(dt, 0.05);
simU.uBass.value = A.bass; simU.uMid.value = A.mid; simU.uHigh.value = A.high; simU.uBeat.value = A.beat; simU.uLevel.value = A.level;
step();
drawU.uPos.value = pa.texture; drawU.uT.value = t; drawU.uHigh.value = A.high; drawU.uBeat.value = A.beat;
cam.position.set(Math.sin(t * 0.07) * 0.6, 0.4 + Math.sin(t * 0.05) * 0.3, 3.0 * f * (1 - A.beat * 0.04));
applyOrbit(THREE, cam, target, A.input);
const w = fb.warp; w.uT.value = t; w.uDecay.value = 0.86 + A.level * 0.09; w.uZoom.value = 1.0 - A.beat * 0.012;
fb.render(scene, cam);
},
resize(w, h, pr) { cam.aspect = w / h; f = fit(cam.aspect, 0.9); cam.updateProjectionMatrix(); drawU.uPR.value = pr; fb.setSize(w, h, pr); },
dispose() { disposeScene(scene); disposeScene(simScene); pa.dispose(); pb.dispose(); fb.dispose(); }
};
} },
{ name: 'Velocidad', create({ THREE, renderer, A, mobile }) {
const scene = new THREE.Scene();
const FOGC = new THREE.Color(0x1a0a33);
scene.fog = new THREE.FogExp2(FOGC, 0.0045);
const cam = new THREE.PerspectiveCamera(72, 1, 0.1, 1600);
scene.add(cam);
const sky = makeSky(THREE, { top: 0x04020c, hor: 0x2a0f4a, glow: 0xff2f8a, radius: 900 });
scene.add(sky.mesh);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const SEG = 6, NP = mobile ? 110 : 140, SUB = 3, W = 3.4, START = 26;
const pts = [];
const gen = { p: new THREE.Vector3(0, 25, 0), yaw: 0, pitch: 0, bank: 0, curv: 0, loop: -1, g: 0, wantLoop: false };
const ctl = { mid: 0.5, bass: 0.5, energy: 0.5 };
const tmpE = new THREE.Euler(), tmpQ = new THREE.Quaternion(), F = new THREE.Vector3(), Rv = new THREE.Vector3(), Uv = new THREE.Vector3();
const onPoint = [];
const genPoint = () => {
const g = gen.g++;
if (gen.loop < 0) {
const ct = 0.032 * (Math.sin(g * 0.031) + 0.7 * Math.sin(g * 0.017 + 1.3)) + (ctl.mid - 0.5) * 0.06;
gen.curv += (ct - gen.curv) * 0.12;
gen.yaw += gen.curv;
const pt = Math.max(-0.28, Math.min(0.28, (ctl.bass - 0.5) * 0.3 + Math.sin(g * 0.045) * 0.12 - (gen.p.y - 25) * 0.006));
gen.pitch += (pt - gen.pitch) * 0.1;
gen.bank += (Math.max(-0.65, Math.min(0.65, -gen.curv * 10)) - gen.bank) * 0.15;
if (gen.wantLoop && Math.abs(gen.pitch) < 0.05) { gen.loop = 0; gen.wantLoop = false; }
}
let la = 0;
if (gen.loop >= 0) {
gen.bank *= 0.8; gen.pitch *= 0.8;
const k = gen.loop; la = Math.PI * 2 * k * k * k * (k * (k * 6 - 15) + 10);
gen.loop += 1 / 26; if (gen.loop > 1) gen.loop = -1;
}
tmpE.set(gen.pitch + la, gen.yaw, gen.bank, 'YXZ');
const q = new THREE.Quaternion().setFromEuler(tmpE);
F.set(0, 0, -1).applyQuaternion(q);
gen.p.addScaledVector(F, SEG);
if (la > 0) { Rv.set(1, 0, 0).applyQuaternion(tmpQ.setFromEuler(tmpE.set(0, gen.yaw, 0, 'YXZ'))); gen.p.addScaledVector(Rv, 0.42); }
const pt = { p: gen.p.clone(), q, g };
for (const fn of onPoint) fn(pt);
return pt;
};
const cp = (a, b, c, d, f, o) => {
const f2 = f * f, f3 = f2 * f;
return o.set(
0.5 * (2 * b.x + (-a.x + c.x) * f + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * f2 + (-a.x + 3 * b.x - 3 * c.x + d.x) * f3),
0.5 * (2 * b.y + (-a.y + c.y) * f + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * f2 + (-a.y + 3 * b.y - 3 * c.y + d.y) * f3),
0.5 * (2 * b.z + (-a.z + c.z) * f + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * f2 + (-a.z + 3 * b.z - 3 * c.z + d.z) * f3));
};
const at = (u, o, oq) => {
const n = pts.length;
u = Math.max(0, Math.min(n - 1.001, u));
const i = Math.floor(u), f = u - i;
const a = pts[Math.max(0, i - 1)].p, b = pts[i].p, c = pts[Math.min(n - 1, i + 1)].p, d = pts[Math.min(n - 1, i + 2)].p;
cp(a, b, c, d, f, o);
if (oq) oq.slerpQuaternions(pts[i].q, pts[Math.min(n - 1, i + 1)].q, f);
};
const R = (NP - 1) * SUB + 1;
const rp = new Float32Array(R * 2 * 3), rv = new Float32Array(R * 2 * 2), ridx = [];
const ep = new Float32Array(R * 4 * 3), es = new Float32Array(R * 4), eidx = [];
for (let r = 0; r < R; r++) {
rv.set([0, 0, 1, 0], r * 4);
if (r < R - 1) {
const a = r * 2; ridx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
const e = r * 4; eidx.push(e, e + 4, e + 1, e + 1, e + 4, e + 5, e + 2, e + 6, e + 3, e + 3, e + 6, e + 7);
}
}
const rg = new THREE.BufferGeometry();
rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(rv, 2)); rg.setIndex(ridx);
const eg = new THREE.BufferGeometry();
eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('aS', new THREE.BufferAttribute(es, 1)); eg.setIndex(eidx);
const fogU = { uFogC: { value: FOGC }, uFogD: { value: 0.0045 } };
const FOG_GLSL = /* glsl */`uniform vec3 uFogC; uniform float uFogD; vec3 fogit(vec3 c,float d){ float f=1.0-exp(-pow(uFogD*d,2.0)); return mix(c,uFogC,clamp(f,0.0,1.0)); }`;
const roadU = Object.assign({ uT: { value: 0 }, uKickAge: { value: 9 }, uKick: { value: 0 }, uHue: { value: 0 }, uHigh: { value: 0 } }, fogU);
const road = new THREE.Mesh(rg, new THREE.ShaderMaterial({
uniforms: roadU, side: THREE.DoubleSide,
vertexShader: /* glsl */`varying vec2 vUv; varying float vD; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
fragmentShader: FOG_GLSL + /* glsl */`
uniform float uT,uKickAge,uKick,uHue,uHigh; varying vec2 vUv; varying float vD;
void main(){
float x=vUv.x, v=vUv.y;
vec3 col=vec3(0.035,0.03,0.06)+vec3(0.02)*fract(sin(dot(floor(vec2(x*40.0,v*30.0)),vec2(12.9,78.2)))*437.5);
vec3 neon=0.5+0.5*cos(6.28318*(uHue+vec3(0.0,0.33,0.67)));
col+=vec3(0.9,0.9,0.85)*step(abs(x-0.5),0.012)*step(0.5,fract(v*0.5))*0.6;
col+=neon*smoothstep(0.06,0.0,min(x,1.0-x))*(0.8+uKick*1.5);
float wave=exp(-pow((vD-uKickAge*140.0)*0.08,2.0))*exp(-uKickAge*1.2);
col+=neon*wave*0.6;
col+=vec3(0.6,0.3,1.0)*0.15*uHigh*step(0.97,fract(v*2.0+x*0.3));
gl_FragColor=vec4(fogit(col,vD),1.0);
}`
}));
road.frustumCulled = false; scene.add(road);
const edgeU = Object.assign({ uS: { value: 0 }, uAudio: { value: A.tex }, uT: { value: 0 }, uKick: { value: 0 } }, fogU);
const edges = new THREE.Mesh(eg, new THREE.ShaderMaterial({
uniforms: edgeU, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`attribute float aS; varying float vS; varying float vD; void main(){ vS=aS; vec4 mv=modelViewMatrix*vec4(position,1.0); vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
fragmentShader: /* glsl */`
uniform float uS,uT,uKick; uniform sampler2D uAudio; varying float vS; varying float vD;
void main(){
float rel=max(0.0,vS-uS);
float band=texture2D(uAudio,vec2(0.02+fract(rel*0.02)*0.85,0.25)).r;
float pulse=step(0.5,fract(vS*0.5-uT*3.0));
vec3 c=0.5+0.5*cos(6.28318*(vS*0.01+uT*0.05+vec3(0.0,0.33,0.67)));
float k=(0.2+band*band*1.8+uKick*0.8)*(0.6+0.4*pulse);
gl_FragColor=vec4(c*k*exp(-vD*0.004),1.0);
}`
}));
edges.frustumCulled = false; scene.add(edges);
const BN = mobile ? 220 : 420;
const bGeo = new THREE.BoxGeometry(1, 1, 1);
const bBand = new Float32Array(BN), bSeed = new Float32Array(BN);
for (let i = 0; i < BN; i++) { bBand[i] = Math.random(); bSeed[i] = Math.random(); }
bGeo.setAttribute('aBand', new THREE.InstancedBufferAttribute(bBand, 1));
bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(bSeed, 1));
const bU = Object.assign({ uAudio: { value: A.tex }, uT: { value: 0 }, uKick: { value: 0 }, uHue: { value: 0 } }, fogU);
const bMesh = new THREE.InstancedMesh(bGeo, new THREE.ShaderMaterial({
uniforms: bU,
vertexShader: /* glsl */`
attribute float aBand,aSeed; uniform sampler2D uAudio; uniform float uKick; varying vec3 vW; varying vec3 vN; varying float vD,vTop,vS,vLvl;
void main(){
vS=aSeed; vLvl=texture2D(uAudio,vec2(0.04+aBand*0.85,0.25)).r;
float st=1.0+vLvl*vLvl*0.45+uKick*0.07*(0.5+aSeed);
vec3 pos=position; pos.y=-0.5+(position.y+0.5)*st;
vec4 w=modelMatrix*instanceMatrix*vec4(pos,1.0);
vW=w.xyz; vN=normalize(mat3(instanceMatrix)*normal);
vTop=(modelMatrix*instanceMatrix*vec4(0.0,-0.5+st,0.0,1.0)).y;
vec4 mv=viewMatrix*w; vD=-mv.z; gl_Position=projectionMatrix*mv;
}`,
fragmentShader: FOG_GLSL + /* glsl */`
uniform float uT,uKick,uHue; varying vec3 vW; varying vec3 vN; varying float vD,vTop,vS,vLvl;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
vec3 col=vec3(0.02,0.015,0.04);
if(abs(vN.y)<0.5){
float fc=abs(vN.x)>abs(vN.z)?vW.z:vW.x;
vec2 cell=vec2(floor(fc/2.4),floor(vW.y/3.2));
vec2 fr=vec2(fract(fc/2.4),fract(vW.y/3.2));
float win=step(0.18,fr.x)*step(fr.x,0.82)*step(0.25,fr.y)*step(fr.y,0.75);
float lit=step(0.58-vLvl*0.35,h(cell+vS*91.0));
vec3 wc=mix(vec3(1.0,0.75,0.4),mix(vec3(0.3,0.9,1.0),vec3(1.0,0.3,0.8),step(0.5,vS)),step(0.35,h(cell*1.7+vS)));
col+=wc*win*lit*(0.25+vLvl*vLvl*1.6);
vec3 neon=0.5+0.5*cos(6.28318*(uHue+vS*0.5+vec3(0.0,0.33,0.67)));
col+=neon*smoothstep(1.4,0.0,vTop-vW.y)*(0.6+uKick*1.6+vLvl);
}
gl_FragColor=vec4(fogit(col,vD*0.7),1.0);
}`
}), BN);
bMesh.frustumCulled = false; bMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const m4 = new THREE.Matrix4(), sv = new THREE.Vector3(), qI = new THREE.Quaternion();
m4.makeScale(0.001, 0.001, 0.001); m4.setPosition(0, -999, 0);
for (let i = 0; i < BN; i++) bMesh.setMatrixAt(i, m4);
scene.add(bMesh);
let bi = 0;
const GROUND = -90;
onPoint.push(pt => {
if (pt.g % 2) return;
const qy = tmpQ.setFromEuler(tmpE.set(0, gen.yaw, 0, 'YXZ'));
Rv.set(1, 0, 0).applyQuaternion(qy);
for (const side of [-1, 1]) {
if (Math.random() < 0.25) continue;
const wdt = 8 + Math.random() * 16, dep = 8 + Math.random() * 16;
const off = side * (26 + wdt * 0.5 + Math.random() * 70);
const hgt = 70 + Math.random() * 190 * (Math.random() < 0.2 ? 1.6 : 1);
sv.copy(pt.p).addScaledVector(Rv, off);
qI.copy(qy);
m4.compose(sv.set(sv.x, GROUND + hgt / 2, sv.z), qI, new THREE.Vector3(wdt, hgt, dep));
bMesh.setMatrixAt(bi, m4); bBand[bi] = Math.random(); bi = (bi + 1) % BN;
}
bMesh.instanceMatrix.needsUpdate = true; bGeo.attributes.aBand.needsUpdate = true;
});
const groundU = Object.assign({ uT: { value: 0 }, uKick: { value: 0 }, uHue: { value: 0 } }, fogU);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShaderMaterial({
uniforms: groundU,
vertexShader: /* glsl */`varying vec3 vW; varying float vD; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vec4 mv=viewMatrix*w; vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
fragmentShader: FOG_GLSL + /* glsl */`
uniform float uT,uKick,uHue; varying vec3 vW; varying float vD;
void main(){
vec2 g=abs(fract(vW.xz/40.0)-0.5);
float line=smoothstep(0.02,0.0,min(g.x,g.y));
vec3 neon=0.5+0.5*cos(6.28318*(uHue+0.6+vec3(0.0,0.33,0.67)));
vec3 col=vec3(0.01,0.005,0.02)+neon*line*(0.25+uKick*0.5);
gl_FragColor=vec4(fogit(col,vD*0.6),1.0);
}`
}));
ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND; scene.add(ground);
const GN = 28;
const gate = new THREE.InstancedMesh(new THREE.TorusGeometry(4.6, 0.11, 6, 48, Math.PI), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), GN);
gate.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const gates = Array.from({ length: GN }, () => ({ p: new THREE.Vector3(0, -999, 0), q: new THREE.Quaternion(), band: Math.random(), g: -1 }));
let gi = 0;
onPoint.push(pt => { if (pt.g % 7) return; const gd = gates[gi]; gd.p.copy(pt.p); gd.q.copy(pt.q); gd.band = (pt.g * 0.137) % 1; gd.g = pt.g; gi = (gi + 1) % GN; });
gate.frustumCulled = false; scene.add(gate);
const gcol = new THREE.Color();
const SN = mobile ? 120 : 240;
const sPos = new Float32Array(SN * 6), sz = new Float32Array(SN), sxy = new Float32Array(SN * 2);
for (let i = 0; i < SN; i++) { const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 9; sxy[i * 2] = Math.cos(a) * r; sxy[i * 2 + 1] = Math.sin(a) * r; sz[i] = -Math.random() * 80; }
const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
const streaks = new THREE.LineSegments(sgeo, new THREE.LineBasicMaterial({ color: 0xffd6f5, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
streaks.frustumCulled = false; cam.add(streaks);
for (let i = 0; i < NP; i++) pts.push(genPoint());
let base = 0;
const P = new THREE.Vector3(), Q = new THREE.Quaternion(), L = new THREE.Vector3(), Rr = new THREE.Vector3();
const rebuild = () => {
for (let r = 0; r < R; r++) {
const u = r / SUB;
at(u, P, Q);
Rv.set(1, 0, 0).applyQuaternion(Q); Uv.set(0, 1, 0).applyQuaternion(Q);
L.copy(P).addScaledVector(Rv, -W); Rr.copy(P).addScaledVector(Rv, W);
rp[r * 6] = L.x; rp[r * 6 + 1] = L.y; rp[r * 6 + 2] = L.z; rp[r * 6 + 3] = Rr.x; rp[r * 6 + 4] = Rr.y; rp[r * 6 + 5] = Rr.z;
const gv = (pts[0].g + u) * SEG / 12;
rv[r * 4 + 1] = gv; rv[r * 4 + 3] = gv;
ep[r * 12] = L.x; ep[r * 12 + 1] = L.y; ep[r * 12 + 2] = L.z;
ep[r * 12 + 3] = L.x + Uv.x * 0.4; ep[r * 12 + 4] = L.y + Uv.y * 0.4; ep[r * 12 + 5] = L.z + Uv.z * 0.4;
ep[r * 12 + 6] = Rr.x; ep[r * 12 + 7] = Rr.y; ep[r * 12 + 8] = Rr.z;
ep[r * 12 + 9] = Rr.x + Uv.x * 0.4; ep[r * 12 + 10] = Rr.y + Uv.y * 0.4; ep[r * 12 + 11] = Rr.z + Uv.z * 0.4;
const s = pts[0].g + u; es[r * 4] = es[r * 4 + 1] = es[r * 4 + 2] = es[r * 4 + 3] = s;
}
rg.attributes.position.needsUpdate = true; rg.attributes.uv.needsUpdate = true;
eg.attributes.position.needsUpdate = true; eg.attributes.aS.needsUpdate = true;
rg.computeBoundingSphere(); eg.computeBoundingSphere();
};
rebuild();
let u = START, speed = 40, fovK = 0, baseFov = 72, kickAge = 9, hue = 0.85, lastLoop = 0, first = true;
const camP = new THREE.Vector3(), camQ = new THREE.Quaternion(), look = new THREE.Vector3(), lq = new THREE.Quaternion(), mL = new THREE.Matrix4(), up = new THREE.Vector3();
return {
update(dt, t) {
ctl.mid += (A.mid - ctl.mid) * ease(dt, 2.5); ctl.bass += (A.bass - ctl.bass) * ease(dt, 2.5); ctl.energy += (A.energy - ctl.energy) * ease(dt, 2);
if (A.drop > 0.95 && t - lastLoop > 25 && gen.loop < 0) { gen.wantLoop = true; lastLoop = t; }
speed += ((34 + ctl.energy * 30 + A.level * 18) - speed) * ease(dt, 1.2);
u += speed * dt / SEG;
let moved = false;
while (u > START + 1) { pts.shift(); pts.push(genPoint()); u -= 1; moved = true; }
if (moved) rebuild();
at(u, camP, camQ);
Uv.set(0, 1, 0).applyQuaternion(camQ); Rv.set(1, 0, 0).applyQuaternion(camQ);
camP.addScaledVector(Uv, 1.35);
at(u + 2.6, look); at(u + 2.6, L, lq); up.set(0, 1, 0).applyQuaternion(lq);
look.addScaledVector(up, 1.0);
const I = A.input;
look.addScaledVector(Rv, Math.sin(I.yaw) * 9).addScaledVector(Uv, I.pitch * 6);
mL.lookAt(camP, look, Uv);
lq.setFromRotationMatrix(mL);
cam.position.copy(camP);
if (first) { cam.quaternion.copy(lq); first = false; } else cam.quaternion.slerp(lq, ease(dt, 0.07));
fovK += ((speed - 34) / 48 * 10 + A.build * 6 - fovK) * ease(dt, 0.6);
cam.fov = baseFov + fovK; cam.updateProjectionMatrix();
if (A.kick > 0.99) kickAge = 0; kickAge += dt;
hue += dt * (0.01 + A.energy * 0.02);
const kick = A.kick;
roadU.uT.value = t; roadU.uKickAge.value = kickAge; roadU.uKick.value = kick; roadU.uHue.value = hue; roadU.uHigh.value = A.high;
edgeU.uS.value = pts[0].g + u; edgeU.uT.value = t; edgeU.uKick.value = kick;
bU.uT.value = t; bU.uKick.value = kick; bU.uHue.value = hue;
groundU.uT.value = t; groundU.uKick.value = kick; groundU.uHue.value = hue;
ground.position.x = camP.x; ground.position.z = camP.z;
const Ls = 0.5 + speed * 0.05;
for (let i = 0; i < SN; i++) {
sz[i] += speed * dt * 1.1; if (sz[i] > 0) sz[i] -= 80;
const x = sxy[i * 2], y = sxy[i * 2 + 1];
sPos.set([x, y, sz[i], x, y, sz[i] - Ls], i * 6);
}
sgeo.attributes.position.needsUpdate = true;
streaks.material.opacity = 0.12 + ctl.energy * 0.35 + A.hat * 0.25;
for (let i = 0; i < GN; i++) {
const gd = gates[i], v = A.spec[Math.floor((0.02 + gd.band * 0.85) * 255)];
const sc = 1 + v * 0.25 + kick * 0.12;
m4.compose(gd.p, gd.q, sv.set(sc, sc, sc)); gate.setMatrixAt(i, m4);
gcol.setHSL((hue + gd.band * 0.5) % 1, 0.95, 0.15 + v * v * 0.55 + kick * 0.15);
gate.setColorAt(i, gcol);
}
gate.instanceMatrix.needsUpdate = true; if (gate.instanceColor) gate.instanceColor.needsUpdate = true;
sky.uni.uGlowK.value = 0.6 + ctl.bass * 1.0 + kick * 0.5;
sky.update(t, A, cam);
renderer.render(scene, cam);
},
resize(w, h) { cam.aspect = w / h; baseFov = w < h ? 92 : 72; cam.updateProjectionMatrix(); },
dispose() { disposeScene(scene); }
};
} },
{ name: 'Reacción', create({ THREE, renderer, A, mobile }) {
const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping };
let ra = null, rb = null, GW = 2, GH = 2;
const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const simU = { uState: { value: null }, uTexel: { value: new THREE.Vector2() }, uFeed: { value: 0.0545 }, uKill: { value: 0.062 }, uSplat: { value: new THREE.Vector4() }, uInit: { value: 1 }, uSeed: { value: 0 }, uAspect: { value: 1 } };
const simScene = new THREE.Scene();
simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
uniforms: simU, vertexShader: QUAD_VS, depthTest: false, depthWrite: false,
fragmentShader: /* glsl */`
uniform sampler2D uState; uniform vec2 uTexel; uniform float uFeed,uKill,uInit,uSeed,uAspect; uniform vec4 uSplat; varying vec2 vUv;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
if(uInit>0.5){
vec2 gp=vUv*vec2(18.0*uAspect,18.0);
float b=step(0.9,h(floor(gp)+uSeed))*step(length(fract(gp)-0.5),0.35);
gl_FragColor=vec4(1.0,b,0.0,1.0); return;
}
vec2 c=texture2D(uState,vUv).xy;
vec2 lap=-c;
lap+=0.2*(texture2D(uState,vUv+vec2(uTexel.x,0.0)).xy+texture2D(uState,vUv-vec2(uTexel.x,0.0)).xy+texture2D(uState,vUv+vec2(0.0,uTexel.y)).xy+texture2D(uState,vUv-vec2(0.0,uTexel.y)).xy);
lap+=0.05*(texture2D(uState,vUv+uTexel).xy+texture2D(uState,vUv-uTexel).xy+texture2D(uState,vUv+vec2(uTexel.x,-uTexel.y)).xy+texture2D(uState,vUv+vec2(-uTexel.x,uTexel.y)).xy);
float a=c.x,b=c.y,abb=a*b*b;
a+=1.0*lap.x-abb+uFeed*(1.0-a);
b+=0.5*lap.y+abb-(uKill+uFeed)*b;
vec2 d=(vUv-uSplat.xy)*vec2(uAspect,1.0);
if(uSplat.w>0.0&&length(d)<uSplat.z) b=0.9;
gl_FragColor=vec4(clamp(a,0.0,1.0),clamp(b,0.0,1.0),0.0,1.0);
}`
})));
const dispU = { uState: { value: null }, uTexel: { value: new THREE.Vector2() }, uT: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 }, uAudio: { value: A.tex } };
const dispScene = new THREE.Scene();
dispScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
uniforms: dispU, vertexShader: QUAD_VS, depthTest: false,
fragmentShader: /* glsl */`
uniform sampler2D uState,uAudio; uniform vec2 uTexel; uniform float uT,uMid,uHigh,uBeat; varying vec2 vUv;
void main(){
float b=texture2D(uState,vUv).y;
float bx=texture2D(uState,vUv+vec2(uTexel.x,0.0)).y-texture2D(uState,vUv-vec2(uTexel.x,0.0)).y;
float by=texture2D(uState,vUv+vec2(0.0,uTexel.y)).y-texture2D(uState,vUv-vec2(0.0,uTexel.y)).y;
vec3 n=normalize(vec3(-bx*7.0,-by*7.0,1.0));
vec3 L=normalize(vec3(-0.5,0.6,0.7));
float l=max(dot(n,L),0.0);
float sp=pow(max(dot(reflect(-L,n),vec3(0.0,0.0,1.0)),0.0),30.0);
float s=texture2D(uAudio,vec2(0.02+clamp(b*1.6,0.0,1.0)*0.85,0.25)).r;
vec3 base=mix(vec3(0.05,0.04,0.06),vec3(0.66,0.5,0.38),smoothstep(0.08,0.32,b));
vec3 hue=0.5+0.5*cos(6.28318*(b*1.6+uT*0.03+vec3(0.0,0.2,0.4)));
base=mix(base,hue,0.3+uMid*0.4);
vec3 col=base*(0.3+0.9*l)+vec3(1.0,0.95,0.85)*sp*(0.4+uHigh*1.2);
col+=vec3(1.0,0.55,0.2)*smoothstep(0.25,0.45,b)*(uBeat*0.5+s*s*0.4);
col*=smoothstep(0.95,0.3,length(vUv-0.5));
gl_FragColor=vec4(col,1.0);
}`
})));
const presets = [[0.0545, 0.062], [0.039, 0.058], [0.029, 0.057], [0.0367, 0.0649], [0.025, 0.06]];
let lastSplat = 0;
const steps = mobile ? 7 : 12;
const init = () => {
simU.uInit.value = 1; simU.uSeed.value = Math.random() * 100;
simU.uState.value = ra.texture; renderer.setRenderTarget(rb); renderer.render(simScene, qcam);
renderer.setRenderTarget(null); const tmp = ra; ra = rb; rb = tmp; simU.uInit.value = 0;
};
return {
update(dt, t) {
const ph = (A.flow * 0.012) % presets.length, i0 = Math.floor(ph), i1 = (i0 + 1) % presets.length, k = smooth(0.35, 0.65, ph - i0);
simU.uFeed.value = presets[i0][0] + (presets[i1][0] - presets[i0][0]) * k + A.bass * 0.004;
simU.uKill.value = presets[i0][1] + (presets[i1][1] - presets[i0][1]) * k;
const I = A.input;
for (let n = 0; n < steps; n++) {
simU.uSplat.value.w = 0;
if (n === 0) {
if (I.active) simU.uSplat.value.set(I.x * 0.5 + 0.5, I.y * 0.5 + 0.5, 0.025, 1);
else if (A.kick > 0.99 && t - lastSplat > 0.45) { lastSplat = t; simU.uSplat.value.set(Math.random(), Math.random(), 0.02 + A.bass * 0.04, 1); }
}
simU.uState.value = ra.texture; renderer.setRenderTarget(rb); renderer.render(simScene, qcam);
const tmp = ra; ra = rb; rb = tmp;
}
renderer.setRenderTarget(null);
dispU.uState.value = ra.texture; dispU.uT.value = t; dispU.uMid.value = A.mid; dispU.uHigh.value = A.high; dispU.uBeat.value = A.beat;
renderer.render(dispScene, qcam);
},
resize(w, h) {
const cap = mobile ? 300 : 520;
const sc = Math.min(1, cap / Math.max(w, h));
GW = Math.max(16, Math.round(w * sc)); GH = Math.max(16, Math.round(h * sc));
if (ra) { ra.dispose(); rb.dispose(); }
ra = new THREE.WebGLRenderTarget(GW, GH, opts); rb = new THREE.WebGLRenderTarget(GW, GH, opts);
simU.uTexel.value.set(1 / GW, 1 / GH); dispU.uTexel.value.set(1 / GW, 1 / GH); simU.uAspect.value = GW / GH;
init();
},
dispose() { disposeScene(simScene); disposeScene(dispScene); if (ra) { ra.dispose(); rb.dispose(); } }
};
} },
{ name: 'Planetitas', create({ THREE, renderer, A, mobile }) {
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 900);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const bgU = { uT: { value: 0 }, uLevel: { value: 0 }, uHat: { value: 0 }, uHue: { value: 0 } };
const bg = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
uniforms: bgU, side: THREE.BackSide, depthWrite: false,
vertexShader: /* glsl */`varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
fragmentShader: NOISE + /* glsl */`
uniform float uT,uLevel,uHat,uHue; varying vec3 vD;
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}
void main(){
vec3 d=normalize(vD);
float n=snoise(d*1.4+vec3(uT*0.004)), n2=snoise(d*3.4-vec3(uT*0.006));
vec3 a=0.5+0.5*cos(6.28318*(uHue+vec3(0.0,0.33,0.67)));
vec3 col=vec3(0.004,0.005,0.014);
col+=mix(vec3(0.18,0.04,0.2),a*0.16,0.5)*smoothstep(0.1,0.9,n)*(0.3+uLevel*0.3);
col+=vec3(0.03,0.09,0.2)*smoothstep(0.2,0.95,n2)*(0.3+uLevel*0.2);
vec3 g=floor(d*300.0); float s=h3(g);
vec3 f=fract(d*300.0)-0.5;
float star=step(0.993,s)*smoothstep(0.35,0.0,length(f));
col+=vec3(0.85,0.9,1.0)*star*(0.3+0.25*sin(uT*2.0+s*90.0)+uHat*0.6*step(0.998,s));
gl_FragColor=vec4(col,1.0);
}`
}));
scene.add(bg);
// El Sol viaja hacia +x; las órbitas quedan como hélices detrás de él.
const world = new THREE.Group(); scene.add(world);
const D = new THREE.Vector3(1, 0, 0);
const tilt = 0.95;
const n = new THREE.Vector3(Math.cos(tilt), Math.sin(tilt), 0);
const e1 = new THREE.Vector3(0, 0, 1), e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
const sunU = { uT: { value: 0 }, uB: { value: 0 }, uK: { value: 0 } };
const sun = new THREE.Mesh(new THREE.SphereGeometry(0.62, 64, 32), new THREE.ShaderMaterial({
uniforms: sunU,
vertexShader: /* glsl */`varying vec3 vN; varying vec3 vWN; varying vec3 vWP; void main(){ vN=normal; vWN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vWP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
fragmentShader: NOISE + /* glsl */`
uniform float uT,uB,uK; varying vec3 vN; varying vec3 vWN; varying vec3 vWP;
void main(){
float g=snoise(vN*4.0+vec3(uT*0.2))*0.5+snoise(vN*9.0-vec3(uT*0.35))*0.25;
vec3 V=normalize(cameraPosition-vWP);
float limb=pow(max(dot(vWN,V),0.0),0.45);
vec3 col=mix(vec3(1.0,0.4,0.1),vec3(1.0,0.93,0.72),limb*0.8+g*0.3);
gl_FragColor=vec4(col*(0.95+uB*0.5+uK*0.6),1.0);
}`
}));
world.add(sun);
const halo1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 'rgba(255,230,180,1)', 'rgba(255,160,80,0.45)', 'rgba(255,110,40,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 'rgba(255,190,140,0.55)', 'rgba(220,90,160,0.16)', 'rgba(120,60,160,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
world.add(halo1, halo2);
// Superficies: 0 rocoso, 1 Tierra, 2 gigante gaseoso (bandas que fluyen), 3 Venus (nubes espesas).
const PLANET_FS = NOISE + /* glsl */`
uniform vec3 uC1,uC2,uC3,uRim; uniform float uT,uSeed,uLvl,uBands,uType,uFlow,uSpot; varying vec3 vN; varying vec3 vWN; varying vec3 vWP;
float fbm(vec3 p){ return snoise(p)*0.55+snoise(p*2.1+3.1)*0.28+snoise(p*4.3-1.7)*0.14; }
void main(){
vec3 q=vN; vec3 base;
if(uType>1.5){
float lat=q.y;
vec3 w=vec3(fbm(q*1.6+vec3(uSeed,uFlow*0.6,0.0)),fbm(q*1.6+vec3(0.0,uSeed,uFlow*0.5)),0.0);
float shear=sin(lat*uBands*0.5)*uFlow;
vec3 r=vec3(q.x*cos(shear)-q.z*sin(shear),lat,q.x*sin(shear)+q.z*cos(shear));
float b=sin(lat*uBands+w.x*2.6+fbm(r*3.0+uSeed)*1.4);
base=mix(uC1,uC2,smoothstep(-0.8,0.8,b));
base=mix(base,uC3,smoothstep(0.25,0.9,fbm(r*5.0+vec3(uFlow*0.8,0.0,uSeed)))*0.45);
if(uType>2.5) base=mix(base,uC3,0.35+0.25*fbm(r*2.0+uFlow));
float spot=exp(-pow(length(vec2(atan(r.z,r.x)-uSeed,(lat+0.32)*3.0))*3.2,2.0));
base=mix(base,uC3*0.55+vec3(0.25,0.05,0.0)*step(0.5,uSpot),spot*uSpot);
} else if(uType>0.5){
float land=smoothstep(0.08,0.2,fbm(q*2.2+uSeed));
base=mix(uC1,uC2,land);
float cl=smoothstep(0.1,0.55,fbm(q*3.0+vec3(uT*0.03,0.0,uSeed)));
base=mix(base,vec3(0.95),cl*0.7);
base=mix(base,vec3(0.92,0.95,1.0),smoothstep(0.82,0.9,abs(q.y)));
} else {
float h=fbm(q*3.0+uSeed);
float cr=smoothstep(0.55,0.62,fbm(q*7.0+uSeed*2.0))*0.4;
base=mix(uC1,uC2,smoothstep(-0.5,0.6,h))*(1.0-cr);
}
vec3 L=normalize(-vWP);
float nl=dot(vWN,L);
float day=smoothstep(-0.15,0.6,nl);
vec3 V=normalize(cameraPosition-vWP);
float fres=pow(1.0-max(dot(vWN,V),0.0),2.2);
vec3 col=base*(0.04+1.1*day)*(1.0+uLvl*0.5);
col+=uRim*fres*(0.3+uLvl*2.0)*(uType>1.5?1.4:1.0);
gl_FragColor=vec4(col,1.0);
}`;
const PLANET_VS = /* glsl */`varying vec3 vN; varying vec3 vWN; varying vec3 vWP; void main(){ vN=normal; vWN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vWP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
// Capa de gas alrededor de los gigantes: una neblina que respira con su banda.
const GAS_FS = NOISE + /* glsl */`
uniform vec3 uRim; uniform float uLvl,uFlow; varying vec3 vN; varying vec3 vWN; varying vec3 vWP;
void main(){
vec3 V=normalize(cameraPosition-vWP);
float f=1.0-abs(dot(vWN,V));
float n=snoise(vN*3.0+vec3(0.0,uFlow*0.7,0.0))*0.5+0.5;
float a=pow(f,1.6)*(0.35+0.65*n)*(0.35+uLvl*0.9);
gl_FragColor=vec4(uRim*a,1.0);
}`;
// Periodo real en años; en pantalla se usa su raíz para que se note la diferencia sin que Neptuno se quede quieto.
const defs = [
{ name: 'Mercurio', r: 1.35, yr: 0.241, size: 0.11, band: 'air', hue: 0.78, type: 0, c: [0x9a948c, 0x5a5550, 0xb0aaa0] },
{ name: 'Venus', r: 1.95, yr: 0.615, size: 0.19, band: 'pres', hue: 0.12, type: 3, c: [0xe8cf96, 0xc9a66a, 0xf5e6c0], bands: 5 },
{ name: 'Tierra', r: 2.6, yr: 1.0, size: 0.2, band: 'mids', hue: 0.56, type: 1, c: [0x1d4f9a, 0x3f7d3a, 0xffffff] },
{ name: 'Marte', r: 3.3, yr: 1.88, size: 0.15, band: 'body', hue: 0.01, type: 0, c: [0xc1502e, 0x7a2e1c, 0xd98a5a] },
{ name: 'Júpiter', r: 4.7, yr: 11.86, size: 0.66, band: 'sub', hue: 0.07, type: 2, c: [0xd9b48a, 0x9a6440, 0xf2e2c8], bands: 15, spot: 1 },
{ name: 'Saturno', r: 6.0, yr: 29.46, size: 0.54, band: 'kick', hue: 0.14, type: 2, c: [0xe6cf9a, 0xb39560, 0xf6ead0], bands: 12, ring: [1.4, 2.4, 0xf0dcb0] },
{ name: 'Urano', r: 7.2, yr: 84.0, size: 0.33, band: 'body', hue: 0.49, type: 2, c: [0x9fe3e6, 0x7cc6d6, 0xc9f4f2], bands: 4, axis: 1.71, ring: [1.7, 1.85, 0xa8e8f0] },
{ name: 'Neptuno', r: 8.3, yr: 164.8, size: 0.32, band: 'sub', hue: 0.63, type: 2, c: [0x2f5fd0, 0x1d3a8a, 0x8fb2ff], bands: 7, spot: 0.6 }
];
const BASE_P = 6.0;
const RATE = 40, M = 800;
const ROWS = defs.length + 1;
const posData = new Float32Array(M * ROWS * 4), audData = new Float32Array(M * ROWS * 4);
const posTex = new THREE.DataTexture(posData, M, ROWS, THREE.RGBAFormat, THREE.FloatType);
const audTex = new THREE.DataTexture(audData, M, ROWS, THREE.RGBAFormat, THREE.FloatType);
for (const t of [posTex, audTex]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; }
// Estela como cinta continua: cada muestra tiene dos vértices y se ensancha en pantalla.
const tIdx = new Float32Array(M * 2), tSide = new Float32Array(M * 2), tPos = new Float32Array(M * 6);
for (let i = 0; i < M; i++) { tIdx[i * 2] = tIdx[i * 2 + 1] = i; tSide[i * 2] = -1; tSide[i * 2 + 1] = 1; }
const tri = [];
for (let i = 0; i < M; i++) { const j = (i + 1) % M, a = i * 2, b = i * 2 + 1, c = j * 2, d = j * 2 + 1; tri.push(a, c, b, b, c, d); }
const tGeo = new THREE.BufferGeometry();
tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
tGeo.setAttribute('aIdx', new THREE.BufferAttribute(tIdx, 1));
tGeo.setAttribute('aSide', new THREE.BufferAttribute(tSide, 1));
tGeo.setIndex(tri);
const TRAIL_VS = /* glsl */`
attribute float aIdx; attribute float aSide;
uniform sampler2D uPos,uAud; uniform float uRow,uS,uHead,uM,uPR,uW,uKick; uniform vec3 uD; uniform vec2 uRes;
varying float vSide; varying float vAge; varying vec4 vAudio;
vec3 at(int i){ vec4 t=texelFetch(uPos,ivec2(i,int(uRow)),0); return t.xyz-(uS-t.w)*uD; }
void main(){
int i=int(aIdx); int MM=int(uM); int hd=int(uHead); int old=(hd+1)%MM;
int j=(i+MM-1)%MM; if(i==old) j=i;
int k=(i+1)%MM; if(k==old) k=i;
vec3 p=at(i);
vec4 cp=projectionMatrix*modelViewMatrix*vec4(p,1.0);
vec4 ca=projectionMatrix*modelViewMatrix*vec4(at(k),1.0);
vec4 cb=projectionMatrix*modelViewMatrix*vec4(at(j),1.0);
vec2 sa=ca.xy/ca.w*uRes, sb=cb.xy/cb.w*uRes;
vec2 dir=sb-sa; float l=length(dir); dir=l>1e-4?dir/l:vec2(1.0,0.0);
vec2 nrm=vec2(-dir.y,dir.x);
float age=mod(uHead-aIdx+uM,uM)/uM;
vAge=age; vAudio=texelFetch(uAud,ivec2(i,int(uRow)),0);
float w=uW*(1.0+vAudio.x*1.6+vAudio.y*uKick)*(1.0-age*0.55);
w*=smoothstep(0.0,2.5/uM,age)*step(age,1.0-1.5/uM);
cp.xy+=nrm*aSide*w*uPR/uRes*cp.w;
vSide=aSide;
gl_Position=cp;
}`;
const TRAIL_FS = /* glsl */`
uniform vec3 uCol; uniform float uGain,uWarm;
varying float vSide; varying float vAge; varying vec4 vAudio;
vec3 hs(vec3 c,float h){ const vec3 k=vec3(0.57735); float co=cos(h*6.28318); return c*co+cross(k,c)*sin(h*6.28318)+k*dot(k,c)*(1.0-co); }
void main(){
float d=abs(vSide);
float core=exp(-d*d*9.0), glow=exp(-d*d*2.2)*0.35;
float fade=pow(1.0-vAge,1.4);
vec3 c=hs(uCol,vAudio.z*0.12-vAge*0.1);
c=mix(c,vec3(1.0,0.8,0.55),uWarm);
c=mix(c,vec3(1.0),vAudio.y*0.5*core);
float b=(0.35+vAudio.x*0.9+vAudio.y*1.1)*uGain;
gl_FragColor=vec4(c*(core+glow)*b*fade,1.0);
}`;
let S = 0, head = 0;
const trails = [];
function makeTrail(row, col, w, kick, gain, warm) {
const u = { uPos: { value: posTex }, uAud: { value: audTex }, uRow: { value: row }, uS: { value: 0 }, uHead: { value: 0 }, uM: { value: M }, uPR: { value: 1 }, uW: { value: w }, uKick: { value: kick }, uD: { value: D }, uRes: { value: new THREE.Vector2(1, 1) }, uCol: { value: col }, uGain: { value: gain }, uWarm: { value: warm } };
const mesh = new THREE.Mesh(tGeo, new THREE.ShaderMaterial({ uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS }));
mesh.frustumCulled = false; world.add(mesh); trails.push(u);
return u;
}
const write = (row, i, x, y, z, s, a, b, c) => { const o = (row * M + i) * 4; posData[o] = x; posData[o + 1] = y; posData[o + 2] = z; posData[o + 3] = s; audData[o] = a; audData[o + 1] = b; audData[o + 2] = c; };
const planets = defs.map((d, i) => {
const rim = new THREE.Color().setHSL(d.hue, 0.9, 0.62);
const u = { uC1: { value: new THREE.Color(d.c[0]) }, uC2: { value: new THREE.Color(d.c[1]) }, uC3: { value: new THREE.Color(d.c[2]) }, uRim: { value: rim }, uT: { value: 0 }, uSeed: { value: i * 7.3 + 1.1 }, uLvl: { value: 0 }, uBands: { value: d.bands || 8 }, uType: { value: d.type }, uFlow: { value: 0 }, uSpot: { value: d.spot || 0 } };
const seg = d.size > 0.3 ? (mobile ? 48 : 72) : (mobile ? 28 : 40);
const mesh = new THREE.Mesh(new THREE.SphereGeometry(d.size, seg, seg / 2), new THREE.ShaderMaterial({ uniforms: u, vertexShader: PLANET_VS, fragmentShader: PLANET_FS }));
const g = new THREE.Group(); g.add(mesh);
const spin = new THREE.Group(); spin.rotation.z = d.axis || (i % 2 ? -0.3 : 0.3); spin.add(mesh); g.add(spin);
let gasU = null;
if (d.type >= 2) {
gasU = { uRim: { value: rim }, uLvl: { value: 0 }, uFlow: { value: 0 } };
const shell = new THREE.Mesh(new THREE.SphereGeometry(d.size * 1.16, 48, 24), new THREE.ShaderMaterial({ uniforms: gasU, vertexShader: PLANET_VS, fragmentShader: GAS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
spin.add(shell);
}
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'), color: rim, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.3 }));
g.add(glow);
let ringU = null;
if (d.ring) {
ringU = { uIn: { value: d.size * d.ring[0] }, uOut: { value: d.size * d.ring[1] }, uLvl: { value: 0 }, uC: { value: new THREE.Color(d.ring[2]) } };
const ring = new THREE.Mesh(new THREE.RingGeometry(d.size * d.ring[0], d.size * d.ring[1], 128, 1), new THREE.ShaderMaterial({
uniforms: ringU, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
fragmentShader: /* glsl */`uniform float uIn,uOut,uLvl; uniform vec3 uC; varying vec3 vP;
void main(){ float r=(length(vP.xy)-uIn)/(uOut-uIn); float b=0.55+0.45*sin(r*42.0)*sin(r*13.0+1.3); float a=smoothstep(0.0,0.06,r)*smoothstep(1.0,0.8,r)*b*0.5;
gl_FragColor=vec4(uC*a*(0.6+uLvl*1.4),1.0); }`
}));
ring.rotation.x = Math.PI / 2 - (d.axis ? 0 : 0.45); spin.add(ring);
}
world.add(g);
const col = new THREE.Color().setHSL(d.hue, 1.0, 0.56);
const trail = makeTrail(i, col, 1.4 + d.size * 3.0, 0.45, d.type >= 2 ? 0.9 : 1.1, 0);
return { d, g, spin, mesh, u, gasU, glow, ringU, trail, col, ph: Math.random() * Math.PI * 2, w: Math.PI * 2 / (BASE_P * Math.sqrt(d.yr)), lvl: 0, flow: Math.random() * 10 };
});
const SUN_ROW = defs.length;
const sunTrail = makeTrail(SUN_ROW, new THREE.Color(1, 0.75, 0.45), 2.2, 0.4, 0.55, 0.85);
// Polvo que pasa de largo: da la sensación de viaje.
const DN = mobile ? 1500 : 3500, box = 60;
const dpos = new Float32Array(DN * 3), dsd = new Float32Array(DN);
for (let i = 0; i < DN; i++) { dpos.set([(Math.random() - 0.5) * box, (Math.random() - 0.5) * box * 0.6, (Math.random() - 0.5) * box * 0.6], i * 3); dsd[i] = Math.random(); }
const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dg.setAttribute('aS', new THREE.BufferAttribute(dsd, 1));
const dustU = { uS: { value: 0 }, uPR: { value: 1 }, uT: { value: 0 }, uHat: { value: 0 }, uBox: { value: box } };
const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`attribute float aS; uniform float uS,uPR,uT,uHat,uBox; varying vec3 vC;
void main(){ vec3 p=position; p.x=mod(p.x-uS*0.6+uBox*0.5,uBox)-uBox*0.5-4.0;
vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
float tw=step(1.0-uHat*0.3,fract(aS*91.7+floor(uT*12.0)*0.37))*uHat;
gl_PointSize=(1.2+aS*1.4+tw*3.0)*uPR*(14.0/-mv.z);
float edge=smoothstep(uBox*0.5,uBox*0.35,abs(p.x+4.0));
vC=mix(vec3(0.6,0.7,1.0),vec3(1.0,0.85,0.95),aS)*(0.07+tw*1.0)*edge; }`,
fragmentShader: /* glsl */`varying vec3 vC; void main(){ vec2 d=gl_PointCoord-0.5; float q=dot(d,d)*4.0; float a=exp(-q*3.0); gl_FragColor=vec4(vC*a,a); }`
}));
dust.frustumCulled = false; world.add(dust);
const waveU = { uKA: { value: 9 }, uAmp: { value: 0 } };
const wave = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.ShaderMaterial({
uniforms: waveU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
vertexShader: /* glsl */`varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
fragmentShader: /* glsl */`uniform float uKA,uAmp; varying vec2 vP;
void main(){ float r=length(vP); float R=1.0+uKA*12.0; float w=exp(-pow((r-R)*2.0,2.0))*exp(-uKA*1.6)*uAmp; gl_FragColor=vec4(vec3(1.0,0.75,0.55)*w*0.25,1.0); }`
}));
wave.lookAt(n); world.add(wave);
const orb = (r, ph, out) => out.copy(e1).multiplyScalar(Math.cos(ph) * r).addScaledVector(e2, Math.sin(ph) * r);
const tmp = new THREE.Vector3();
let drift = 0.75, speed = 0.85, kickAge = 9, flare = 0, hue = 0, acc = 0;
// Historia inicial en calma, para que las hélices ya estén dibujadas desde el primer cuadro.
{
const st = 1 / RATE;
for (const p of planets) p.ph -= p.w * speed * st * M;
for (let i = 0; i < M; i++) {
S += drift * st;
planets.forEach((p, r) => { p.ph += st * p.w * speed; orb(p.d.r, p.ph, tmp); write(r, i, tmp.x, tmp.y, tmp.z, S, 0.15, 0, 0); });
write(SUN_ROW, i, 0, 0, 0, S, 0.2, 0, 0);
}
head = M - 1; posTex.needsUpdate = audTex.needsUpdate = true;
}
const target = new THREE.Vector3(), base = new THREE.Vector3();
let dist = 30;
return {
update(dt, t) {
bgU.uT.value = t; bgU.uLevel.value = A.level; bgU.uHat.value = A.hat;
if (A.kick > 0.99) kickAge = 0; kickAge += dt;
const kenv = Math.exp(-kickAge * 7);
flare += (A.drop * 1.5 + Math.exp(-kickAge * 5) * 0.7 - flare) * ease(dt, 0.12);
hue += dt * (0.003 + A.energy * 0.006) + A.drop * dt * 0.05; bgU.uHue.value = hue;
sunU.uT.value = t; sunU.uB.value = A.bass; sunU.uK.value = flare;
halo1.scale.setScalar(2.6 + A.bass * 1.1 + flare * 1.5);
halo2.scale.setScalar(10 + A.level * 3.5 + flare * 3.5);
halo1.material.opacity = 0.9; halo2.material.opacity = 0.38 + A.level * 0.3;
speed += ((0.7 + A.energy * 0.35 + A.level * 0.2 + A.drop * 0.3) - speed) * ease(dt, 1.5);
drift += ((0.6 + A.level * 0.35 + A.energy * 0.3 + A.drop * 0.6) - drift) * ease(dt, 1.5);
for (const p of planets) {
const tg = A.band[p.d.band] || 0;
p.lvl += (tg - p.lvl) * ease(dt, tg > p.lvl ? 0.04 : 0.22);
}
// Muestras de la estela a ritmo fijo; cada una guarda el audio de ese instante.
acc += dt; let steps = 0;
const st = 1 / RATE;
while (acc >= st && steps < 8) {
acc -= st; steps++;
S += drift * st; head = (head + 1) % M;
planets.forEach((p, r) => {
p.ph += st * p.w * speed;
orb(p.d.r, p.ph, tmp);
write(r, head, tmp.x, tmp.y, tmp.z, S, p.lvl, kenv, A.mid * 0.6 + A.high * 0.6);
});
write(SUN_ROW, head, 0, 0, 0, S, A.bass * 0.5, kenv * 0.6, A.mid);
}
if (acc > st) acc = 0;
if (S > 4000) { for (let q = 3; q < posData.length; q += 4) posData[q] -= 4000; S -= 4000; }
if (steps) posTex.needsUpdate = audTex.needsUpdate = true;
for (const u of trails) { u.uS.value = S; u.uHead.value = head; }
const sub = acc / st;
planets.forEach((p, i) => {
p.trail.uCol.value.copy(p.col).offsetHSL(Math.sin(hue * 6.28 + i) * 0.035, 0, 0);
orb(p.d.r, p.ph + sub * st * p.w * speed, tmp);
p.g.position.copy(tmp);
p.flow += dt * (0.08 + p.lvl * 0.4);
p.mesh.rotation.y += dt * (0.15 + p.lvl * 0.5);
p.mesh.scale.setScalar(1 + p.lvl * p.lvl * 0.25 + kenv * 0.06);
p.u.uT.value = t; p.u.uLvl.value = p.lvl; p.u.uFlow.value = p.flow;
if (p.gasU) { p.gasU.uLvl.value = p.lvl; p.gasU.uFlow.value = p.flow; }
p.glow.material.opacity = 0.18 + p.lvl * 0.6;
p.glow.scale.setScalar(p.d.size * (4 + p.lvl * 3.5 + kenv * 1.5));
if (p.ringU) p.ringU.uLvl.value = p.lvl;
});
dustU.uS.value = S; dustU.uT.value = t; dustU.uHat.value += (A.hat - dustU.uHat.value) * ease(dt, 0.05);
waveU.uKA.value = kickAge; waveU.uAmp.value = 0.5 + A.bass * 0.8;
// Cámara centrada en el Sol, un poco de lado para que las hélices se vean salir de él.
base.set(-1.2, 0, 0);
const az = 0.5 + Math.sin(t * 0.03) * 0.25, el = 0.38 + Math.sin(t * 0.045) * 0.08;
cam.position.set(base.x + Math.sin(az) * Math.cos(el) * dist, base.y + Math.sin(el) * dist, base.z + Math.cos(az) * Math.cos(el) * dist);
world.updateMatrixWorld(); world.localToWorld(cam.position); world.localToWorld(target.copy(base));
applyOrbit(THREE, cam, target, A.input);
bg.position.copy(cam.position);
renderer.render(scene, cam);
},
resize(w, h, pr) {
cam.aspect = w / h;
world.rotation.z = cam.aspect < 0.85 ? Math.PI / 2 : 0;
dist = cam.aspect < 0.85 ? 34 : 24 * fit(cam.aspect, 1.3);
cam.updateProjectionMatrix();
const sz = renderer.getDrawingBufferSize(new THREE.Vector2()); if (!sz.x) sz.set(w * pr, h * pr);
for (const u of trails) { u.uPR.value = pr; u.uRes.value.set(sz.x * 0.5, sz.y * 0.5); }
dustU.uPR.value = pr;
},
dispose() { scene.traverse(o => { if (o.isSprite && o.material.map) o.material.map.dispose(); }); posTex.dispose(); audTex.dispose(); disposeScene(scene); }
};
} },
{ name: 'Espiral', maxDpr: 1.25, create({ THREE, renderer, A }) {
const fs = fsShader(THREE, renderer, A, /* glsl */`
uniform float uArms;
void main(){
vec2 uv=(gl_FragCoord.xy-0.5*uRes)/min(uRes.x,uRes.y);
uv+=uSteer*vec2(0.15,0.1);
float r=length(uv)+1e-4, a=atan(uv.y,uv.x);
float lr=log(r);
float z=uFlow*0.9;
float s1=sin((lr*2.2+z)*6.28318+a*uArms);
float s2=sin((lr*2.2+z*0.7)*6.28318-a*(uArms+1.0)+uT*0.3);
float w=0.12+spec(fract(lr*0.35-z*0.1))*0.6;
float b1=smoothstep(-w,w,s1), b2=smoothstep(-w,w,s2);
float m=abs(b1-b2);
vec3 dark=vec3(0.04,0.03,0.03), light=vec3(0.93,0.86,0.74);
vec3 hue=0.5+0.5*cos(6.28318*(uT*0.02+lr*0.15+vec3(0.0,0.33,0.67)));
vec3 col=mix(dark,mix(light,hue,0.3+0.4*uMid),m);
col+=hue*smoothstep(0.03,0.0,0.5-abs(fract(lr*1.5-z*1.3)-0.5))*(0.2+uBass*1.2);
col=mix(col,vec3(1.0,0.9,0.75),exp(-r*(14.0-uBass*8.0))*(0.6+uBeat));
col*=smoothstep(1.6,0.25,r);
gl_FragColor=vec4(col,1.0);
}`, { uArms: { value: 6 } });
const armsList = [3, 5, 6, 8, 4, 7];
let ai = 2, lastChange = 0, arms = 6;
return {
update(dt, t) {
if (A.beat > 0.95 && t - lastChange > 9) { lastChange = t; ai = (ai + 1) % armsList.length; }
arms += (armsList[ai] - arms) * Math.min(1, dt * 1.5);
fs.uni.uArms.value = Math.round(arms);
fs.render(t);
},
resize: fs.resize, dispose: fs.dispose
};
} },
{ name: 'Armonógrafo', create({ THREE, renderer, A, mobile }) {
const fb = makeFeedback(THREE, renderer, WARP_FS, { uT: { value: 0 }, uZoom: { value: 0.998 }, uRot: { value: 0.002 }, uWarp: { value: 0.1 }, uMid: { value: 0 }, uDecay: { value: 0.97 }, uHue: { value: 0.003 } }, mobile ? 700 : 1100);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
const group = new THREE.Group(); scene.add(group);
const N = mobile ? 600 : 1000;
const ratios = [[2, 3, 5], [3, 4, 7], [1, 2, 3]];
const pens = ratios.map((rt) => {
const g = new THREE.BufferGeometry(); const P = new Float32Array(N * 3);
g.setAttribute('position', new THREE.BufferAttribute(P, 3));
const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const line = new THREE.Line(g, m); line.frustumCulled = false; group.add(line);
return { P, g, m, f: [rt[0], rt[1], rt[2], rt[0] + 0.01, rt[1] - 0.007, rt[2] + 0.004], ph: Array.from({ length: 6 }, () => Math.random() * 6.28) };
});
const target = new THREE.Vector3();
let T0 = 0, f = 1;
return {
update(dt, t) {
T0 += dt * (0.3 + A.level * 1.4 + A.beat * 0.8);
const a1 = 0.9 + A.bass * 0.6, a2 = 0.4 + A.mid * 0.8, a3 = 0.45 + A.high * 0.9;
pens.forEach((p, k) => {
p.f[3] += dt * 0.0013 * (k + 1); p.f[4] -= dt * 0.0009 * (k + 1);
for (let i = 0; i < N; i++) {
const tau = T0 * 2 + k * 1.7 - 6 * (1 - i / N);
p.P[i * 3] = Math.sin(p.f[0] * tau + p.ph[0]) * a1 * 0.6 + Math.sin(p.f[3] * tau + p.ph[3]) * a2 * 0.5;
p.P[i * 3 + 1] = Math.sin(p.f[1] * tau + p.ph[1]) * a1 * 0.6 + Math.sin(p.f[4] * tau + p.ph[4]) * a2 * 0.5;
p.P[i * 3 + 2] = Math.sin(p.f[2] * tau + p.ph[2]) * a3 * 0.6;
}
p.g.attributes.position.needsUpdate = true;
p.m.color.setHSL((k * 0.33 + t * 0.02) % 1, 0.8, 0.5 + A.beat * 0.25);
p.m.opacity = 0.3 + A.level * 0.7;
});
group.rotation.y += dt * (0.15 + A.mid * 0.5); group.rotation.x = Math.sin(t * 0.1) * 0.5;
const w = fb.warp; w.uT.value = t; w.uMid.value = A.mid; w.uDecay.value = 0.955 + A.level * 0.03;
w.uZoom.value = 0.997 - A.beat * 0.008; w.uRot.value = 0.002 + A.input.vyaw * 0.02;
cam.position.set(0, 0, 4.2 * f);
applyOrbit(THREE, cam, target, A.input);
fb.render(scene, cam);
},
resize(w, h, pr) { cam.aspect = w / h; f = fit(cam.aspect, 0.9); cam.updateProjectionMatrix(); fb.setSize(w, h, pr); },
dispose() { disposeScene(scene); fb.dispose(); }
};
} },
{ name: 'Hipercubo', create({ THREE, renderer, A, mobile }) {
const fb = makeFeedback(THREE, renderer, WARP_FS, { uT: { value: 0 }, uZoom: { value: 0.995 }, uRot: { value: 0.0 }, uWarp: { value: 0.2 }, uMid: { value: 0 }, uDecay: { value: 0.88 }, uHue: { value: 0.01 } }, mobile ? 700 : 1100);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
const V = []; for (let i = 0; i < 16; i++) V.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
const E = []; for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) E.push([i, j]); }
const SH = 3, SEG = mobile ? 16 : 28;
const lp = new Float32Array(SH * E.length * 2 * 3), lc = new Float32Array(SH * E.length * 2 * 3);
const pp = new Float32Array(SH * E.length * SEG * 3), pc = new Float32Array(SH * E.length * SEG * 3);
const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
const ptsMat = new THREE.PointsMaterial({ vertexColors: true, size: 3, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const points = new THREE.Points(pg, ptsMat);
lines.frustumCulled = points.frustumCulled = false;
scene.add(lines, points);
const ang = [[0, 0, 0, 0], [1, 2, 0.5, 1], [2, 0.7, 1.4, 0.3]];
const proj = Array.from({ length: 16 }, () => [0, 0, 0]);
const col = new THREE.Color();
const rot = (p, i, j, a) => { const c = Math.cos(a), s = Math.sin(a), x = p[i], y = p[j]; p[i] = x * c - y * s; p[j] = x * s + y * c; };
const target = new THREE.Vector3();
let f = 1;
return {
update(dt, t) {
const bands = [A.bass, A.mid, A.high];
let li = 0, pi = 0;
for (let s = 0; s < SH; s++) {
const sp = (0.25 + A.level * 0.9 + A.beat * 1.2) * dt * (s % 2 ? -1 : 1);
ang[s][0] += sp * 0.9; ang[s][1] += sp * 0.7; ang[s][2] += sp * 0.5; ang[s][3] += sp * 0.3;
const sc = [0.62, 1.0, 1.45][s] * (1 + bands[s] * 0.35 + A.beat * 0.08);
for (let i = 0; i < 16; i++) {
const p = V[i].slice();
rot(p, 0, 3, ang[s][0]); rot(p, 1, 3, ang[s][1]); rot(p, 2, 3, ang[s][2]); rot(p, 0, 1, ang[s][3]);
const k = 2.6 / (2.6 - p[3] * 0.9);
proj[i][0] = p[0] * k * sc * 0.5; proj[i][1] = p[1] * k * sc * 0.5; proj[i][2] = p[2] * k * sc * 0.5;
}
col.setHSL((s * 0.18 + t * 0.02) % 1, 0.85, 0.35 + bands[s] * 0.35 + A.beat * 0.15);
for (const [a, b] of E) {
const P3 = proj[a], Q3 = proj[b];
lp.set(P3, li * 3); lp.set(Q3, li * 3 + 3); lc.set([col.r, col.g, col.b, col.r, col.g, col.b], li * 3); li += 2;
for (let n = 0; n < SEG; n++) {
const u = n / (SEG - 1);
pp[pi * 3] = P3[0] + (Q3[0] - P3[0]) * u; pp[pi * 3 + 1] = P3[1] + (Q3[1] - P3[1]) * u; pp[pi * 3 + 2] = P3[2] + (Q3[2] - P3[2]) * u;
const g = 0.35 + 0.65 * Math.abs(Math.sin(u * Math.PI * 2 + t * 4 + s));
pc[pi * 3] = col.r * g; pc[pi * 3 + 1] = col.g * g; pc[pi * 3 + 2] = col.b * g; pi++;
}
}
}
lg.attributes.position.needsUpdate = true; lg.attributes.color.needsUpdate = true;
pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
ptsMat.size = 2 + A.high * 4;
const w = fb.warp; w.uT.value = t; w.uMid.value = A.mid; w.uDecay.value = 0.86 + A.level * 0.08; w.uZoom.value = 0.995 - A.beat * 0.01;
w.uRot.value = 0.003 + A.input.vyaw * 0.02;
cam.position.set(0, 0, 4.2 * f);
applyOrbit(THREE, cam, target, A.input);
fb.render(scene, cam);
},
resize(w, h, pr) { cam.aspect = w / h; f = fit(cam.aspect, 0.85); cam.updateProjectionMatrix(); fb.setSize(w, h, pr); },
dispose() { disposeScene(scene); fb.dispose(); }
};
} }
];
}
