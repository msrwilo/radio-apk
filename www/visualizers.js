const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
const vec2 C=vec2(1.0/6.0,1.0/3.0);
const vec4 D=vec4(0.0,0.5,1.0,2.0);
vec3 i=floor(v+dot(v,C.yyy));
vec3 x0=v-i+dot(i,C.xxx);
vec3 g=step(x0.yzx,x0.xyz);
vec3 l=1.0-g;
vec3 i1=min(g.xyz,l.zxy);
vec3 i2=max(g.xyz,l.zxy);
vec3 x1=x0-i1+C.xxx;
vec3 x2=x0-i2+C.yyy;
vec3 x3=x0-D.yyy;
i=mod289(i);
vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;
vec3 ns=n_*D.wyz-D.xzx;
vec4 j=p-49.0*floor(p*ns.z*ns.z);
vec4 x_=floor(j*ns.z);
vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;
vec4 y=y_*ns.x+ns.yyyy;
vec4 h=1.0-abs(x)-abs(y);
vec4 b0=vec4(x.xy,y.xy);
vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;
vec4 s1=floor(b1)*2.0+1.0;
vec4 sh=-step(h,vec4(0.0));
vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);
vec3 p1=vec3(a0.zw,h.y);
vec3 p2=vec3(a1.xy,h.z);
vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
m=m*m;
return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;
const QUAD_VS = /* glsl */`
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
`;
const SOFT_POINT_FS = /* glsl */`
varying vec3 vC;
void main(){
float d=length(gl_PointCoord-0.5);
float a=smoothstep(0.5,0.0,d);
gl_FragColor=vec4(vC*a*a,1.0);
}
`;
const fit = (aspect, k = 0.9) => Math.max(1, k / aspect);
function disposeScene(scene) {
scene.traverse(o => {
if (o.geometry) o.geometry.dispose();
const m = o.material;
if (m) (Array.isArray(m) ? m : [m]).forEach(mm => { if (mm.map) mm.map.dispose(); mm.dispose(); });
});
}
function gauss() {
let u = 0, v = 0;
while (u === 0) u = Math.random();
while (v === 0) v = Math.random();
return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function makeFeedback(THREE, renderer, warpFS, uniforms, maxSide) {
const opts = { type: THREE.UnsignedByteType, depthBuffer: true };
let a = new THREE.WebGLRenderTarget(4, 4, opts);
let b = new THREE.WebGLRenderTarget(4, 4, opts);
const quad = new THREE.PlaneGeometry(2, 2);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const warpMat = new THREE.ShaderMaterial({
uniforms: Object.assign({ uPrev: { value: null }, uAspect: { value: 1 } }, uniforms),
vertexShader: QUAD_VS, fragmentShader: warpFS, depthTest: false, depthWrite: false
});
const copyMat = new THREE.ShaderMaterial({
uniforms: { uTex: { value: null }, uGain: { value: 1.15 } },
vertexShader: QUAD_VS,
fragmentShader: /* glsl */`
uniform sampler2D uTex; uniform float uGain; varying vec2 vUv;
void main(){
vec3 c=texture2D(uTex,vUv).rgb*uGain;
float v=smoothstep(0.95,0.25,length(vUv-0.5));
gl_FragColor=vec4(c*mix(0.6,1.0,v),1.0);
}`,
depthTest: false, depthWrite: false
});
const warpScene = new THREE.Scene(); warpScene.add(new THREE.Mesh(quad, warpMat));
const copyScene = new THREE.Scene(); copyScene.add(new THREE.Mesh(quad, copyMat));
const clear = () => {
const cc = new THREE.Color(); renderer.getClearColor(cc); const al = renderer.getClearAlpha();
renderer.setClearColor(0x000000, 1);
for (const t of [a, b]) { renderer.setRenderTarget(t); renderer.clear(); }
renderer.setRenderTarget(null); renderer.setClearColor(cc, al);
};
return {
warp: warpMat.uniforms,
setSize(w, h, pr) {
const s = Math.min(1, maxSide / Math.max(w * pr, h * pr));
const W = Math.max(2, Math.round(w * pr * s)), H = Math.max(2, Math.round(h * pr * s));
a.setSize(W, H); b.setSize(W, H); warpMat.uniforms.uAspect.value = W / H; clear();
},
render(scene, camera) {
warpMat.uniforms.uPrev.value = a.texture;
renderer.setRenderTarget(b);
renderer.setClearColor(0x000000, 1);
renderer.render(warpScene, cam);
const ac = renderer.autoClear; renderer.autoClear = false;
renderer.clearDepth(); renderer.render(scene, camera);
renderer.autoClear = ac;
renderer.setRenderTarget(null);
copyMat.uniforms.uTex.value = b.texture;
renderer.render(copyScene, cam);
const t = a; a = b; b = t;
},
dispose() { a.dispose(); b.dispose(); quad.dispose(); warpMat.dispose(); copyMat.dispose(); }
};
}
const WARP_FS = NOISE + /* glsl */`
uniform sampler2D uPrev; uniform float uAspect,uT,uZoom,uRot,uWarp,uMid,uDecay,uHue;
varying vec2 vUv;
void main(){
vec2 p=vUv-0.5; p.x*=uAspect;
float r=length(p);
float ang=uRot+0.015*uWarp*sin(r*9.0-uT*1.3);
float c=cos(ang), s=sin(ang);
p=mat2(c,-s,s,c)*p;
p*=uZoom-0.012*uWarp*sin(r*14.0-uT*2.2)*(0.3+uMid);
p+=0.0035*uWarp*vec2(snoise(vec3(p*3.0,uT*0.2)),snoise(vec3(p*3.0+7.1,uT*0.2)));
p.x/=uAspect;
vec3 col=texture2D(uPrev,p+0.5).rgb;
col=mix(col,col.gbr,uHue);
col=col*uDecay-0.004;
gl_FragColor=vec4(max(col,0.0),1.0);
}
`;
export function buildVisualizers() {
return [
{ name: 'Barro vivo', create({ THREE, renderer, A, mobile }) {
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0b0a);
const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
const uni = { uT: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 }, uHat: { value: 0 }, uAudio: { value: A.tex }, uPR: { value: 1 } };
const mat = new THREE.ShaderMaterial({
uniforms: uni,
vertexShader: NOISE + /* glsl */`
uniform float uT,uBass,uMid,uHigh,uBeat; uniform sampler2D uAudio;
varying vec3 vP; varying float vD;
void main(){
vec3 n=normalize(position);
float spec=texture2D(uAudio,vec2(0.03+abs(n.y)*0.6,0.25)).r;
float d=snoise(n*1.4+vec3(0.0,uT*0.3,uT*0.17))*(0.12+uBass*0.42);
d+=snoise(n*3.6-vec3(uT*0.45))*(0.04+uMid*0.10);
d+=snoise(n*9.0+uT)*(0.01+uHigh*0.05);
d+=spec*spec*0.22+uBeat*0.05;
vD=d;
vec4 mv=modelViewMatrix*vec4(n*(1.2+d),1.0);
vP=mv.xyz;
gl_Position=projectionMatrix*mv;
}`,
fragmentShader: /* glsl */`
uniform float uMid,uBeat; varying vec3 vP; varying float vD;
void main(){
vec3 N=normalize(cross(dFdx(vP),dFdy(vP)));
vec3 V=normalize(-vP);
if(dot(N,V)<0.0) N=-N;
vec3 L=normalize(vec3(0.5,0.8,0.7));
float diff=max(dot(N,L),0.0);
float fres=pow(1.0-max(dot(N,V),0.0),2.5);
vec3 clayDark=vec3(0.16,0.10,0.07), clay=vec3(0.64,0.50,0.38);
vec3 glaze=vec3(0.89,0.83,0.74), sage=vec3(0.41,0.46,0.29);
vec3 base=mix(clayDark,clay,smoothstep(-0.25,0.45,vD));
base=mix(base,glaze,smoothstep(0.35,0.7,vD)*0.6);
vec3 col=base*(0.18+0.95*diff);
col+=pow(max(dot(reflect(-L,N),V),0.0),28.0)*0.55*glaze;
col+=sage*fres*(0.6+uMid*0.8);
col+=vec3(1.0,0.42,0.12)*smoothstep(0.3,0.75,vD)*(0.25+uBeat*0.9);
gl_FragColor=vec4(col,1.0);
}`
});
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, mobile ? 30 : 56), mat);
scene.add(mesh);
const HN = mobile ? 1600 : 3200;
const hp = new Float32Array(HN * 3), hr = new Float32Array(HN);
const v = new THREE.Vector3();
for (let i = 0; i < HN; i++) {
v.set(gauss(), gauss(), gauss()).normalize().multiplyScalar(1.9 + Math.random() * 1.6);
hp.set([v.x, v.y, v.z], i * 3); hr[i] = Math.random();
}
const hg = new THREE.BufferGeometry();
hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
hg.setAttribute('aR', new THREE.BufferAttribute(hr, 1));
const halo = new THREE.Points(hg, new THREE.ShaderMaterial({
uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`
attribute float aR; uniform float uT,uBass,uBeat,uHat,uPR; uniform sampler2D uAudio; varying vec3 vC;
void main(){
float s=texture2D(uAudio,vec2(0.25+aR*0.7,0.25)).r;
float tw=step(1.0-uHat*0.2,fract(aR*73.13+floor(uT*9.0)*0.371))*uHat;
vec4 mv=modelViewMatrix*vec4(position*(1.0+uBass*0.18+uBeat*0.08),1.0);
gl_Position=projectionMatrix*mv;
gl_PointSize=(1.0+s*s*6.0+tw*4.0)*uPR*(4.0/-mv.z);
vC=mix(vec3(0.64,0.5,0.38),vec3(0.89,0.83,0.74),aR)*(0.25+s*1.2)+vec3(1.0,0.9,0.75)*tw*1.4;
}`,
fragmentShader: SOFT_POINT_FS
}));
scene.add(halo);
let baseZ = 5.4;
return {
update(dt, t) {
uni.uT.value = A.flow; uni.uBass.value = A.bass; uni.uMid.value = A.mid; uni.uHigh.value = A.high; uni.uBeat.value = A.beat; uni.uHat.value += (A.hat - uni.uHat.value) * Math.min(1, dt * 20);
mesh.rotation.y += dt * (0.12 + A.mid * 0.35 + A.snare * 1.4);
mesh.rotation.x = Math.sin(t * 0.1) * 0.35;
halo.rotation.y -= dt * (0.05 + A.high * 0.2);
halo.rotation.z += dt * 0.02;
cam.position.set(Math.sin(t * 0.05) * 0.6, Math.cos(t * 0.07) * 0.3, baseZ);
applyOrbit(THREE, cam, new THREE.Vector3(), A.input);
renderer.render(scene, cam);
},
resize(w, h, pr) { cam.aspect = w / h; baseZ = 5.4 * fit(cam.aspect); cam.updateProjectionMatrix(); uni.uPR.value = pr; },
dispose() { disposeScene(scene); }
};
} },
{ name: 'Túnel', maxDpr: 1.25, create({ THREE, renderer, A }) {
const uni = { uRes: { value: new THREE.Vector2() }, uT: { value: 0 }, uFlow: { value: 0 }, uBass: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 }, uHat: { value: 0 }, uKA: { value: 9 }, uAudio: { value: A.tex }, uSteer: { value: new THREE.Vector2() } };
const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
uniforms: uni, vertexShader: QUAD_VS, depthTest: false,
fragmentShader: /* glsl */`
uniform vec2 uRes,uSteer; uniform float uT,uFlow,uBass,uHigh,uBeat,uHat,uKA; uniform sampler2D uAudio;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec3 pal(float t){return 0.5+0.5*cos(6.28318*(t+vec3(0.0,0.12,0.26)));}
void main(){
vec2 uv=(gl_FragCoord.xy-0.5*uRes)/min(uRes.x,uRes.y);
uv+=0.07*vec2(sin(uT*0.31),cos(uT*0.23))+uSteer;
float r=max(length(uv),0.0001);
float a=atan(uv.y,uv.x)+uFlow*0.07;
float z=0.32/r+uFlow*1.3;
float ang=fract(a/6.28318);
vec2 g=vec2(ang*24.0,z*2.0);
vec2 id=floor(g); vec2 f=fract(g)-0.5;
float cx=mod(id.x,24.0);
float h=hash(vec2(cx,id.y));
float e=max(abs(f.x),abs(f.y));
float spec=texture2D(uAudio,vec2(0.02+abs(cx/24.0-0.5)*1.5,0.25)).r;
float frame=smoothstep(0.5,0.45,e)*smoothstep(0.36,0.43,e);
float lit=step(1.0-spec*1.1,h);
vec3 c=pal(h*0.25+id.y*0.015+uT*0.02);
vec3 col=c*frame*(0.22+spec*0.9);
col+=c*lit*smoothstep(0.42,0.08,e)*(0.6+spec)*1.4;
col+=vec3(1.0,0.95,0.85)*step(1.0-uHat*0.1,hash(id+floor(uT*16.0)))*smoothstep(0.42,0.1,e)*uHat*1.5;
float kr=0.95*exp(-uKA*2.6);
col+=pal(uT*0.03+0.2)*exp(-pow((r-kr)*28.0,2.0))*exp(-uKA*2.0)*1.2;
col*=smoothstep(0.02,0.5,r)*smoothstep(1.6,0.4,r);
col+=pal(uT*0.03+0.5)*min((0.015+uBass*0.035)/r,2.0)*smoothstep(0.7,0.0,r);
col+=vec3(1.0,0.55,0.25)*uBeat*0.1;
gl_FragColor=vec4(col,1.0);
}`
})));
return {
update(dt, t) { uni.uT.value = t; uni.uFlow.value = A.flow; uni.uBass.value = A.bass; uni.uHigh.value = A.high; uni.uBeat.value = A.beat; uni.uHat.value += (A.hat - uni.uHat.value) * Math.min(1, dt * 20); uni.uKA.value = A.kick > 0.99 ? 0 : uni.uKA.value + dt; uni.uSteer.value.set(Math.sin(A.input.yaw) * 0.35, A.input.pitch * 0.35); renderer.render(scene, cam); },
resize(w, h, pr) { uni.uRes.value.set(w * pr, h * pr); },
dispose() { disposeScene(scene); }
};
} },
{ name: 'Galaxia', create({ THREE, renderer, A, mobile }) {
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020207);
const cam = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
const N = mobile ? 45000 : 110000;
const pos = new Float32Array(N * 3), aR = new Float32Array(N), aA = new Float32Array(N), aY = new Float32Array(N), aRnd = new Float32Array(N), aK = new Float32Array(N);
const B = 4.2;
for (let i = 0; i < N; i++) {
const kind = Math.random();
let r, a, y, k;
if (kind < 0.16) {
r = Math.abs(gauss()) * 0.55 + 0.02; a = Math.random() * Math.PI * 2; y = gauss() * 0.22 * Math.exp(-r * 1.5); k = 0;
} else if (kind < 0.66) {
r = 0.35 + Math.min(5.8, -Math.log(1 - Math.random() * 0.985) * 1.6);
const am = Math.random(), arm = am < 0.36 ? 0 : am < 0.72 ? Math.PI : am < 0.86 ? Math.PI * 0.5 : Math.PI * 1.5;
a = arm + B * Math.log(r / 0.35) * 0.42 + gauss() * (0.2 + 0.05 * r + 0.08 / r) * (am < 0.72 ? 1 : 1.6);
y = gauss() * 0.06 * (1 + r * 0.1); k = 1;
} else {
r = 0.3 + Math.min(6.2, -Math.log(1 - Math.random() * 0.99) * 1.7); a = Math.random() * Math.PI * 2; y = gauss() * 0.09; k = 2;
}
aR[i] = r; aA[i] = a; aY[i] = y; aRnd[i] = Math.random(); aK[i] = k;
}
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
g.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
g.setAttribute('aA', new THREE.BufferAttribute(aA, 1));
g.setAttribute('aY', new THREE.BufferAttribute(aY, 1));
g.setAttribute('aRnd', new THREE.BufferAttribute(aRnd, 1));
g.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
const uni = { uT: { value: 0 }, uFlow: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uHat: { value: 0 }, uKA: { value: 9 }, uDrop: { value: 0 }, uPR: { value: 1 }, uAudio: { value: A.tex } };
const ROT = /* glsl */`float spin(float r){ return uFlow*0.22/(0.35+r*0.55); }`;
const GLOW_FS = /* glsl */`
varying vec3 vC; varying float vA;
void main(){ vec2 d=gl_PointCoord-0.5; float q=dot(d,d)*4.0; float a=exp(-q*4.0)+0.25*exp(-q*1.2); gl_FragColor=vec4(vC*a,a*vA); }`;
const stars = new THREE.Points(g, new THREE.ShaderMaterial({
uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: ROT.replace('float spin', 'uniform float uFlow; float spin') + /* glsl */`
attribute float aR,aA,aY,aRnd,aK; uniform float uT,uBass,uMid,uHigh,uHat,uKA,uDrop,uPR; uniform sampler2D uAudio; varying vec3 vC; varying float vA;
void main(){
float s=texture2D(uAudio,vec2(0.03+clamp(aR/6.0,0.0,1.0)*0.85,0.25)).r;
float ang=aA+spin(aR);
vec3 p=vec3(cos(ang)*aR,aY,sin(ang)*aR);
vec4 mv=modelViewMatrix*vec4(p,1.0);
gl_Position=projectionMatrix*mv;
float bright=step(0.985,aRnd);
float tw=bright*step(1.0-uHat*0.35,fract(aRnd*311.7+floor(uT*12.0)*0.37))*uHat;
float shock=exp(-pow((aR-0.4-uKA*6.5)*1.8,2.0))*exp(-uKA*1.6)*smoothstep(0.4,1.2,aR);
float sz=(2.0+aRnd*1.6+bright*3.5+tw*4.0+shock*2.0)*uPR*(7.0/-mv.z);
gl_PointSize=max(sz,1.6*uPR);
vec3 warm=vec3(1.0,0.82,0.6), white=vec3(0.95,0.95,1.0), blue=vec3(0.55,0.72,1.0), pink=vec3(1.0,0.45,0.7);
vec3 c=aK<0.5?warm:mix(white,blue,smoothstep(0.8,3.5,aR));
c=mix(c,warm,smoothstep(1.4,0.2,aR)*0.7);
c=mix(c,pink,step(0.965,fract(aRnd*57.3))*step(0.5,aK)*step(aK,1.5)*0.8);
float base=aK<0.5?0.26:(aK<1.5?0.3:0.13);
vA=1.0;
vC=c*(base*(0.7+s*0.9)+bright*0.6+tw*2.2+shock*0.7+uDrop*0.25);
}`,
fragmentShader: GLOW_FS
}));
stars.frustumCulled = false; scene.add(stars);
const DN = mobile ? 1400 : 3200;
const dp = new Float32Array(DN * 3), dR = new Float32Array(DN), dA = new Float32Array(DN), dY = new Float32Array(DN), dS = new Float32Array(DN), dT = new Float32Array(DN);
for (let i = 0; i < DN; i++) {
const r = 1.0 + Math.random() * 4.6;
const am = Math.random(), arm = am < 0.38 ? 0 : am < 0.76 ? Math.PI : am < 0.88 ? Math.PI * 0.5 : Math.PI * 1.5;
const type = Math.random() < 0.55 ? 0 : 1;
dR[i] = r; dA[i] = arm + B * Math.log(r / 0.35) * 0.42 + gauss() * 0.2 + (type ? 0.14 : -0.1);
dY[i] = gauss() * 0.04; dS[i] = Math.random(); dT[i] = type;
}
const dg = new THREE.BufferGeometry();
dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
dg.setAttribute('aR', new THREE.BufferAttribute(dR, 1)); dg.setAttribute('aA', new THREE.BufferAttribute(dA, 1));
dg.setAttribute('aY', new THREE.BufferAttribute(dY, 1)); dg.setAttribute('aS', new THREE.BufferAttribute(dS, 1)); dg.setAttribute('aT', new THREE.BufferAttribute(dT, 1));
const neb = new THREE.Points(dg, new THREE.ShaderMaterial({
uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: ROT.replace('float spin', 'uniform float uFlow; float spin') + /* glsl */`
attribute float aR,aA,aY,aS,aT; uniform float uT,uBass,uMid,uPR,uKA; varying vec3 vC; varying float vA;
void main(){
float ang=aA+spin(aR);
vec3 p=vec3(cos(ang)*aR,aY,sin(ang)*aR);
vec4 mv=modelViewMatrix*vec4(p,1.0);
gl_Position=projectionMatrix*mv;
gl_PointSize=(40.0+aS*70.0)*uPR*(5.0/-mv.z);
vec3 c=mix(vec3(0.95,0.35,0.6),vec3(0.35,0.55,1.0),smoothstep(1.5,4.5,aR+aS));
vA=aT*(0.022+uMid*0.035+exp(-uKA*3.0)*0.015)*smoothstep(1.0,2.2,aR);
vC=c;
}`,
fragmentShader: GLOW_FS
}));
neb.frustumCulled = false; scene.add(neb);
const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
uniforms: uni, transparent: true, depthWrite: false,
blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
vertexShader: ROT.replace('float spin', 'uniform float uFlow; float spin') + /* glsl */`
attribute float aR,aA,aY,aS,aT; uniform float uPR; varying vec3 vC; varying float vA;
void main(){
float ang=aA+spin(aR);
vec3 p=vec3(cos(ang)*aR,aY,sin(ang)*aR);
vec4 mv=modelViewMatrix*vec4(p,1.0);
gl_Position=projectionMatrix*mv;
gl_PointSize=(18.0+aS*30.0)*uPR*(5.0/-mv.z);
vA=(1.0-aT)*0.4*smoothstep(0.8,1.6,aR); vC=vec3(0.0);
}`,
fragmentShader: GLOW_FS
}));
dust.frustumCulled = false; scene.add(dust);
const coreU = { uB: { value: 0 }, uK: { value: 0 } };
const core = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.ShaderMaterial({
uniforms: coreU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
fragmentShader: /* glsl */`uniform float uB,uK; varying vec2 vUv;
void main(){ float d=length(vUv-0.5)*2.0; float g=exp(-d*d*60.0)*1.2+exp(-d*7.0)*0.35+exp(-d*2.5)*0.06;
gl_FragColor=vec4(vec3(1.0,0.8,0.58)*g*(0.45+uB*0.45+uK*0.2),1.0);}`
}));
scene.add(core);
const BN = 2500, bp = new Float32Array(BN * 3), bs = new Float32Array(BN);
for (let i = 0; i < BN; i++) { const v = new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(80); bp.set([v.x, v.y, v.z], i * 3); bs[i] = Math.random(); }
const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3)); bg.setAttribute('aS', new THREE.BufferAttribute(bs, 1));
const sky = new THREE.Points(bg, new THREE.ShaderMaterial({
uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: /* glsl */`attribute float aS; uniform float uPR; varying vec3 vC; varying float vA;
void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=(1.5+aS*1.5)*uPR; vA=1.0; vC=vec3(0.6,0.65,0.8)*(0.15+aS*0.35); }`,
fragmentShader: GLOW_FS
}));
sky.frustumCulled = false; scene.add(sky);
const group = new THREE.Group(); scene.remove(stars, neb, dust); group.add(stars, dust, neb); stars.renderOrder = 1; dust.renderOrder = 2; neb.renderOrder = 3; group.rotation.z = 0.12; scene.add(group);
let dist = 9, kickAge = 9;
const tgt = new THREE.Vector3();
return {
update(dt, t) {
uni.uT.value = t; uni.uFlow.value = A.flow; uni.uBass.value += (A.bass - uni.uBass.value) * Math.min(1, dt * 8); uni.uMid.value += (A.mid - uni.uMid.value) * Math.min(1, dt * 4); uni.uHigh.value = A.high;
uni.uHat.value += (A.hat - uni.uHat.value) * Math.min(1, dt * 20);
if (A.kick > 0.99) kickAge = 0; kickAge += dt; uni.uKA.value = kickAge;
uni.uDrop.value = A.drop;
coreU.uB.value = uni.uBass.value; coreU.uK.value = Math.exp(-kickAge * 4);
const az = t * 0.03, el = 0.62 + 0.22 * Math.sin(t * 0.05);
cam.position.set(Math.cos(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.sin(az) * Math.cos(el) * dist);
applyOrbit(THREE, cam, tgt, A.input);
core.quaternion.copy(cam.quaternion);
renderer.render(scene, cam);
},
resize(w, h, pr) { cam.aspect = w / h; dist = 9 * fit(cam.aspect, 1.0); cam.updateProjectionMatrix(); uni.uPR.value = pr; },
dispose() { disposeScene(scene); }
};
} },
{ name: 'Remolino', create({ THREE, renderer, A, mobile }) {
const fb = makeFeedback(THREE, renderer, WARP_FS, {
uT: { value: 0 }, uZoom: { value: 0.985 }, uRot: { value: 0.01 }, uWarp: { value: 1 }, uMid: { value: 0 }, uDecay: { value: 0.955 }, uHue: { value: 0.012 }
}, mobile ? 560 : 820);
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);
const M = 512;
const g = new THREE.BufferGeometry();
const P = new Float32Array(M * 3);
g.setAttribute('position', new THREE.BufferAttribute(P, 3));
const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending });
const ptsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.5, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending });
const line = new THREE.LineLoop(g, lineMat), open = new THREE.Line(g, lineMat), pts = new THREE.Points(g, ptsMat);
line.frustumCulled = open.frustumCulled = pts.frustumCulled = false;
scene.add(line, open, pts);
const SN = 6, sg = new THREE.BufferGeometry(), SP = new Float32Array(SN * 3);
sg.setAttribute('position', new THREE.BufferAttribute(SP, 3));
const sat = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffd9a8, size: 6, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending }));
sat.frustumCulled = false; scene.add(sat);
const modes = [
{ zoom: 0.984, rot: 0.010, warp: 1.0, decay: 0.955 },
{ zoom: 1.012, rot: -0.008, warp: 0.6, decay: 0.95 },
{ zoom: 0.972, rot: 0.028, warp: 1.6, decay: 0.958 },
{ zoom: 0.99, rot: -0.02, warp: 2.2, decay: 0.95 }
];
let mode = 0, modeT = 0, shape = 0, aspect = 1;
const cur = { ...modes[0] };
const col = new THREE.Color();
return {
update(dt, t) {
modeT += dt;
if (modeT > 18 || (A.drop > 0.9 && modeT > 6) || (A.beat > 0.95 && modeT > 12 && Math.random() < 0.1)) { modeT = 0; mode = (mode + 1) % modes.length; shape = (shape + 1) % 3; }
const m = modes[mode], k = 1 - Math.exp(-dt * 0.8);
for (const key in cur) cur[key] += (m[key] - cur[key]) * k;
const w = fb.warp;
w.uT.value = t; w.uMid.value = A.mid;
w.uZoom.value = cur.zoom - A.bass * 0.012;
w.uRot.value = cur.rot * (1 + A.bass * 1.5) + A.input.vyaw * 0.03;
w.uWarp.value = cur.warp; w.uDecay.value = cur.decay;
const wave = A.wave, W = wave.length;
const R = 0.17 + A.bass * 0.06 + A.beat * 0.03;
for (let i = 0; i < M; i++) {
const s = wave[(i * 2) % W];
const blend = i > M - 32 ? (M - i) / 32 : 1;
const sv = s * blend + wave[0] * (1 - blend);
let x, y;
if (shape === 0) { const th = i / M * Math.PI * 2 + t * 0.2; const r = R + sv * 0.13; x = Math.cos(th) * r; y = Math.sin(th) * r; }
else if (shape === 1) { x = (i / M - 0.5) * aspect * 0.9; y = sv * 0.22 + Math.sin(t * 0.7) * 0.08; }
else { const th = i / M * Math.PI * 6 + t * 0.4; const r = 0.03 + i / M * (R + 0.12) + sv * 0.05; x = Math.cos(th) * r; y = Math.sin(th) * r; }
P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = 0;
}
g.attributes.position.needsUpdate = true;
line.visible = shape === 0; open.visible = shape !== 0;
col.setHSL((t * 0.05) % 1, 0.8, 0.55 + A.beat * 0.2);
lineMat.color.copy(col); ptsMat.color.copy(col).offsetHSL(0.15, 0, 0);
for (let i = 0; i < SN; i++) {
const th = i / SN * Math.PI * 2 + A.flow * 0.8;
const r = 0.3 + A.mid * 0.12 + Math.sin(t + i) * 0.03;
SP[i * 3] = Math.cos(th) * r; SP[i * 3 + 1] = Math.sin(th) * r;
if (A.input.active) { SP[i * 3] = A.input.x * cam.right + Math.cos(th) * 0.03; SP[i * 3 + 1] = A.input.y * cam.top + Math.sin(th) * 0.03; }
}
sg.attributes.position.needsUpdate = true;
sat.material.size = 3 + A.high * 7 + A.hat * 8;
fb.render(scene, cam);
},
resize(w, h, pr) {
aspect = w / h;
cam.left = -aspect / 2; cam.right = aspect / 2; cam.top = 0.5; cam.bottom = -0.5;
if (aspect < 1) { cam.left = -0.5; cam.right = 0.5; cam.top = 0.5 / aspect; cam.bottom = -0.5 / aspect; }
cam.updateProjectionMatrix();
fb.setSize(w, h, pr);
const sc = Math.min(w, h) * pr / 600;
ptsMat.size = Math.max(1.5, 2.2 * sc);
},
dispose() { disposeScene(scene); fb.dispose(); }
};
} },
{ name: 'Pulsar', create({ THREE, renderer, A, mobile }) {
const BG = 0x0e0c0b;
const scene = new THREE.Scene(); scene.background = new THREE.Color(BG);
const L = mobile ? 44 : 62, P = mobile ? 120 : 180, dz = 0.075, W = 2.6, H = 0.95;
scene.fog = new THREE.Fog(BG, 2.5, 2.5 + L * dz * 1.1);
const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
const rows = []; for (let k = 0; k < L; k++) rows.push(new Float32Array(P));
const lines = [], fills = [];
const ink = new THREE.Color(0xe3d4bd), hot = new THREE.Color(0xffb27a);
for (let k = 0; k < L; k++) {
const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P * 3), 3));
const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: ink.clone(), transparent: true }));
const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P * 2 * 3), 3));
const idx = [];
for (let i = 0; i < P - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, c, b, d); }
fg.setIndex(idx);
const fm = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: BG, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
ln.frustumCulled = fm.frustumCulled = false;
scene.add(fm, ln); lines.push(ln); fills.push(fm);
}
let acc = 0, seed = 0, F = 1;
const step = 1 / 24;
const pushRow = () => {
const r = rows.pop();
seed += 1.37;
for (let i = 0; i < P; i++) {
const x = -1 + 2 * i / (P - 1);
const env = Math.exp(-x * x * 5.0);
const b = Math.min(255, Math.floor((Math.abs(x) * 0.55 + 0.01) * 255));
const s = A.spec[b];
const n = 0.55 + 0.45 * Math.sin(i * 0.45 + seed) * Math.sin(i * 0.13 + seed * 1.7);
r[i] = env * (s * 0.9 * n + 0.03 * Math.random()) + 0.004 * Math.random();
}
rows.unshift(r);
};
return {
update(dt) {
acc += dt * (0.7 + A.level * 0.8);
while (acc > step) { acc -= step; pushRow(); }
const phase = acc / step;
for (let k = 0; k < L; k++) {
const r = rows[k], z = -(k + phase) * dz;
const lp = lines[k].geometry.attributes.position.array, fp = fills[k].geometry.attributes.position.array;
for (let i = 0; i < P; i++) {
const x = (-1 + 2 * i / (P - 1)) * W * 0.5, y = r[i] * H;
lp[i * 3] = x; lp[i * 3 + 1] = y; lp[i * 3 + 2] = z;
fp[i * 6] = x; fp[i * 6 + 1] = y; fp[i * 6 + 2] = z;
fp[i * 6 + 3] = x; fp[i * 6 + 4] = -0.06; fp[i * 6 + 5] = z;
}
lines[k].geometry.attributes.position.needsUpdate = true;
fills[k].geometry.attributes.position.needsUpdate = true;
const m = lines[k].material;
m.opacity = k === 0 ? phase : 1;
if (k < 3) m.color.copy(ink).lerp(hot, A.beat * (1 - k / 3));
}
cam.position.set(0, 1.25 * F, 2.9 * F);
applyOrbit(THREE, cam, new THREE.Vector3(0, 0.05, -L * dz * 0.42), A.input);
renderer.render(scene, cam);
},
resize(w, h) {
cam.aspect = w / h;
const f = F = fit(cam.aspect, 1.15);
cam.position.set(0, 1.25 * f, 2.9 * f);
cam.lookAt(0, 0.05, -L * dz * 0.42);
cam.far = 50; scene.fog.near = 2.0 * f; scene.fog.far = 2.0 * f + L * dz * 1.2;
cam.updateProjectionMatrix();
},
dispose() { disposeScene(scene); }
};
} },
{ name: 'Torno', create({ THREE, renderer, A, mobile }) {
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0f0c0a);
const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
const c = cv.getContext('2d');
const gr = c.createLinearGradient(0, 512, 0, 0);
gr.addColorStop(0, '#6e5140'); gr.addColorStop(0.16, '#7b5b44'); gr.addColorStop(0.2, '#a48161');
gr.addColorStop(0.62, '#c9b08f'); gr.addColorStop(1, '#e3d4bd');
c.fillStyle = gr; c.fillRect(0, 0, 512, 512);
c.fillStyle = '#69754a'; c.beginPath(); c.moveTo(0, 0);
for (let x = 0; x <= 512; x += 16) c.lineTo(x, 70 + Math.sin(x * 0.05) * 14 + Math.random() * 18);
c.lineTo(512, 0); c.fill();
c.lineCap = 'round';
for (let i = 0; i < 46; i++) {
const x = Math.random() * 512, len = 60 + Math.random() * 230, wdt = 4 + Math.random() * 14;
c.strokeStyle = `rgba(105,117,74,${0.55 + Math.random() * 0.4})`; c.lineWidth = wdt;
c.beginPath(); c.moveTo(x, 60); c.lineTo(x + (Math.random() - 0.5) * 6, 60 + len); c.stroke();
c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(x, 60 + len, wdt * 0.62, 0, Math.PI * 2); c.fill();
}
for (let y = 0; y < 512; y += 4 + Math.random() * 4) {
c.strokeStyle = `rgba(30,18,10,${0.04 + Math.random() * 0.09})`; c.lineWidth = 1 + Math.random() * 1.5;
c.beginPath(); c.moveTo(0, y); c.lineTo(512, y); c.stroke();
}
for (let i = 0; i < 1800; i++) { c.fillStyle = `rgba(45,28,16,${0.2 + Math.random() * 0.35})`; c.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 1.6, 1 + Math.random() * 1.6); }
const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const R = mobile ? 56 : 84, S = mobile ? 72 : 112, HT = 2.0;
const g = new THREE.BufferGeometry();
const pos = new Float32Array(R * (S + 1) * 3), uv = new Float32Array(R * (S + 1) * 2);
const idx = [], cs = [], sn = [];
for (let j = 0; j <= S; j++) { const th = j / S * Math.PI * 2; cs.push(Math.cos(th)); sn.push(Math.sin(th)); }
for (let i = 0; i < R; i++) for (let j = 0; j <= S; j++) { const q = i * (S + 1) + j; uv[q * 2] = j / S; uv[q * 2 + 1] = i / (R - 1); }
for (let i = 0; i < R - 1; i++) for (let j = 0; j < S; j++) { const a = i * (S + 1) + j, b = a + S + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
g.setIndex(idx);
const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.06, side: THREE.DoubleSide, emissive: new THREE.Color(0xa45a2a), emissiveIntensity: 0 });
const pot = new THREE.Mesh(g, mat); pot.frustumCulled = false;
const group = new THREE.Group(); group.add(pot); scene.add(group);
const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.48, 0.14, 72), new THREE.MeshStandardMaterial({ color: 0x2a2521, roughness: 0.85 }));
wheel.position.y = -0.08; group.add(wheel);
const rim = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.012, 8, 96), new THREE.MeshStandardMaterial({ color: 0xa48161, roughness: 0.4, metalness: 0.5 }));
rim.rotation.x = Math.PI / 2; rim.position.y = -0.01; group.add(rim);
const glow = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.ShaderMaterial({
uniforms: { uB: { value: 0 } }, depthWrite: false,
vertexShader: /* glsl */`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
fragmentShader: /* glsl */`uniform float uB; varying vec2 vUv; void main(){ float d=length((vUv-vec2(0.5,0.45))*vec2(1.4,1.0));
vec3 c=mix(vec3(0.28,0.18,0.11),vec3(0.06,0.05,0.04),smoothstep(0.0,0.6,d)); gl_FragColor=vec4(c*(0.8+uB*0.5),1.0);}`
}));
glow.position.set(0, 1.2, -3.2); scene.add(glow);
scene.add(new THREE.AmbientLight(0xfff0e0, 0.35));
const key = new THREE.DirectionalLight(0xffe2c2, 2.6); key.position.set(2.5, 4, 3); scene.add(key);
const rimL = new THREE.DirectionalLight(0x9fc2b0, 1.6); rimL.position.set(-3, 1.5, -2.5); scene.add(rimL);
const fire = new THREE.PointLight(0xff7a3a, 0, 6); fire.position.set(0, 0.4, 1.6); scene.add(fire);
const prof = new Float32Array(R);
const profile = (v, t) => {
const a = 0.5 + 0.5 * Math.sin(t * 0.06), b = 0.5 + 0.5 * Math.sin(t * 0.043 + 1.3);
const belly = Math.sin(Math.min(v * 1.12, 1) * Math.PI * 0.95 + 0.15);
let r = 0.36 + 0.55 * belly * (0.72 + 0.36 * a);
r -= smooth(0.6, 0.86, v) * (0.3 + 0.16 * b);
r += smooth(0.9, 1.0, v) * (0.16 + 0.12 * a);
r -= (1 - smooth(0, 0.06, v)) * 0.12;
return Math.max(r, 0.1);
};
const nrm = () => {
g.computeVertexNormals();
const n = g.attributes.normal.array;
for (let i = 0; i < R; i++) {
const a = i * (S + 1) * 3, b = (i * (S + 1) + S) * 3;
for (let k = 0; k < 3; k++) { const m = (n[a + k] + n[b + k]) * 0.5; n[a + k] = n[b + k] = m; }
}
};
let camD = 4.8;
return {
update(dt, t) {
for (let i = 0; i < R; i++) {
const v = i / (R - 1);
const s = A.spec[Math.floor((0.02 + v * 0.55) * 255)];
prof[i] = profile(v, t) + s * s * 0.24 * Math.sin(v * Math.PI) + A.bass * 0.04 * Math.sin(v * Math.PI);
}
const wob = A.mid * 0.045 + A.beat * 0.02;
for (let i = 0; i < R; i++) {
const y = i / (R - 1) * HT;
for (let j = 0; j <= S; j++) {
const q = (i * (S + 1) + j) * 3;
const r = prof[i] * (1 + wob * Math.sin(2 * j / S * Math.PI * 2 + t * 3 + i * 0.05));
pos[q] = cs[j] * r; pos[q + 1] = y; pos[q + 2] = sn[j] * r;
}
}
g.attributes.position.needsUpdate = true; nrm();
group.rotation.y += dt * (1.6 + A.level * 2.6);
mat.emissiveIntensity = A.beat * 0.35;
fire.intensity = A.bass * 3 + A.beat * 2;
glow.material.uniforms.uB.value = A.bass;
cam.position.set(Math.sin(t * 0.09) * 0.8, 1.55 + Math.sin(t * 0.13) * 0.2, camD);
applyOrbit(THREE, cam, new THREE.Vector3(0, 0.95, 0), A.input);
renderer.render(scene, cam);
},
resize(w, h) { cam.aspect = w / h; camD = 4.8 * fit(cam.aspect, 0.8); cam.updateProjectionMatrix(); },
dispose() { disposeScene(scene); tex.dispose(); }
};
} },
{ name: 'Ciudad', create({ THREE, renderer, A, mobile }) {
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const G = mobile ? 22 : 30, COUNT = G * G, BANDS = 48;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a090d);
scene.fog = new THREE.Fog(0x0a090d, G * 0.6, G * 2.2);
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
const geo = new THREE.BoxGeometry(0.84, 1, 0.84); geo.translate(0, 0.5, 0);
const mat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.3 });
const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);
const cx = new Float32Array(COUNT), cz = new Float32Array(COUNT), cd = new Uint16Array(COUNT), cb = new Uint16Array(COUNT);
let k = 0;
for (let i = 0; i < G; i++) for (let j = 0; j < G; j++, k++) {
const x = i - (G - 1) / 2, z = j - (G - 1) / 2;
cx[k] = x; cz[k] = z; cd[k] = Math.floor(Math.hypot(x, z));
cb[k] = Math.min(BANDS - 1, Math.floor(Math.abs(Math.atan2(z, x)) / Math.PI * BANDS));
}
const D = Math.ceil(G * 0.75) + 1;
const hist = []; for (let i = 0; i < D; i++) hist.push(new Float32Array(BANDS));
scene.add(new THREE.HemisphereLight(0x8a9cff, 0x2a1408, 0.7));
const sun = new THREE.DirectionalLight(0xffe0c0, 2.2); sun.position.set(10, 22, 8); scene.add(sun);
const core = new THREE.PointLight(0xffa060, 0, G * 1.2, 1.5); core.position.set(0, 4, 0); scene.add(core);
const m4 = new THREE.Matrix4(), col = new THREE.Color();
let acc = 0, orbit = G * 0.95;
return {
update(dt, t) {
acc += dt;
while (acc > 1 / 30) {
acc -= 1 / 30;
const r = hist.pop();
for (let b = 0; b < BANDS; b++) r[b] = A.spec[Math.floor((0.02 + b / BANDS * 0.8) * 255)];
hist.unshift(r);
}
for (let i = 0; i < COUNT; i++) {
const v = hist[Math.min(cd[i], D - 1)][cb[i]];
const h = 0.08 + Math.pow(v, 1.7) * 6.0;
m4.makeScale(1, h, 1); m4.setPosition(cx[i], 0, cz[i]);
mesh.setMatrixAt(i, m4);
col.setHSL(0.07 + v * 0.45 + cd[i] * 0.006 + t * 0.01, 0.8, 0.1 + v * 0.45);
mesh.setColorAt(i, col);
}
mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
core.intensity = A.bass * 30 + A.kick * 45 + A.drop * 60;
const az = t * 0.08;
cam.position.set(Math.cos(az) * orbit, G * 0.5 + Math.sin(t * 0.11) * G * 0.12, Math.sin(az) * orbit);
applyOrbit(THREE, cam, new THREE.Vector3(0, 1, 0), A.input);
renderer.render(scene, cam);
},
resize(w, h) { cam.aspect = w / h; orbit = G * 0.95 * fit(cam.aspect, 0.7); cam.updateProjectionMatrix(); },
dispose() { disposeScene(scene); }
};
} },
{ name: 'Caleidoscopio', maxDpr: 1, create({ THREE, renderer, A }) {
const uni = { uRes: { value: new THREE.Vector2() }, uT: { value: 0 }, uFlow: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 }, uSeg: { value: 8 }, uAudio: { value: A.tex }, uSpin: { value: 0 }, uZoomT: { value: 1 }, uHat: { value: 0 } };
const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
uniforms: uni, vertexShader: QUAD_VS, depthTest: false,
fragmentShader: NOISE + /* glsl */`
uniform vec2 uRes; uniform float uT,uFlow,uBass,uMid,uHigh,uBeat,uSeg,uSpin,uZoomT,uHat; uniform sampler2D uAudio;
vec3 pal(float t){return 0.5+0.5*cos(6.28318*(t+vec3(0.02,0.18,0.36)));}
float fbm(vec3 p){float f=0.0,a=0.5;for(int i=0;i<4;i++){f+=a*snoise(p);p*=2.03;a*=0.5;}return f;}
void main(){
vec2 uv=(gl_FragCoord.xy-0.5*uRes)/min(uRes.x,uRes.y);
float r=length(uv);
float a=atan(uv.y,uv.x)+uFlow*0.06+uSpin;
float seg=6.28318/uSeg;
a=mod(a,seg); a=abs(a-seg*0.5);
vec2 p=vec2(cos(a),sin(a))*r*(1.7-uBass*0.4)*uZoomT;
vec3 q=vec3(p*1.8,uFlow*0.12);
vec2 w=vec2(fbm(q),fbm(q+vec3(5.2,1.3,2.0)));
float n=fbm(vec3(p*1.8+w*(1.4+uMid*2.2),uFlow*0.09));
float spec=texture2D(uAudio,vec2(0.02+clamp(r,0.0,1.0)*0.7,0.25)).r;
vec3 col=pal(n*0.9+r*0.4+uT*0.025)*(0.06+0.8*smoothstep(-0.1,0.7,n));
float ring=smoothstep(0.05,0.0,0.5-abs(fract(r*5.0-uFlow*0.4)-0.5));
col+=vec3(1.0,0.9,0.75)*ring*(spec*spec*0.5+uHat*0.35);
col+=pal(uT*0.05)*pow(max(0.0,1.0-r*2.2),3.0)*(0.15+uBeat*0.6);
col*=smoothstep(1.25,0.35,r);
gl_FragColor=vec4(col,1.0);
}`
})));
let segT = 0;
const segs = [6, 8, 10, 12, 7];
let si = 1;
return {
update(dt, t) {
segT += dt;
if ((A.drop > 0.9 && segT > 6) || (A.beat > 0.95 && segT > 20)) { segT = 0; si = (si + 1) % segs.length; uni.uSeg.value = segs[si]; }
uni.uT.value = t; uni.uFlow.value = A.flow; uni.uBass.value = A.bass; uni.uMid.value = A.mid; uni.uHigh.value = A.high; uni.uBeat.value = A.beat;
uni.uSpin.value = A.input.yaw; uni.uZoomT.value = Math.exp(-A.input.pitch * 0.8); uni.uHat.value += (A.hat - uni.uHat.value) * Math.min(1, dt * 20);
renderer.render(scene, cam);
},
resize(w, h, pr) { uni.uRes.value.set(w * pr, h * pr); },
dispose() { disposeScene(scene); }
};
} },
{ name: 'Atractor', create({ THREE, renderer, A, mobile }) {
const fb = makeFeedback(THREE, renderer, WARP_FS, {
uT: { value: 0 }, uZoom: { value: 0.993 }, uRot: { value: 0.004 }, uWarp: { value: 0.25 }, uMid: { value: 0 }, uDecay: { value: 0.9 }, uHue: { value: 0.0 }
}, mobile ? 640 : 1000);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
const M = 900, TAU = 110;
const g = new THREE.BufferGeometry();
const P = new Float32Array(M * 3), C = new Float32Array(M * 3);
g.setAttribute('position', new THREE.BufferAttribute(P, 3));
g.setAttribute('color', new THREE.BufferAttribute(C, 3));
const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending }));
const pts = new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: 2, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending }));
line.frustumCulled = pts.frustumCulled = false;
const group = new THREE.Group(); group.add(line, pts); scene.add(group);
const col = new THREE.Color();
let peak = 0.2, camZ = 3.2;
return {
update(dt, t) {
const w = A.wave, n = w.length;
let mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(w[i]));
peak = Math.max(mx, peak * Math.exp(-dt * 0.6), 0.04);
const k = 0.95 / peak;
for (let i = 0; i < M; i++) {
const a = i % (n - 2 * TAU);
P[i * 3] = w[a] * k; P[i * 3 + 1] = w[a + TAU] * k; P[i * 3 + 2] = w[a + 2 * TAU] * k;
col.setHSL((t * 0.04 + i / M * 0.35) % 1, 0.85, 0.5);
const f = 0.35 + A.level * 0.9;
C[i * 3] = col.r * f; C[i * 3 + 1] = col.g * f; C[i * 3 + 2] = col.b * f;
}
g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
group.rotation.y += dt * (0.25 + A.mid * 0.6);
group.rotation.x = Math.sin(t * 0.13) * 0.6;
const fw = fb.warp; fw.uT.value = t; fw.uMid.value = A.mid;
fw.uZoom.value = 0.994 - A.bass * 0.012; fw.uDecay.value = 0.88 + A.level * 0.06;
cam.position.set(0, 0, camZ * (1 - A.beat * 0.04)); applyOrbit(THREE, cam, new THREE.Vector3(), A.input);
fb.render(scene, cam);
},
resize(w, h, pr) { cam.aspect = w / h; camZ = 3.2 * fit(cam.aspect, 1.0); cam.updateProjectionMatrix(); fb.setSize(w, h, pr); pts.material.size = 1.6; },
dispose() { disposeScene(scene); fb.dispose(); }
};
} },
{ name: 'Bandada', create({ THREE, renderer, A, mobile }) {
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07060a);
const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
const N = mobile ? 26000 : 64000;
const seed = new Float32Array(N * 4);
for (let i = 0; i < N * 4; i++) seed[i] = Math.random();
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
const uni = { uT: { value: 0 }, uFlow: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 }, uHat: { value: 0 }, uPR: { value: 1 }, uMorph: { value: 0 }, uAudio: { value: A.tex } };
const pts = new THREE.Points(g, new THREE.ShaderMaterial({
uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
vertexShader: NOISE + /* glsl */`
attribute vec4 aSeed; uniform float uT,uFlow,uBass,uMid,uHigh,uBeat,uHat,uPR,uMorph; uniform sampler2D uAudio; varying vec3 vC;
vec3 pal(float t){return 0.5+0.5*cos(6.28318*(t+vec3(0.0,0.33,0.67)));}
void main(){
float t=uFlow*0.18;
float ph=aSeed.w*6.28318+t*1.6;
vec3 ring=vec3(sin(ph)*1.7,sin(ph*2.0)*0.35,cos(ph)*1.7);
vec3 knot=vec3(sin(ph)+2.0*sin(2.0*ph),cos(ph)-2.0*cos(2.0*ph),-sin(3.0*ph))*0.62;
vec3 path=mix(ring,knot,uMorph)*(1.0+uBass*0.35+uBeat*0.15);
vec3 s=aSeed.xyz*6.0;
vec3 n=vec3(snoise(s+vec3(t,0.0,0.0)),snoise(s+vec3(0.0,t,17.0)),snoise(s+vec3(31.0,0.0,t)));
float spread=0.26+uMid*0.9+uBeat*0.35;
vec3 p=path+n*spread*(0.4+aSeed.x*0.8);
vec4 mv=modelViewMatrix*vec4(p,1.0);
gl_Position=projectionMatrix*mv;
float sp=texture2D(uAudio,vec2(0.02+aSeed.w*0.8,0.25)).r;
gl_PointSize=(0.8+aSeed.y*1.4+sp*2.6)*uPR*(4.0/-mv.z);
float tw=step(1.0-uHat*0.08,fract(aSeed.z*57.3+floor(uT*12.0)*0.29))*uHat;
gl_PointSize*=1.0+tw*1.5;
vC=pal(aSeed.w*0.5+uT*0.03)*(0.22+sp*1.1+uHigh*0.25)+vec3(1.0)*tw*1.2;
}`,
fragmentShader: SOFT_POINT_FS
}));
pts.frustumCulled = false;
scene.add(pts);
let dist = 6;
return {
update(dt, t) {
uni.uT.value = t; uni.uFlow.value = A.flow; uni.uBass.value = A.bass; uni.uMid.value = A.mid; uni.uHigh.value = A.high; uni.uBeat.value = A.beat; uni.uHat.value += (A.hat - uni.uHat.value) * Math.min(1, dt * 20);
uni.uMorph.value = smooth(-0.6, 0.6, Math.sin(t * 0.06));
pts.rotation.y += dt * (0.12 + A.mid * 0.3);
pts.rotation.x = Math.sin(t * 0.08) * 0.5;
cam.position.set(0, 0, dist); applyOrbit(THREE, cam, new THREE.Vector3(), A.input);
renderer.render(scene, cam);
},
resize(w, h, pr) { cam.aspect = w / h; dist = 6 * fit(cam.aspect, 1.0); cam.updateProjectionMatrix(); uni.uPR.value = pr; },
dispose() { disposeScene(scene); }
};
} }
];
}
export function applyOrbit(THREE, cam, target, I) {
if (!I || (Math.abs(I.yaw) < 1e-4 && Math.abs(I.pitch) < 1e-4)) { cam.lookAt(target); return; }
const off = cam.position.clone().sub(target);
const s = new THREE.Spherical().setFromVector3(off);
s.theta -= I.yaw; s.phi = Math.min(1.52, Math.max(0.15, s.phi - I.pitch));
off.setFromSpherical(s); cam.position.copy(target).add(off); cam.lookAt(target);
}
export { NOISE, QUAD_VS, SOFT_POINT_FS, WARP_FS, fit, disposeScene, gauss, smooth, makeFeedback };
