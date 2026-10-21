import * as THREE from './lib/three.module.min.js';

// ---------- basics ----------
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.3 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const FOG_CLEAR = new THREE.Color(0xbfe3f5), FOG_SMOG = new THREE.Color(0x8a8270);
scene.fog = new THREE.Fog(FOG_CLEAR.clone(), 40, 210);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 450);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const hemi = new THREE.HemisphereLight(0xcfeeff, 0x5a7a3a, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 160;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(0.5, 0.8, 0.35).normalize();
{
  const g = new THREE.SphereGeometry(400, 32, 16);
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 sunDir; void main(){ float h = max(vP.y,0.); vec3 c = mix(vec3(.80,.91,.97), vec3(.25,.55,.92), pow(h,.55)); if(vP.y<0.) c=vec3(.75,.86,.9); float s = max(dot(vP,sunDir),0.); c += vec3(1.,.9,.6)*(pow(s,600.)*3.+pow(s,8.)*.25); gl_FragColor = vec4(c,1.); }` });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky); window._sky = sky;
}

// ---------- terrain ----------
const Z = { hub: [0, 0], ware: [0, -22], river: [-41, -15], hill: [-44, 28], farm: [44, 30], desert: [0, 58],
  canal: [48, -12], energy: [26, -52], shop: [6, -44], hk: [-28, -56] };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function groundH(x, z) {
  let h = Math.sin(x * 0.05) * Math.cos(z * 0.045) * 0.5 + Math.sin(x * 0.13 + z * 0.07) * 0.2;
  for (const k of ['ware', 'hub', 'shop', 'energy', 'hk', 'canal']) { const [cx, cz] = Z[k]; const d = Math.hypot(x - cx, z - cz); const r = k === 'hk' ? 24 : k === 'canal' ? 28 : 13; if (d < r) h *= smooth(r * 0.6, r, d); }
  const rd = Math.abs(x + 41); if (z > -50 && z < 20) h -= 2.2 * (1 - smooth(2.5, 6, rd)) * (1 - smooth(14, 20, z)) * (1 - smooth(-44, -50, z));
  let dx = x - Z.hill[0], dz = z - Z.hill[1]; h += 7.5 * Math.exp(-(dx * dx + dz * dz) / 160);
  dx = x - 50; dz = z - 30; h += 4 * Math.exp(-(dx * dx + dz * dz) / 220);
  if (z > 46) h += smooth(46, 56, z) * (Math.sin(x * 0.25) * 0.6 + Math.sin(x * 0.11 + z * 0.3) * 0.8 + 0.6) * (z > 70 ? 1.6 : 1);
  if (z < -66 && x < 20) h -= 3 * smooth(-66, -70, z);
  return h;
}
const groundColor = (x, z) => {
  const c = new THREE.Color(0x5f9e3a);
  const n = Math.sin(x * 0.7) * Math.sin(z * 0.6) * 0.06; c.offsetHSL(n * 0.3, 0, n);
  if (z > 46) c.lerp(new THREE.Color(0xe0c07a), smooth(44, 50, z));
  const dh = Math.hypot(x - Z.hill[0], z - Z.hill[1]); if (dh < 16) c.lerp(new THREE.Color(0x8a6a44), 1 - smooth(9, 16, dh));
  if (Math.abs(x + 41) < 5 && z > -48 && z < 18) c.lerp(new THREE.Color(0x6b5a3a), 0.6);
  for (const k of ['ware', 'shop', 'energy']) { const d = Math.hypot(x - Z[k][0], z - Z[k][1]); if (d < 10) c.lerp(new THREE.Color(0x9a9a92), 1 - smooth(8, 10, d)); }
  if (x > -52 && x < -4 && z < -46 && z > -66) c.lerp(new THREE.Color(0x777b80), 0.9);
  if (z < -64 && x < 20) c.lerp(new THREE.Color(0x6a7068), 0.7);
  if (Math.abs(x - 48) < 14 && z < -22 && z > -40) c.lerp(new THREE.Color(0xa88a55), 0.7);
  return c;
};
const groundGeo = new THREE.PlaneGeometry(260, 260, 130, 130); groundGeo.rotateX(-Math.PI / 2);
{
  const p = groundGeo.attributes.position, cols = [];
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, groundH(x, z)); const c = groundColor(x, z); cols.push(c.r, c.g, c.b); }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); groundGeo.computeVertexNormals();
}
const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true })); ground.receiveShadow = true; scene.add(ground);
function recolorGround(fn) {
  const p = groundGeo.attributes.position, col = groundGeo.attributes.color, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); c.setRGB(col.getX(i), col.getY(i), col.getZ(i)); if (fn(x, z, c)) col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true;
}

// ---------- helpers ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = scene, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; }
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (r1, r2, h, s = 12, hs = 1, open = false) => new THREE.CylinderGeometry(r1, r2, h, s, hs, open);
const texCache = {};
function labelTex(text, bg = 'rgba(20,40,60,0.85)', fg = '#fff') {
  const key = text + bg + fg; if (texCache[key]) return texCache[key];
  const w = 512, cv = document.createElement('canvas'); cv.width = w; cv.height = 128; const g = cv.getContext('2d');
  g.font = `bold 60px "PingFang HK","Noto Sans CJK TC","Noto Serif CJK TC","Microsoft JhengHei",sans-serif`;
  const tw = Math.min(w - 8, g.measureText(text).width + 50);
  g.fillStyle = bg; const x0 = (w - tw) / 2; g.beginPath(); g.roundRect ? g.roundRect(x0, 14, tw, 100, 40) : g.rect(x0, 14, tw, 100); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 66, w - 40);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; texCache[key] = t; return t;
}
function label(text, x, y, z, s = 1, bg, fg, parent = scene) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(text, bg || undefined, fg || undefined), depthWrite: false }));
  sp.scale.set(4 * s, 1 * s, 1); sp.position.set(x, y, z); parent.add(sp); return sp;
}
const G = (x, z) => groundH(x, z);
const dotTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
function particles(n, color, size, opts = {}) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({ color, size, map: dotTex, transparent: true, opacity: opts.opacity ?? 0.8, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  pts.userData.seed = new Float32Array(n).map(() => Math.random()); return pts;
}
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- scenery ----------
{
  const pts = [];
  for (let i = 0; i < 1200 && pts.length < 260; i++) {
    const x = rand(-125, 125), z = rand(-125, 125);
    if (Math.hypot(x, z) < 14) continue;
    let bad = false; for (const k in Z) if (Math.hypot(x - Z[k][0], z - Z[k][1]) < (k === 'hk' ? 30 : k === 'canal' ? 30 : 18)) bad = true;
    if (bad || z > 42 || (Math.abs(x + 41) < 7 && z < 22) || z < -64) continue;
    pts.push([x, z]);
  }
  const trunk = new THREE.InstancedMesh(C(0.15, 0.25, 1.6, 6), M(0x6b4a2b), pts.length);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 3.2, 7), M(0xffffff), pts.length);
  const crown2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.4, 0), M(0xffffff), pts.length);
  const d = new THREE.Object3D(), col = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  pts.forEach(([x, z], i) => {
    const s = rand(0.8, 1.6), y = G(x, z);
    d.position.set(x, y + 0.8 * s, z); d.scale.set(s, s, s); d.rotation.set(0, rand(0, 6), 0); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix);
    const pine = i % 2 === 0; d.position.y = y + (pine ? 2.8 : 2.4) * s; d.updateMatrix();
    (pine ? crown : crown2).setMatrixAt(i, d.matrix); (pine ? crown2 : crown).setMatrixAt(i, zero);
    col.setHSL(0.28 + rand(-0.04, 0.04), 0.5, rand(0.25, 0.38)); crown.setColorAt(i, col); crown2.setColorAt(i, col);
  });
  for (const m of [trunk, crown, crown2]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  const mt = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshLambertMaterial({ color: 0x6f8f9a }), 40);
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, r = rand(150, 175), h = rand(18, 45); d.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); d.scale.set(rand(20, 35), h, rand(20, 35)); d.rotation.set(0, rand(0, 3), 0); d.updateMatrix(); mt.setMatrixAt(i, d.matrix); }
  scene.add(mt);
  const cl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf4f8ff, fog: false, transparent: true, opacity: 0.92 }), 60);
  for (let i = 0; i < 60; i++) { const cx = rand(-200, 200), cz = rand(-200, 200); d.position.set(cx, rand(80, 100), cz); d.scale.set(rand(6, 12), rand(2.5, 4), rand(5, 9)); d.rotation.set(0, rand(0, 3), 0); d.updateMatrix(); cl.setMatrixAt(i, d.matrix); }
  scene.add(cl);
  const rk = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), M(0x8a8a84), 120);
  for (let i = 0; i < 120; i++) { const x = rand(-110, 110), z = rand(-60, 110); d.position.set(x, G(x, z) + 0.1, z); const s = rand(0.4, 1.4); d.scale.set(s, s * 0.6, s); d.rotation.set(rand(0, 3), rand(0, 3), 0); d.updateMatrix(); rk.setMatrixAt(i, d.matrix); }
  rk.castShadow = true; scene.add(rk);
  const gr = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.6, 3), M(0x5aa83a), 1500);
  let gi = 0; for (let i = 0; i < 5000 && gi < 1500; i++) { const x = rand(-80, 80), z = rand(-60, 44); if (Math.abs(x + 41) < 7 || Math.hypot(x - Z.hill[0], z - Z.hill[1]) < 14 || Math.hypot(x - Z.ware[0], z - Z.ware[1]) < 11) continue; d.position.set(x, G(x, z) + 0.25, z); d.scale.set(1, rand(0.6, 1.4), 1); d.rotation.set(rand(-.3, .3), rand(0, 3), 0); d.updateMatrix(); gr.setMatrixAt(gi++, d.matrix); }
  gr.count = gi; scene.add(gr);
}

// ---------- player & input ----------
const player = { pos: new THREE.Vector3(0, 0, 6), yaw: 0, pitch: -0.05 };
const keys = {}; let started = false, paused = true;
addEventListener('keydown', e => { keys[e.code] = true; if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) { e.preventDefault(); action(); } });
addEventListener('keyup', e => keys[e.code] = false);
const cv = renderer.domElement;
cv.addEventListener('mousedown', e => { if (isTouch || paused) return; if (document.pointerLockElement !== cv) cv.requestPointerLock?.(); else action(); });
addEventListener('mousemove', e => { if (document.pointerLockElement === cv) { player.yaw -= e.movementX * 0.0024; player.pitch = Math.max(-1.3, Math.min(1.2, player.pitch - e.movementY * 0.0024)); } });
const joy = { id: null, x: 0, y: 0 }, look = { id: null, lx: 0, ly: 0 };
const joyEl = $('joy'), knob = $('knob');
if (isTouch) { joyEl.style.display = 'block'; $('act').style.display = 'block'; }
const inModal = e => e.target.closest && e.target.closest('.modal');
function updJoy(t) { const r = joyEl.getBoundingClientRect(); let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2); const L = Math.hypot(dx, dy), mx = r.width / 2; if (L > mx) { dx *= mx / L; dy *= mx / L; } joy.x = dx / mx; joy.y = dy / mx; knob.style.transform = `translate(${dx}px,${dy}px)`; }
document.addEventListener('touchstart', e => {
  if (inModal(e)) return; e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.4 && joy.id === null) { joy.id = t.identifier; updJoy(t); }
    else if (look.id === null) { look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY; }
  }
}, { passive: false });
document.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joy.id) updJoy(t);
    else if (t.identifier === look.id) { player.yaw -= (t.clientX - look.lx) * 0.006; player.pitch = Math.max(-1.3, Math.min(1.2, player.pitch - (t.clientY - look.ly) * 0.005)); look.lx = t.clientX; look.ly = t.clientY; }
  }
}, { passive: false });
function onTE(e) { for (const t of e.changedTouches) { if (t.identifier === joy.id) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; } if (t.identifier === look.id) look.id = null; } }
document.addEventListener('touchend', onTE); document.addEventListener('touchcancel', onTE);
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
function fastBtn(el, fn) { el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false }); el.addEventListener('click', e => { e.stopPropagation(); fn(); }); el.addEventListener('mousedown', e => e.stopPropagation()); }
fastBtn($('act'), () => action());
fastBtn($('tp'), () => teleportToTask());

// ---------- interaction system ----------
const inter = [], slots = [];
let carried = null, focus = null;
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffe36e })); ring.rotation.x = -Math.PI / 2; scene.add(ring); ring.visible = false;
function addPickup(obj, name, kind, task, extra = {}) { const it = { type: 'pickup', obj, name, kind, task, ...extra }; inter.push(it); return it; }
function addSwitch(obj, name, task, onUse, verb = '使用') { const it = { type: 'switch', obj, name, task, onUse, verb }; inter.push(it); return it; }
function addDispenser(obj, name, task, make) { const it = { type: 'disp', obj, name, task, make }; inter.push(it); return it; }
function addSlot(pos, name, task, accepts, onPlace, opts = {}) {
  const s = { pos: pos.clone(), name, task, accepts, onPlace, multi: !!opts.multi, filled: false, enabled: opts.enabled ?? true, marker: null };
  const mk = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 24), new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  mk.rotation.x = -Math.PI / 2; mk.position.copy(pos); mk.position.y += 0.08; scene.add(mk); s.marker = mk; mk.visible = false;
  slots.push(s); return s;
}
function removeInter(it) { const i = inter.indexOf(it); if (i >= 0) inter.splice(i, 1); }
const tmpV = new THREE.Vector3();
function computeFocus() {
  const t = curTask(); if (!t) return null;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  let best = null, bs = -1e9;
  const list = carried ? slots.filter(s => s.task === t.id && s.enabled && (!s.filled || s.multi) && s.reach !== 0).map(s => ({ s, p: s.pos })) : inter.filter(i => i.task === t.id && !i.done).map(i => ({ i, p: i.obj.getWorldPosition(new THREE.Vector3()) }));
  for (const c of list) {
    const dx = c.p.x - player.pos.x, dz = c.p.z - player.pos.z, d = Math.hypot(dx, dz);
    const reach = (c.s && c.s.reach) || (c.i && c.i.reach) || 4.6; if (d > reach) continue;
    const cos = d < 0.6 ? 1 : (dx * fx + dz * fz) / d; if (cos < 0.6) continue;
    const sc = cos * 2 - d * 0.25; if (sc > bs) { bs = sc; best = c; }
  }
  return best;
}
function action() {
  if (paused) return;
  const t = curTask(); if (!t) return;
  if (carried) {
    if (focus && focus.s) {
      const s = focus.s, r = s.accepts(carried);
      if (r === true) placeInSlot(carried, s);
      else { mistakes++; toast(typeof r === 'string' ? r : '這裏不適合放「' + carried.name + '」', 'bad'); sfx(180, 0.25); }
    } else {
      const it = carried; carried = null; const px = player.pos.x - Math.sin(player.yaw) * 1.5, pz = player.pos.z - Math.cos(player.yaw) * 1.5;
      it.obj.position.set(px, Math.max(G(px, pz), -0.3) + 0.05, pz); it.obj.rotation.set(0, 0, 0); it.float = false; inter.push(it); toast('放下了「' + it.name + '」');
    }
    return;
  }
  if (!focus || !focus.i) return;
  const it = focus.i;
  if (it.type === 'pickup') { carried = it; removeInter(it); sfx(520, 0.08); if (it.onPick) it.onPick(); }
  else if (it.type === 'disp') { carried = it.make(); sfx(520, 0.08); }
  else if (it.type === 'switch') it.onUse(it);
  else if (it.type === 'push') pushBlock(it, 1.0);
}
function placeInSlot(it, s) {
  carried = null; sfx(760, 0.12); sfx(990, 0.12, 0.08);
  it.obj.position.copy(s.pos); it.obj.rotation.set(0, 0, 0);
  if (!s.multi) { s.filled = true; s.marker.visible = false; }
  s.onPlace(it, s); addScore(10);
}
function addPush(obj, name, task, slotList) { const it = { type: 'push', obj, name, task, slotList, reach: 3.2 }; inter.push(it); return it; }
function pushBlock(it, amt, dirx, dirz) {
  if (it.done) return;
  if (dirx === undefined) { const dx = it.obj.position.x - player.pos.x, dz = it.obj.position.z - player.pos.z; if (Math.abs(dx) > Math.abs(dz)) { dirx = Math.sign(dx); dirz = 0; } else { dirx = 0; dirz = Math.sign(dz); } }
  const p = it.obj.position; p.x += dirx * amt; p.z += dirz * amt;
  p.x = Math.max(-16, Math.min(16, p.x)); p.z = Math.max(46, Math.min(66, p.z)); p.y = G(p.x, p.z) + 0.12;
  for (const s of it.slotList) if (!s.filled && Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 1.0) { p.copy(s.pos); s.filled = true; s.marker.visible = false; it.done = true; removeInter(it); s.onPlace(it, s); addScore(10); sfx(760, 0.12); sfx(990, 0.12, 0.08); break; }
}

// ---------- audio ----------
let actx = null;
function sfx(f, d, delay = 0) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; o.type = 'triangle'; g.gain.setValueAtTime(0.15, actx.currentTime + delay); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + delay + d); o.connect(g).connect(actx.destination); o.start(actx.currentTime + delay); o.stop(actx.currentTime + delay + d + 0.02); } catch (e) { } }

// ---------- HUD ----------
let score = 0, mistakes = 0, toastT = 0;
function addScore(n) { score += n; $('score').textContent = score; }
function toast(msg, cls = 'good', time = 2.8) { const el = $('toast'); el.innerHTML = msg; el.className = 'panel ' + cls; el.style.display = 'block'; toastT = time; }
function showModal(html, btn, cb) {
  const m = $('modal'); $('card').innerHTML = html + `<button class="go">${btn}</button>`; m.style.display = 'flex'; paused = true; document.exitPointerLock?.();
  joy.id = look.id = null; joy.x = joy.y = 0; knob.style.transform = '';
  const go = $('card').querySelector('.go'); let used = false; const f = e => { e.preventDefault(); e.stopPropagation(); if (used) return; used = true; m.style.display = 'none'; paused = false; cb && cb(); if (!isTouch && !window.__test) cv.requestPointerLock?.(); };
  go.addEventListener('touchstart', f, { passive: false }); go.addEventListener('click', f);
}

// ---------- item factory ----------
function item(build, name, labelBg) { const g = new THREE.Group(); build(g); const lb = label(name || ' ', 0, 1.25, 0, 0.55, labelBg, null, g); lb.visible = !!name; g.userData.label = lb; scene.add(g); return g; }
const S = {
  bottle: g => { mesh(C(0.13, 0.13, 0.55), M(0x6fc6ff, { transparent: true, opacity: 0.75, roughness: 0.1 }), 0, 0.3, 0, g); mesh(C(0.06, 0.06, 0.1), M(0x1a5fd0), 0, 0.62, 0, g); },
  chair: g => { const w = M(0xa8743f); mesh(B(0.6, 0.08, 0.6), w, 0, 0.45, 0, g); mesh(B(0.6, 0.6, 0.08), w, 0, 0.78, -0.26, g); for (const [x, z] of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]]) mesh(B(0.07, 0.45, 0.07), w, x, 0.22, z, g); },
  sweater: g => { const w = M(0xe8d8b8, { roughness: 1 }); mesh(B(0.6, 0.6, 0.18), w, 0, 0.35, 0, g); mesh(B(1.05, 0.16, 0.16), w, 0, 0.58, 0, g); },
  cheese: g => { const m = mesh(C(0.35, 0.35, 0.25, 3), M(0xffcf3a), 0, 0.15, 0, g); m.rotation.y = 0.5; },
  coal: g => { for (let i = 0; i < 5; i++) mesh(new THREE.DodecahedronGeometry(0.18, 0), M(0x1c1c1c, { roughness: 0.6 }), rand(-.2, .2), 0.18 + (i > 2 ? 0.2 : 0), rand(-.2, .2), g); },
  barrel: g => { mesh(C(0.28, 0.28, 0.7, 14), M(0x223344, { metalness: 0.5, roughness: 0.4 }), 0, 0.36, 0, g); mesh(C(0.29, 0.29, 0.06, 14), M(0xd23b2b), 0, 0.5, 0, g); },
  paper: g => { for (let i = 0; i < 5; i++) mesh(B(0.5, 0.03, 0.7), M(0xf6f3ea), rand(-.02, .02), 0.05 + i * 0.035, 0, g); },
  egg: g => { mesh(new THREE.SphereGeometry(0.15, 10, 8), M(0xf3e2c4), 0, 0.2, 0, g).scale.y = 1.3; mesh(new THREE.SphereGeometry(0.15, 10, 8), M(0xf3e2c4), 0.25, 0.2, 0, g).scale.y = 1.3; },
  rubbish: c => g => { const m = mesh(c === 'bag' ? new THREE.IcosahedronGeometry(0.3, 0) : C(0.1, 0.1, 0.45, 8), M(c === 'bag' ? 0xf2f2f2 : c === 'can' ? 0xd23b2b : 0x5ac8fa, { roughness: 0.5 }), 0, 0.15, 0, g); m.rotation.z = Math.PI / 2; },
  sapling: g => { mesh(C(0.25, 0.2, 0.25), M(0x8a5a3a), 0, 0.12, 0, g); mesh(C(0.04, 0.05, 0.6, 5), M(0x6b4a2b), 0, 0.5, 0, g); mesh(new THREE.IcosahedronGeometry(0.28, 0), M(0x4caf50), 0, 0.85, 0, g); },
  fruitTree: g => { mesh(C(0.25, 0.2, 0.25), M(0x8a5a3a), 0, 0.12, 0, g); mesh(C(0.05, 0.06, 0.6, 5), M(0x6b4a2b), 0, 0.5, 0, g); mesh(new THREE.IcosahedronGeometry(0.35, 0), M(0x3f9a3a), 0, 0.9, 0, g); for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(0.07, 6, 4), M(0xff7a1a), Math.cos(i * 1.6) * 0.3, 0.85 + (i % 2) * 0.15, Math.sin(i * 1.6) * 0.3, g, false); },
  shrub: g => { mesh(new THREE.IcosahedronGeometry(0.35, 0), M(0x7a9a3a), 0, 0.3, 0, g); mesh(new THREE.IcosahedronGeometry(0.25, 0), M(0x8ab04a), 0.25, 0.25, 0.1, g); },
  crop: g => { for (let i = 0; i < 6; i++) mesh(C(0.02, 0.03, 0.8, 4), M(0xd8c050), rand(-.15, .15), 0.4, rand(-.15, .15), g, false); mesh(C(0.2, 0.2, 0.1, 8), M(0xb08a40), 0, 0.4, 0, g); },
  pipe: g => { mesh(C(0.45, 0.45, 2.2, 14, 1, true), M(0x9aa4ac, { metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }), 0, 0.5, 0, g).rotation.x = Math.PI / 2; mesh(C(0.47, 0.47, 0.25, 14), M(0x2f6fd0), 0, 0.5, 0, g).rotation.x = Math.PI / 2; },
  valve: g => { mesh(C(0.5, 0.5, 0.2, 16), M(0x3a7a5a, { metalness: .4 }), 0, 0.5, 0, g).rotation.x = Math.PI / 2; mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), M(0xd23b2b), 0, 0.5, 0.15, g); },
  turbine: g => { mesh(C(0.08, 0.14, 2.2, 8), M(0xf2f2f2), 0, 1.1, 0, g); const h = new THREE.Group(); h.position.set(0, 2.2, 0.15); g.add(h); for (let i = 0; i < 3; i++) { const pv = new THREE.Group(); pv.rotation.z = i * 2.094; h.add(pv); mesh(B(0.12, 1.1, 0.04), M(0xffffff), 0, 0.55, 0, pv); } g.userData.hub = h; },
  solar: g => { mesh(C(0.05, 0.05, 0.6, 6), M(0x888888), 0, 0.3, 0, g); mesh(B(1.2, 0.05, 0.8), M(0x1d3c8a, { metalness: 0.6, roughness: 0.2 }), 0, 0.65, 0, g).rotation.x = -0.5; },
  hydro: g => { mesh(B(0.8, 0.6, 0.6), M(0x2f8fd0, { metalness: 0.3 }), 0, 0.3, 0, g); mesh(C(0.3, 0.3, 0.2, 10), M(0xdddddd), 0, 0.3, 0.38, g).rotation.x = Math.PI / 2; },
  gas: g => { mesh(C(0.3, 0.3, 0.8, 12), M(0x4aa3ff, { metalness: 0.3, roughness: 0.3 }), 0, 0.45, 0, g); mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, 6.3, 0, 1.6), M(0x4aa3ff), 0, 0.85, 0, g); },
  plug: g => { mesh(B(0.18, 0.28, 0.12), M(0x2a2a2a), 0, 0.15, 0, g); mesh(B(0.04, 0.1, 0.04), M(0xd9b23a, { metalness: 0.8 }), 0, 0.33, 0, g); },
  box: c => g => { mesh(B(0.5, 0.5, 0.5), M(c), 0, 0.25, 0, g); },
};
function spawn(shape, name, x, z, task, kind, extra = {}) { const o = item(shape, name, extra.labelBg); o.position.set(x, extra.y ?? G(x, z), z); return addPickup(o, name, kind, task, extra); }

// ---------- task framework ----------
const tasks = []; let ti = 0;
const SKIP = new Set([1, 6, 9, 10, 11]);
const active = () => tasks.filter(t => !SKIP.has(t.id));
const curTask = () => tasks[ti];
const nextTi = i => { let j = i + 1; while (j < tasks.length && SKIP.has(j)) j++; return j; };
const effects = [];
function defTask(t) { t.id = tasks.length; t.done = 0; tasks.push(t); return t; }
function progress(t, n = 1) { t.done += n; updateHUD(); if (t.done >= t.total) setTimeout(() => completeTask(t), 1100); }
function completeTask(t) {
  if (t.finished) return; t.finished = true; addScore(30); sfx(660, .15); sfx(880, .15, .12); sfx(1180, .25, .24);
  if (carried) { scene.remove(carried.obj); carried = null; }
  t.onDone && t.onDone(); updateHUD();
  const last = nextTi(t.id) >= tasks.length;
  showModal(`<h1>✅ 完成：${t.title}</h1>${t.lesson}`, last ? '查看成績 🎉' : '下一個任務 ➡', () => { if (last) finale(); else { ti = nextTi(ti); startTask(); } });
}
function startTask() { const t = curTask(); slots.forEach(s => { s.marker.visible = s.task === t.id && s.enabled && (!s.filled || s.multi); }); t.onStart && t.onStart(); updateHUD(); toast('新任務：' + t.title + '<br><small>跟着黃色箭咀前往，或按「傳送到任務」</small>', 'good', 3); }
function updateHUD() {
  const t = curTask(); if (!t) return;
  $('ttitle').textContent = `任務 ${active().indexOf(t) + 1}／${active().length}：${t.title}`; $('tdesc').innerHTML = t.desc + ` <b>(${Math.min(t.done, t.total)}/${t.total})</b>`;
  $('tbar').firstElementChild.style.width = (100 * Math.min(1, t.done / t.total)) + '%';
  $('tcount').textContent = `${active().filter(x => x.finished).length}/${active().length}`;
}
function teleportToTask() { const t = curTask(); if (!t || paused) return; player.pos.set(t.spawn[0], 0, t.spawn[1]); player.yaw = t.spawn[2] ?? 0; player.pitch = -0.2; toast('已傳送到：' + t.zone); }
const beacon = new THREE.Mesh(C(0.5, 0.5, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe36e, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false })); scene.add(beacon);
function zoneSign(text, x, z, h = 5) { const y = G(x, z); mesh(C(0.1, 0.1, h, 6), M(0x7a5a3a), x - 1.6, y + h / 2, z); mesh(C(0.1, 0.1, h, 6), M(0x7a5a3a), x + 1.6, y + h / 2, z); label(text, x, y + h, z, 1.3, 'rgba(30,110,60,0.92)'); }
function crateAt(x, z, txt) { const g = new THREE.Group(); g.position.set(x, G(x, z), z); scene.add(g); mesh(B(1.4, 0.8, 1), M(0xa8743f), 0, 0.4, 0, g); mesh(B(1.5, 0.08, 1.1), M(0x7a4a2a), 0, 0.8, 0, g); label(txt, x, g.position.y + 2.3, z, 0.75); return g; }

// ===== 1. 資源分類倉庫 =====
{
  const [cx, cz] = Z.ware; zoneSign('資源分類倉庫', cx, cz + 9);
  mesh(B(20, 0.3, 14), M(0xbdb6a8), cx, 0.0, cz, scene, false);
  for (const [x, z] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) mesh(C(0.3, 0.3, 6, 10), M(0xe8e2d6), cx + x, 3, cz + z);
  mesh(B(21, 0.4, 15), M(0xb04a2a), cx, 6.1, cz);
  const t = defTask({ zone: '資源分類倉庫', title: '天然資源分類', total: 8, spawn: [0, -13, 0],
    desc: '把桌上的物品<b>拿起</b>，放進正確的資源箱：<span class=hl>水資源／植物資源／動物資源／礦產資源</span>。想想它由甚麼天然資源製成！',
    lesson: `<p>人類的生活離不開<b>天然資源</b>：</p><ul><li>💧 <b>水資源</b>：食水、灌溉</li><li>🌳 <b>植物資源</b>：木製家具、紙張</li><li>🐑 <b>動物資源</b>：羊毛衣、芝士（由牛奶製成）、雞蛋</li><li>⛏️ <b>礦產資源</b>：煤、石油</li></ul>` });
  const bins = [['水資源', 'water', 0x2f8fe0], ['植物資源', 'plant', 0x3faa4a], ['動物資源', 'animal', 0xe0902f], ['礦產資源', 'mineral', 0x6a6a6a]];
  const hints = { water: '它是水嗎？', plant: '它是由植物製成的嗎？', animal: '它來自動物嗎？', mineral: '它是從地底開採的礦產嗎？' };
  const why = { '羊毛衣': '羊毛來自綿羊，是<b>動物資源</b>！', '芝士': '芝士由牛奶製成，是<b>動物資源</b>！', '木製家具': '木材來自樹木，是<b>植物資源</b>！', '煤': '煤從地底開採，是<b>礦產資源</b>！', '石油': '石油從地底開採，是<b>礦產資源</b>！', '礦泉水': '飲用水是<b>水資源</b>！', '紙張': '紙張由木材製成，是<b>植物資源</b>！', '雞蛋': '雞蛋來自母雞，是<b>動物資源</b>！' };
  bins.forEach(([n, k, c], i) => {
    const x = cx - 7.5 + i * 5, z = cz - 4.5; const bx = new THREE.Group(); bx.position.set(x, 0.15, z); scene.add(bx);
    mesh(B(2.6, 1.3, 1.8), M(c), 0, 0.65, 0, bx); mesh(B(2.3, 0.1, 1.5), M(0x222222), 0, 1.31, 0, bx);
    label(n, x, 2.4, z, 0.9, '#' + c.toString(16).padStart(6, '0'));
    addSlot(new THREE.Vector3(x, 1.4, z + 0.3), n, t.id, it => it.kind === k ? true : '不對啊！' + hints[k] + '<br>「' + it.name + '」應該放在別的資源箱。', it => { it.obj.visible = false; toast('✔ ' + why[it.name], 'good'); bx.scale.y = 1.15; setTimeout(() => bx.scale.y = 1, 200); progress(t); }, { multi: true }).reach = 3.6;
  });
  mesh(B(14.5, 0.15, 2.2), M(0x9a6a3a), cx, 0.95, cz + 3); for (const x of [-6.8, 6.8]) mesh(B(0.2, 0.9, 1.8), M(0x7a4a2a), cx + x, 0.5, cz + 3);
  [[S.bottle, '礦泉水', 'water'], [S.chair, '木製家具', 'plant'], [S.sweater, '羊毛衣', 'animal'], [S.cheese, '芝士', 'animal'], [S.coal, '煤', 'mineral'], [S.barrel, '石油', 'mineral'], [S.paper, '紙張', 'plant'], [S.egg, '雞蛋', 'animal']]
    .forEach(([sh, n, k], i) => spawn(sh, n, cx - 6.1 + i * 1.75, cz + 3, t.id, k, { y: 1.03 }));
}

// ===== 2-3. River =====
const riverMat = new THREE.MeshStandardMaterial({ color: 0x6a6a30, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 });
const river = mesh(new THREE.PlaneGeometry(10, 70, 1, 1), riverMat, -41, -0.75, -15, scene, false); river.rotation.x = -Math.PI / 2;
let riverClean = 0;
{
  zoneSign('河流', -33, -2);
  mesh(B(12, 0.3, 2.6), M(0x9a7a5a), -41, 0.4, 8); for (const z of [6.8, 9.2]) mesh(B(12, 0.6, 0.12), M(0x7a5a3a), -41, 0.85, z);
  const t = defTask({ zone: '河流', title: '撈走河中垃圾', total: 6, spawn: [-34, -12, Math.PI / 2],
    desc: '河水被垃圾<b>污染</b>了！走到河邊，把浮在河上的垃圾<b>撈起</b>，放進岸上的<span class=hl>垃圾桶</span>。',
    lesson: `<p>人們隨便把垃圾拋進河裏，令<b>水質污染</b>。</p><p>河水是寶貴的<b>水資源</b>，污染了就不能飲用，魚類等生物也難以生存。</p>` });
  [['膠樽', 'bottle'], ['膠袋', 'bag'], ['汽水罐', 'can'], ['膠袋', 'bag'], ['膠樽', 'bottle'], ['汽水罐', 'can']]
    .forEach(([n, k], i) => { const it = spawn(S.rubbish(k), n, -39.3 - (i % 2) * 1.4, -28 + i * 4.4, t.id, 'trash', { y: -0.85 }); it.float = true; });
  const by = G(-35, -14); const bin = new THREE.Group(); bin.position.set(-35, by, -14); scene.add(bin); mesh(C(0.55, 0.45, 1.2, 12), M(0x2f7a3a), 0, 0.6, 0, bin); label('垃圾桶', -35, by + 2, -14, 0.7);
  addSlot(new THREE.Vector3(-35, by + 1.2, -14), '垃圾桶', t.id, it => it.kind === 'trash', it => { it.obj.visible = false; riverClean = Math.min(0.5, riverClean + 0.085); progress(t); }, { multi: true }).reach = 5;
  effects.push((dt, T) => { for (const i of inter) if (i.float) i.obj.position.y = -0.85 + Math.sin(T * 2 + i.obj.position.z) * 0.07; });

  const t3 = defTask({ zone: '河流', title: '堵截污水排放', total: 2, spawn: [-34, -27, Math.PI / 2],
    desc: '工廠水管正把<b>污水</b>排進河流，下游<span class=hl>食水廠</span>不能取水！① 拿起<b>污水處理閥</b>，裝在水管出口　② 到下游按<b>食水廠開關</b>。',
    lesson: `<p><b>因果關係：</b>污水排入河流 ➜ <b>水質污染</b> ➜ <b>影響食水供應</b>。</p><p>堵截污水、處理後才排放，河水才可以重新成為安全的食水來源，魚兒也回來了！🐟</p>` });
  const fy = G(-30, -35); const fac = new THREE.Group(); fac.position.set(-30, fy, -35); scene.add(fac);
  mesh(B(5, 4, 5), M(0x8a8a90), 0, 2, 0, fac); mesh(C(0.4, 0.5, 4), M(0x7a6060), 1.5, 6, 1.5, fac); label('工廠', -30, fy + 5, -32, 0.8);
  mesh(C(0.35, 0.35, 8, 12), M(0x556066, { metalness: 0.5 }), -35.5, 0.2, -32.5).rotation.z = Math.PI / 2;
  const plume = particles(220, 0x3a3020, 0.9, { opacity: 0.85 }); let plumeOn = 1.01;
  effects.push((dt, T) => { const p = plume.geometry.attributes.position, sd = plume.userData.seed; for (let i = 0; i < sd.length; i++) { const f = (sd[i] + T * 0.12) % 1; const on = plumeOn > sd[i]; p.setXYZ(i, on ? -39.6 - Math.sin(i) * f * 2 : 0, on ? (f < 0.04 ? 0.1 - f * 20 : -0.7) : -50, -32.5 + f * 30); } p.needsUpdate = true; });
  spawn(S.valve, '污水處理閥', -33, -28, t3.id, 'valve');
  addSlot(new THREE.Vector3(-39.4, -0.3, -32.5), '水管出口', t3.id, it => it.kind === 'valve', it => { it.obj.rotation.y = Math.PI / 2; it.obj.userData.label.visible = false; plumeOn = 0; riverClean = 0.7; progress(t3); toast('污水停止排放！再去開啟食水廠。'); }).reach = 5.5;
  const wy = G(-33, 4); const ww = new THREE.Group(); ww.position.set(-33, wy, 4); scene.add(ww);
  const resMat = new THREE.MeshStandardMaterial({ color: 0x7a6a3a, roughness: 0.2 });
  mesh(C(1.6, 1.6, 2.2, 16), M(0xd8d8d0), 0, 1.1, 0, ww); mesh(C(1.45, 1.45, 0.1, 16), resMat, 0, 2.21, 0, ww); label('食水廠', -33, wy + 3.4, 4, 0.8);
  const btn = new THREE.Group(); btn.position.set(-31, G(-31, 1.5), 1.5); scene.add(btn); mesh(B(0.5, 1, 0.3), M(0x444444), 0, 0.5, 0, btn); const lamp = mesh(new THREE.SphereGeometry(0.15, 8, 6), M(0xff3030, { emissive: 0x880000 }), 0, 1.1, 0, btn);
  addSwitch(btn, '食水廠開關', t3.id, it => { if (plumeOn) { mistakes++; toast('河水仍被污水污染，不能抽取作食水！<br>先安裝污水處理閥。', 'bad'); return; } it.done = true; lamp.material.color.set(0x30ff60); lamp.material.emissive.set(0x00aa30); riverClean = 1; resMat.color.set(0x2f8fe0); progress(t3); toast('河水乾淨，食水供應恢復！💧'); }, '開啟');
  const fish = new THREE.InstancedMesh(new THREE.ConeGeometry(0.15, 0.5, 5), M(0xff8a2a), 8); fish.visible = false; scene.add(fish); const fd = new THREE.Object3D();
  const dirty = new THREE.Color(0x6a6a30), clean = new THREE.Color(0x2c8ac0);
  effects.push((dt, T) => { riverMat.color.lerpColors(dirty, clean, riverClean); fish.visible = riverClean > 0.95; if (fish.visible) { for (let i = 0; i < 8; i++) { fd.position.set(-41 + Math.sin(T * 0.7 + i) * 2.5, -0.95, -15 + ((T * 1.5 + i * 8) % 60) - 30); fd.rotation.set(Math.PI / 2, 0, 0); fd.updateMatrix(); fish.setMatrixAt(i, fd.matrix); } fish.instanceMatrix.needsUpdate = true; } });
}

// ===== 4. Hill =====
{
  const [hx, hz] = Z.hill; zoneSign('山坡', -27, 24);
  const t = defTask({ zone: '山坡', title: '山坡植樹，防止水土流失', total: 6, spawn: [-25, 30, Math.PI / 2],
    desc: '山坡的樹木被<b>過度砍伐</b>，下雨時泥土被沖走，山腳村屋<b>水浸</b>！從<b>樹苗箱</b>拿樹苗，種在山坡的<span class=hl>綠色圓圈</span>上。',
    lesson: `<p><b>過度砍伐、過度放牧、開墾土地</b> ➜ 地面失去植物保護 ➜ <b>風雨侵蝕、水土流失</b> ➜ 河道淤塞，容易發生<b>水災、水浸</b>；動物的<b>棲息地減少</b>。</p><p>植物的根能<b>抓緊泥土</b>。你看，雨水不再把泥土沖下山，水浸也退了！</p><p><b>小總結：不當使用天然資源，會破壞生態環境。</b></p>` });
  const st = new THREE.InstancedMesh(C(0.25, 0.3, 0.4, 7), M(0x7a5a3a), 16); const d = new THREE.Object3D();
  for (let i = 0; i < 16; i++) { const a = i * 0.7, r = 3 + (i % 4) * 2.2; const x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r; d.position.set(x, G(x, z) + 0.15, z); d.updateMatrix(); st.setMatrixAt(i, d.matrix); }
  st.castShadow = true; scene.add(st);
  const hs = new THREE.Group(); hs.position.set(-27, G(-27, 38), 38); scene.add(hs); mesh(B(4, 2.6, 3.5), M(0xf0e0c0), 0, 1.3, 0, hs); mesh(new THREE.ConeGeometry(3.3, 1.6, 4), M(0xb04a2a), 0, 3.4, 0, hs).rotation.y = Math.PI / 4; label('村屋', -27, hs.position.y + 5, 38, 0.7);
  const floodMat = new THREE.MeshStandardMaterial({ color: 0x7a5a30, transparent: true, opacity: 0.85, roughness: 0.3 });
  const flood = mesh(new THREE.CircleGeometry(8, 24), floodMat, -28, 0, 37, scene, false); flood.rotation.x = -Math.PI / 2; let floodLvl = G(-28, 37) + 0.6, planted = 0; const base = floodLvl - 0.6;
  const holes = [], growing = [];
  for (let i = 0; i < 6; i++) { const z = hz - 6.5 + i * 2.6, x = hx + 5.5 + (i % 2) * 1.6; holes.push([x, z]); addSlot(new THREE.Vector3(x, G(x, z), z), '樹洞', t.id, it => it.kind === 'sapling', it => { it.obj.userData.label.visible = false; growing.push(it.obj); planted++; progress(t); }); }
  const crate = crateAt(-31, 30, '樹苗箱（拿樹苗）');
  for (let i = 0; i < 3; i++) { const sp = item(S.sapling, '', null); scene.remove(sp); crate.add(sp); sp.position.set(-0.4 + i * 0.4, 0.8, 0); sp.scale.setScalar(0.7); }
  addDispenser(crate, '樹苗', t.id, () => ({ type: 'pickup', obj: item(S.sapling, '樹苗'), name: '樹苗', kind: 'sapling', task: t.id }));
  const rain = particles(isTouch ? 500 : 900, 0xaaccff, 0.14, { opacity: 0.6 });
  const mud = particles(240, 0x6a4a20, 0.6, { opacity: 0.9 });
  effects.push((dt, T) => {
    const raining = Math.hypot(player.pos.x - hx, player.pos.z - hz) < 50 && ti <= t.id + 1; rain.visible = mud.visible = raining;
    if (raining) {
      const p = rain.geometry.attributes.position, sd = rain.userData.seed; for (let i = 0; i < sd.length; i++) { const f = (sd[i] * 7 + T * 1.6) % 1; p.setXYZ(i, hx + 8 + Math.sin(i * 12.9) * 16, 15 - f * 16, hz + Math.cos(i * 7.3) * 16); } p.needsUpdate = true;
      const frac = 1 - planted / 6; const m = mud.geometry.attributes.position, ms = mud.userData.seed;
      for (let i = 0; i < ms.length; i++) { const on = ms[i] < frac; const f = (ms[i] * 3 + T * 0.25) % 1; const lane = holes[i % 6]; const x = hx + 1 + f * 16, z = lane[1] + Math.sin(i) * 0.8 + f * 5; m.setXYZ(i, on ? x : 0, on ? G(x, z) + 0.2 : -50, z); } m.needsUpdate = true;
    }
    const target = planted >= 6 ? base - 1.5 : base + 0.15 + 0.55 * (1 - planted / 6); floodLvl += (target - floodLvl) * dt * 0.6; flood.position.y = floodLvl;
    for (const g of growing) g.scale.setScalar(Math.min(2.8, g.scale.x + dt * 1.2));
  });
  t.onDone = () => recolorGround((x, z, c) => { const dh = Math.hypot(x - hx, z - hz); if (dh < 16) { c.lerp(new THREE.Color(0x5f9e3a), 1 - smooth(10, 16, dh) * 0.5); return true; } });
}

// ===== 5. Farmland 退耕還林 =====
{
  zoneSign('貴州畢節．坡地農田', 34, 21);
  const t = defTask({ zone: '畢節農田', title: '退耕還林', total: 8, spawn: [33, 29, -Math.PI / 2],
    desc: '在陡峭山坡耕種，泥土被沖走（<b>水土流失</b>）。① 把坡上的<b>農作物拔起</b>放進<b>手推車</b>　② 從果樹苗箱拿<span class=hl>果樹苗</span>種回坡地。',
    lesson: `<p>國家推行<b>「退耕還林」</b>：把容易水土流失的山坡耕地，改為種植樹木。</p><p>例如貴州<b>畢節</b>，農民把坡地<b>改種果樹</b>：既保護泥土、改善生態，又可賣水果增加收入！🍊</p>` });
  const cy = G(36, 34); const cart = new THREE.Group(); cart.position.set(36, cy, 34); scene.add(cart); mesh(B(1.6, 0.7, 1.1), M(0x3a6aa0), 0, 0.7, 0, cart); for (const x of [-0.6, 0.6]) mesh(C(0.25, 0.25, 0.1, 10), M(0x222222), x, 0.25, 0.6, cart).rotation.x = Math.PI / 2; label('手推車', 36, cy + 2, 34, 0.6);
  addSlot(new THREE.Vector3(36, cy + 1, 34), '手推車', t.id, it => it.kind === 'crop' ? true : '果樹苗要種在坡地上！', it => { it.obj.visible = false; progress(t); }, { multi: true }).reach = 4.5;
  const disp = crateAt(37, 25, '果樹苗箱'); const ft = item(S.fruitTree, '', null); scene.remove(ft); disp.add(ft); ft.position.y = 0.8;
  addDispenser(disp, '果樹苗', t.id, () => ({ type: 'pickup', obj: item(S.fruitTree, '果樹苗'), name: '果樹苗', kind: 'fruit', task: t.id }));
  [[43, 26], [43, 31.5], [47, 28.5], [47, 34]].forEach(([x, z]) => {
    const y = G(x, z); mesh(B(3, 0.15, 3), M(0x7a5232), x, y + 0.02, z, scene, false);
    const cr = spawn(S.crop, '農作物', x, z, t.id, 'crop');
    const s = addSlot(new THREE.Vector3(x, y + 0.08, z), '坡地', t.id, it => it.kind === 'fruit' ? true : '這裏要改種果樹。', it => { it.obj.userData.label.visible = false; it.obj.scale.setScalar(1.9); progress(t); }, { enabled: false });
    cr.onPick = () => { s.enabled = true; s.marker.visible = true; };
  });
  const mudF = particles(120, 0x7a5a30, 0.5);
  effects.push((dt, T) => { const on = 1 - t.done / t.total; const p = mudF.geometry.attributes.position, sd = mudF.userData.seed; for (let i = 0; i < sd.length; i++) { const f = (sd[i] * 5 + T * 0.2) % 1; const x = 54 - f * 16, z = 26 + (i % 4) * 2.7; p.setXYZ(i, x, sd[i] < on ? G(x, z) + 0.2 : -50, z); } p.needsUpdate = true; });
}

// ===== 6-7. Desert 鎖邊 =====
let sandStorm = 1.01;
{
  zoneSign('塔克拉瑪干沙漠邊緣', -10, 41);
  for (const [x, z] of [[-9, 37], [9, 37]]) { const h = new THREE.Group(); h.position.set(x, G(x, z), z); scene.add(h); mesh(B(3, 2, 3), M(0xd8b88a), 0, 1, 0, h); mesh(B(3.3, 0.2, 3.3), M(0xa8784a), 0, 2.1, 0, h); }
  label('村莊和農田', 0, 4, 36, 0.8);
  const strawTex = (() => { const c2 = document.createElement('canvas'); c2.width = c2.height = 128; const g = c2.getContext('2d'); g.fillStyle = '#e0c070'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#8a6a2a'; g.lineWidth = 10; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); } const tx = new THREE.CanvasTexture(c2); tx.colorSpace = THREE.SRGBColorSpace; return tx; })();
  const t = defTask({ zone: '沙漠', title: '推草方格沙障「鎖邊」', total: 4, spawn: [0, 60, 0],
    desc: '風沙吹向村莊，沙漠不斷擴大（<b>荒漠化</b>）！走到<b>草方格沙障</b>後面，<b>向前走把它推</b>（或對着它按動作鍵）到沙漠邊緣的<span class=hl>綠色圓圈</span>。',
    lesson: `<p>沙漠擴大叫<b>荒漠化</b>。在新疆<b>塔克拉瑪干沙漠</b>，國家推行<b>「鎖邊」工程</b>：</p><p>在沙漠邊緣<b>鋪設草方格沙障</b>，減弱風力、固定沙粒，像給沙漠「鎖」上邊。下一步要種植物！</p>` });
  const t2 = defTask({ zone: '沙漠', title: '種植固沙植物', total: 4, spawn: [0, 43, Math.PI],
    desc: '從箱中拿<b>固沙植物</b>，種在每塊<span class=hl>沙障</span>上，完成「鎖邊」，擋住風沙！',
    lesson: `<p><b>種植物 ＋ 鋪設沙障</b> ＝ 「鎖邊」工程 🌵</p><p>植物的根固定沙土，沙障擋風，風沙不再吹向村莊和農田，沙漠的邊緣被「鎖住」了！</p>` });
  const pslots = [];
  [-6, -2, 2, 6].forEach((x, i) => {
    const z = 48; const s = addSlot(new THREE.Vector3(x, G(x, z) + 0.12, z), '沙障位置', t.id, () => false, (it, s) => {
      progress(t); const ps = addSlot(new THREE.Vector3(s.pos.x, s.pos.y + 0.12, s.pos.z), '沙障', t2.id, it => it.kind === 'shrub', it => { it.obj.userData.label.visible = false; it.obj.scale.setScalar(1.7); sandStorm -= 0.25; progress(t2); });
      ps.marker.visible = ti === t2.id; });
    s.reach = 0; pslots.push(s);
    const bz = 53 + (i % 2) * 1.5; const blk = new THREE.Group(); blk.position.set(x, G(x, bz) + 0.12, bz); scene.add(blk);
    mesh(B(1.9, 0.25, 1.9), new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1 }), 0, 0, 0, blk); label('沙障', 0, 1.0, 0, 0.45, null, null, blk);
    addPush(blk, '草方格沙障', t.id, pslots);
  });
  const disp = crateAt(0, 43.5, '固沙植物箱'); const sh = item(S.shrub, '', null); scene.remove(sh); disp.add(sh); sh.position.y = 0.8;
  addDispenser(disp, '固沙植物', t2.id, () => ({ type: 'pickup', obj: item(S.shrub, '固沙植物'), name: '固沙植物', kind: 'shrub', task: t2.id }));
  const sand = particles(isTouch ? 350 : 600, 0xd8b070, 0.4, { opacity: 0.7 });
  effects.push((dt, T) => { const p = sand.geometry.attributes.position, sd = sand.userData.seed; for (let i = 0; i < sd.length; i++) { const f = (sd[i] * 9 + T * 0.35) % 1; const on = sd[i] < sandStorm; const x = Math.sin(i * 3.7) * 14, z = 72 - f * 36; p.setXYZ(i, x, on ? G(x, z) + 0.3 + Math.abs(Math.sin(i + T)) * 1.5 : -50, z); } p.needsUpdate = true; });
  t.onDone = () => { if (SKIP.has(t2.id)) { sandStorm = 0; recolorGround((x, z, c) => { if (z > 43 && z < 51 && Math.abs(x) < 10) { c.lerp(new THREE.Color(0x8aa84a), 0.6); return true; } }); } };
  t2.onDone = () => recolorGround((x, z, c) => { if (z > 43 && z < 51 && Math.abs(x) < 10) { c.lerp(new THREE.Color(0x8aa84a), 0.6); return true; } });
}

// ===== 8. 南水北調 =====
{
  const cx = Z.canal[0]; zoneSign('南水北調工程', 40, -4);
  mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshLambertMaterial({ color: 0x2c8ac0 }), cx, 0.06, 13, scene, false).rotation.x = -Math.PI / 2;
  label('⬇ 南方：水資源豐富', cx, 3.5, 13, 1.1, 'rgba(30,100,180,0.9)');
  label('⬆ 北方：缺水', cx, 7, -40, 1.1, 'rgba(160,90,30,0.9)');
  for (let i = 0; i < 5; i++) mesh(B(3, 4 + i * 1.3, 3), M(0xd8d0c0), cx - 12 + i * 6, 2 + i * 0.65, -44);
  const dry = new THREE.InstancedMesh(C(0.04, 0.06, 0.8, 4), M(0xa08a40), 160); const d = new THREE.Object3D();
  for (let i = 0; i < 160; i++) { const x = cx - 13 + (i % 16) * 1.6; d.position.set(x < cx - 1 || x > cx + 1 ? x : x + 3, 0.4, -38 + Math.floor(i / 16) * 1.2); d.rotation.set(0, 0, 0.6); d.updateMatrix(); dry.setMatrixAt(i, d.matrix); } scene.add(dry);
  const t = defTask({ zone: '南水北調', title: '南水北調：接駁水渠', total: 4, spawn: [53, -6, Math.PI / 2],
    desc: '中國水資源<b>南多北少</b>，北方農田乾旱！拿起地上的<b>水管</b>，安裝到水渠的 4 個<span class=hl>缺口</span>，把南方的水送到北方。',
    lesson: `<p>中國的水資源分佈<b>南多北少</b>：南方雨水多，北方較乾旱。</p><p>國家興建<b>「南水北調」</b>工程，用水渠和水管把南方的水輸送到北方，解決北方缺水問題，農田和城市都得到用水。</p>` });
  const segZ = [1, -6, -13, -20];
  for (let k = 0; k < 5; k++) mesh(B(1.6, 0.6, 3.6), M(0xb0aaa0), cx, 0.3, 4.6 - k * 7);
  segZ.forEach(z => addSlot(new THREE.Vector3(cx, 0.1, z), '水渠缺口', t.id, it => it.kind === 'pipe', it => { it.obj.userData.label.visible = false; it.obj.scale.set(1, 1, 1.55); progress(t); }));
  [[54, 0], [55, -9], [54, -17], [56, -24]].forEach(([x, z]) => spawn(S.pipe, '水管', x, z, t.id, 'pipe'));
  const flow = mesh(B(0.7, 0.12, 1), new THREE.MeshStandardMaterial({ color: 0x3aa0ff, emissive: 0x0a3a80, roughness: 0.1 }), cx, 0.95, 4, scene, false); flow.visible = false;
  let flowT = 0, greened = false; const fountain = particles(120, 0x8ad0ff, 0.3); fountain.visible = false;
  mesh(C(1.5, 1.8, 0.6, 16), M(0xcccccc), cx, 0.3, -30);
  effects.push((dt, T) => {
    if (t.done >= 4) { flow.visible = true; flowT = Math.min(1, flowT + dt * 0.3); const len = 36 * flowT; flow.scale.z = len; flow.position.z = 8 - len / 2;
      if (flowT >= 1 && !greened) { greened = true; fountain.visible = true; dry.material.color.set(0x4caf50); for (let i = 0; i < 160; i++) { dry.getMatrixAt(i, d.matrix); d.matrix.decompose(d.position, d.quaternion, d.scale); d.rotation.set(0, 0, 0); d.scale.set(2, 1.3, 2); d.updateMatrix(); dry.setMatrixAt(i, d.matrix); } dry.instanceMatrix.needsUpdate = true;
        recolorGround((x, z, c) => { if (Math.abs(x - 48) < 14 && z < -22 && z > -40) { c.set(0x5f9e3a); return true; } }); }
    }
    if (fountain.visible) { const p = fountain.geometry.attributes.position, sd = fountain.userData.seed; for (let i = 0; i < sd.length; i++) { const f = (sd[i] + T * 0.6) % 1; const a = i * 2.4; p.setXYZ(i, cx + Math.cos(a) * f * 1.6, 0.8 + 10 * f * (1 - f), -30 + Math.sin(a) * f * 1.6); } p.needsUpdate = true; }
  });
}

// ===== 9. Energy =====
let co2 = 1, hkHaze = 1;
{
  const [cx, cz] = Z.energy; zoneSign('發電區', 17, -43);
  const plant = new THREE.Group(); plant.position.set(cx + 2, 0, cz - 7); scene.add(plant);
  mesh(B(10, 5, 6), M(0x6a6460), 0, 2.5, 0, plant); label('燃煤發電廠', cx + 2, 6.5, cz - 3.5, 1, 'rgba(90,40,30,0.9)');
  const chims = [-3, 0, 3]; chims.forEach(x => mesh(C(0.6, 0.9, 9, 12), M(0x8a7a70), x, 4.5, -1.5, plant));
  const heap = mesh(new THREE.ConeGeometry(2.5, 1.5, 9), M(0x1a1a1a), cx - 7, 0.75, cz - 5);
  const smoke = particles(isTouch ? 260 : 420, 0x302a28, 2.4, { opacity: 0.55 }); const active = [1, 1, 1];
  effects.push((dt, T) => { const p = smoke.geometry.attributes.position, sd = smoke.userData.seed; for (let i = 0; i < sd.length; i++) { const c = i % 3; const f = (sd[i] * 4 + T * 0.15) % 1; p.setXYZ(i, cx + 2 + chims[c] + Math.sin(i) * f * 5 + f * 6, active[c] ? 9 + f * 22 : -50, cz - 8.5 + Math.cos(i * 1.3) * f * 5); } p.needsUpdate = true; });
  const t = defTask({ zone: '發電區', title: '轉用可再生能源', total: 3, spawn: [cx, cz + 13, 0],
    desc: '燃燒<b>煤</b>發電排出大量<b>二氧化碳</b>！把<span class=hl>風力發電機、太陽能光熱板、水力發電機</span>搬到最合適的平台，每放一個便關掉一支煙囪。',
    lesson: `<p>過度使用煤和石油 ➜ 排放<b>大量二氧化碳</b> ➜ <b>氣候變化</b>、<b>極端天氣</b>（暴雨、熱浪、乾旱）。</p><p>國家發展<b>可再生能源</b>：🌊 <b>三峽</b>水力發電、☀️ <b>甘肅</b>光熱發電、🌬️ <b>上海</b>海上風電。</p><p>國家作出<b>減排承諾</b>：<span class=hl>2030 年前碳達峰、2060 年前碳中和</span>。</p>` });
  mesh(B(3, 4, 1), M(0x8a8a84), cx + 10, 2, cz - 0.5); mesh(B(2, 3.6, 0.2), M(0x6ab8f0, { transparent: true, opacity: 0.8, emissive: 0x103050 }), cx + 10, 1.9, cz + 0.1, scene, false);
  const hill = mesh(new THREE.SphereGeometry(3, 12, 6, 0, 6.3, 0, 1.5), M(0x5f9e3a), cx - 10, -1.2, cz + 3); 
  const hint = { wind: '風力發電機要放在風大的山崗平台！', solar: '太陽能光熱板要放在陽光充足的平台！', hydro: '水力發電需要流水，要放在瀑布旁！' };
  const spinners = [];
  [['風力平台（風大的山崗）', 'wind', cx - 10, cz + 3, 1.6], ['光熱平台（陽光充足）', 'solar', cx, cz + 4, 0], ['水力平台（瀑布旁）', 'hydro', cx + 10, cz + 2, 0]].forEach(([n, k, x, z, y], i) => {
    mesh(C(1.5, 1.6, 0.3, 16), M(0xdddddd), x, 0.15 + y, z); label(n, x, 4.6 + y, z, 0.8, 'rgba(30,110,60,0.9)');
    addSlot(new THREE.Vector3(x, 0.3 + y, z), n, t.id, it => it.kind === k ? true : hint[it.kind], it => { it.obj.userData.label.visible = false; it.obj.scale.setScalar(k === 'wind' ? 2.2 : 1.8); if (it.obj.userData.hub) spinners.push(it.obj.userData.hub); active[i] = 0; co2 -= 1 / 3; progress(t); toast('一支煙囪停止排放二氧化碳！'); }).reach = 5;
  });
  effects.push(dt => spinners.forEach(h => h.rotation.z += dt * 3));
  spawn(S.turbine, '風力發電機', cx + 5, cz + 9, t.id, 'wind');
  spawn(S.solar, '太陽能光熱板', cx - 5, cz + 9, t.id, 'solar');
  spawn(S.hydro, '水力發電機', cx, cz + 10, t.id, 'hydro');
  t.onDone = () => { heap.visible = false; co2 = 0; };
}

// ===== 10. Green shop =====
{
  const [cx, cz] = Z.shop; zoneSign('綠色生活小店', cx, cz + 8);
  const stall = new THREE.Group(); stall.position.set(cx, 0, cz - 3); scene.add(stall); mesh(B(9.5, 1, 1.6), M(0xc89a5a), 0, 0.5, 0, stall); mesh(B(10, 0.15, 2.6), M(0x3faa4a), 0, 3, 0, stall); for (const x of [-4.6, 4.6]) mesh(C(0.08, 0.08, 3, 6), M(0x777777), x, 1.5, 0.9, stall);
  const t = defTask({ zone: '綠色生活小店', title: '綠色生活：選購與出行', total: 4, spawn: [cx, cz + 5, 0],
    desc: '過<b>綠色生活</b>！把<b>節能、環保</b>的產品放進<span class=hl>綠色購物籃</span>（共 3 件），然後<b>乘坐電動車</b>回家。',
    lesson: `<p><b>綠色生活</b>：每個人都可以減少碳排放，應對氣候變化！</p><ul><li>選購有<b>能源標籤</b>的節能電器、LED 燈等<b>綠色產品</b></li><li>用環保袋，減少即棄產品</li><li>出行選擇<b>電動車</b>、公共交通</li></ul>` });
  const basket = new THREE.Group(); basket.position.set(cx + 6.5, 0, cz + 1); scene.add(basket); mesh(C(0.7, 0.55, 0.8, 12, 1, true), M(0x3faa4a, { side: THREE.DoubleSide }), 0, 0.4, 0, basket); label('綠色購物籃', cx + 6.5, 1.9, cz + 1, 0.6, 'rgba(30,140,60,0.9)');
  addSlot(new THREE.Vector3(cx + 6.5, 0.8, cz + 1), '綠色購物籃', t.id, it => it.kind === 'green' ? true : `「${it.name}」不是綠色產品，<br>會浪費能源或製造垃圾！`, it => { it.obj.visible = false; progress(t); }, { multi: true });
  [['LED節能燈', 'green', 0xfff6a0], ['一級能源標籤雪櫃', 'green', 0xe0f0ff], ['環保袋', 'green', 0x6cc04a], ['即棄發泡膠飯盒', 'bad', 0xffffff], ['鎢絲燈泡', 'bad', 0xffb040], ['即棄膠樽', 'bad', 0x6fc6ff]]
    .forEach(([n, k, c], i) => spawn(S.box(c), n, cx - 3.9 + i * 1.55, cz - 3, t.id, k, { y: 1.0, labelBg: 'rgba(60,60,60,0.85)' }));
  const ev = new THREE.Group(); ev.position.set(cx - 7.5, 0, cz + 2); scene.add(ev); mesh(B(2, 0.9, 4), M(0x30b0a0, { metalness: .4, roughness: .3 }), 0, 0.7, 0, ev); mesh(B(1.8, 0.7, 2), M(0x223344, { metalness: .5, roughness: .1 }), 0, 1.4, -0.2, ev); for (const [x, z] of [[-1, -1.3], [1, -1.3], [-1, 1.3], [1, 1.3]]) mesh(C(0.35, 0.35, 0.25, 12), M(0x111111), x, 0.35, z, ev).rotation.z = Math.PI / 2;
  label('電動車 ⚡', 0, 2.6, 0, 0.6, null, null, ev);
  let evDrive = false;
  addSwitch(ev, '電動車', t.id, it => { if (t.done < 3) { toast('先買齊 3 件綠色產品，再乘坐電動車！', 'bad'); return; } it.done = true; evDrive = true; progress(t); toast('電動車零排放出行 🚗⚡'); }, '乘坐');
  effects.push(dt => { if (evDrive && ev.position.z > cz - 25) ev.position.z -= dt * 6; });
}

// ===== 11-13. Hong Kong =====
{
  const [cx, cz] = Z.hk; zoneSign('香港街道', cx + 8, cz + 13);
  mesh(B(46, 0.05, 7), M(0x333338, { roughness: 0.9 }), cx, 0.03, cz, scene, false);
  for (let i = 0; i < 10; i++) mesh(B(2, 0.06, 0.2), M(0xffffff), cx - 20 + i * 4.5, 0.06, cz, scene, false);
  const bi = new THREE.InstancedMesh(B(1, 1, 1), M(0xffffff), 14), d = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < 14; i++) { const h = rand(8, 22); d.position.set(cx - 22 + i * 3.4, h / 2, cz + 9 + (i % 2) * 1.5); d.scale.set(3, h, 4); d.updateMatrix(); bi.setMatrixAt(i, d.matrix); col.setHSL(rand(0, 1), 0.25, rand(0.6, 0.8)); bi.setColorAt(i, col); }
  bi.castShadow = true; bi.receiveShadow = true; scene.add(bi);
  mesh(new THREE.PlaneGeometry(240, 70), new THREE.MeshLambertMaterial({ color: 0x2a78aa }), -20, -1.0, -101, scene, false).rotation.x = -Math.PI / 2;
  mesh(B(70, 2.4, 1), M(0x9a9a96), cx, -1.0, -66.6, scene, false); for (let i = 0; i < 24; i++) mesh(C(0.06, 0.06, 1, 4), M(0x444444), cx - 34 + i * 3, 0.6, -66.2, scene, false); mesh(B(70, 0.08, 0.08), M(0x444444), cx, 1.05, -66.2, scene, false);
  label('維多利亞港', cx, 3, -68, 1.2, 'rgba(30,80,160,0.9)');
  const sk = new THREE.InstancedMesh(B(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 28);
  for (let i = 0; i < 28; i++) { const h = rand(12, 46) * (i === 13 ? 1.9 : 1); d.position.set(-90 + i * 4.8, h / 2 - 1, -128 + rand(-3, 3)); d.scale.set(rand(3, 4.4), h, 4); d.updateMatrix(); sk.setMatrixAt(i, d.matrix); col.setHSL(0.58, 0.2, rand(0.5, 0.85)); sk.setColorAt(i, col); }
  scene.add(sk);
  mesh(new THREE.SphereGeometry(45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f7a40 }), -30, -2, -158, scene, false).scale.y = 0.65;
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0x9a9080, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
  const hazes = []; for (let i = 0; i < 4; i++) hazes.push(mesh(new THREE.PlaneGeometry(240, 80), hazeMat, -20, 25, -80 - i * 11, scene, false));
  effects.push(() => { hazeMat.opacity = 0.45 * Math.max(0, hkHaze); hazes.forEach(h => h.visible = hkHaze > 0.02); });

  const t1 = defTask({ zone: '香港街道', title: '停車熄匙', total: 4, spawn: [cx - 6, cz + 4.5, Math.PI / 2],
    desc: '路邊的車輛<b>停車沒有熄匙</b>，不斷排出廢氣，維港也變得朦朧！走到每輛冒煙的車旁，按動作鍵<span class=hl>熄匙</span>。',
    lesson: `<p>香港<b>空氣污染</b>的影響：</p><ul><li>😷 <b>危害健康</b>：引致呼吸道疾病</li><li>🌫️ <b>能見度下降</b>：看不清維港景色</li><li>💰 影響<b>經濟</b>：遊客減少、市民生病缺勤</li></ul><p>法例規定<b>停車熄匙</b>，減少路邊廢氣。</p>` });
  const exhaust = particles(200, 0x555048, 0.9, { opacity: 0.6 }); const cars = [];
  for (let i = 0; i < 4; i++) {
    const x = cx - 15 + i * 8, z = cz - 2; const car = new THREE.Group(); car.position.set(x, 0, z); car.rotation.y = Math.PI / 2; scene.add(car);
    mesh(B(1.9, 0.9, 4.2), M([0xd23b2b, 0xf0c020, 0x3a6ad0, 0xeeeeee][i], { metalness: .4, roughness: .35 }), 0, 0.75, 0, car); mesh(B(1.7, 0.7, 2.2), M(0x223344, { metalness: .5, roughness: .1 }), 0, 1.5, 0.1, car);
    for (const [wx, wz] of [[-1, -1.4], [1, -1.4], [-1, 1.4], [1, 1.4]]) mesh(C(0.36, 0.36, 0.25, 12), M(0x111111), wx, 0.36, wz, car).rotation.z = Math.PI / 2;
    const c = { car, on: true, x, z }; cars.push(c);
    const lb = label('引擎未熄', x, 2.9, z, 0.6, 'rgba(180,40,30,0.9)');
    addSwitch(car, '汽車引擎', t1.id, it => { it.done = true; c.on = false; c.car.position.y = 0; lb.material.map = labelTex('已熄匙 ✔', 'rgba(30,140,60,0.9)'); hkHaze -= 0.08; progress(t1); toast('熄匙了！廢氣停止排放。'); }, '熄匙');
  }
  effects.push((dt, T) => { const p = exhaust.geometry.attributes.position, sd = exhaust.userData.seed; for (let i = 0; i < sd.length; i++) { const c = cars[i % 4]; const f = (sd[i] * 3 + T * 0.5) % 1; p.setXYZ(i, c.on ? c.x - 2.3 - f * 2.5 : 0, c.on ? 0.4 + f * 1.4 : -50, c.z + Math.sin(i + T) * f * 0.7); } p.needsUpdate = true; for (const c of cars) if (c.on) c.car.position.y = Math.sin(T * 40 + c.x) * 0.012; });

  const t2 = defTask({ zone: '香港街道', title: '電動車充電', total: 2, spawn: [cx + 15, cz + 4, -Math.PI / 2 - 0.4],
    desc: '把充電樁的<b>充電插頭拿起，拉着電線</b>，插到<span class=hl>電動車的充電口</span>。',
    lesson: `<p><b>電動車</b>行駛時不排放廢氣，可以改善路邊空氣質素。</p><p>政府增設充電設施，鼓勵市民和公共交通轉用電動車。</p>` });
  const cables = [];
  [[cx + 17, cz + 6], [cx + 21, cz + 6]].forEach(([x, z]) => {
    const ch = new THREE.Group(); ch.position.set(x, 0, z); scene.add(ch); mesh(B(0.7, 1.6, 0.5), M(0x2fa84f), 0, 0.8, 0, ch); mesh(B(0.5, 0.3, 0.05), M(0x111111, { emissive: 0x003300 }), 0, 1.3, -0.26, ch);
    const plug = spawn(S.plug, '充電插頭', x, z - 0.45, t2.id, 'plug', { y: 0.9 });
    const ev = new THREE.Group(); ev.position.set(x, 0, z - 6); scene.add(ev); mesh(B(1.9, 0.9, 4.2), M(0x30b0a0, { metalness: .4, roughness: .3 }), 0, 0.75, 0, ev); mesh(B(1.7, 0.7, 2.2), M(0x223344, { metalness: .5, roughness: .1 }), 0, 1.5, 0, ev); for (const [wx, wz] of [[-1, -1.4], [1, -1.4], [-1, 1.4], [1, 1.4]]) mesh(C(0.36, 0.36, 0.25, 12), M(0x111111), wx, 0.36, wz, ev).rotation.z = Math.PI / 2;
    const lb = label('電動車 🔋0%', x, 2.9, z - 6, 0.6);
    addSlot(new THREE.Vector3(x + 1.05, 0.6, z - 4.6), '充電口', t2.id, it => it.kind === 'plug' ? true : '要用充電插頭。', it => { it.obj.userData.label.visible = false; lb.material.map = labelTex('充電中 🔋⚡', 'rgba(30,140,60,0.9)'); hkHaze -= 0.06; progress(t2); }).reach = 4;
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 14 }, () => new THREE.Vector3())); const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x111111 })); line.frustumCulled = false; scene.add(line);
    cables.push({ line, from: new THREE.Vector3(x, 1.1, z - 0.25), plug });
  });
  const tv = new THREE.Vector3(), lv = new THREE.Vector3();
  effects.push(() => { for (const c of cables) { c.plug.obj.getWorldPosition(tv); tv.y += 0.12; const sag = Math.max(0.1, 1.2 - c.from.distanceTo(tv) * 0.12); const p = c.line.geometry.attributes.position; for (let i = 0; i < 14; i++) { const f = i / 13; lv.copy(c.from).lerp(tv, f); lv.y -= Math.sin(f * Math.PI) * sag; p.setXYZ(i, lv.x, lv.y, lv.z); } p.needsUpdate = true; } });

  const t3 = defTask({ zone: '香港發電廠', title: '發電廠轉用天然氣＋粵港合作', total: 3, spawn: [cx - 13, cz + 4, Math.PI / 2 + 0.3],
    desc: '① 把鍋爐前的<b>煤</b>搬去<b>回收區</b>　② 把<span class=hl>天然氣罐</span>放進鍋爐　③ 按<b>粵港空氣監測站</b>按鈕，與廣東合作減排！',
    lesson: `<p>香港改善空氣質素的措施：</p><ul><li>🚗 <b>停車熄匙</b></li><li>🔌 推廣<b>電動車</b></li><li>🏭 <b>發電廠</b>減少燒煤，<b>改用較清潔的天然氣</b></li><li>🤝 <b>與廣東省合作</b>，共同減少區域空氣污染</li></ul><p>維港的景色重新清晰了！</p>` });
  const pp = new THREE.Group(); pp.position.set(cx - 19, 0, cz - 7); scene.add(pp); mesh(B(8, 6, 5), M(0xb8b0a8), 0, 3, 0, pp); mesh(C(0.7, 1, 12, 12), M(0xd0c8c0), 2.5, 6, -1, pp);
  label('香港發電廠', cx - 19, 7.6, cz - 4.2, 0.9, 'rgba(90,40,30,0.9)');
  const furnace = mesh(B(2, 1.4, 0.4), M(0x3a2a20, { emissive: 0x802000 }), cx - 19, 0.9, cz - 4.4);
  spawn(S.coal, '煤', cx - 19, cz - 3.4, t3.id, 'coal', { y: 0.05 });
  mesh(B(2.4, 0.2, 2.4), M(0x555555), cx - 26, 0.1, cz - 1); label('回收區', cx - 26, 2, cz - 1, 0.6);
  let plantSmoke = 1.01;
  const furnaceSlot = addSlot(new THREE.Vector3(cx - 19, 0.05, cz - 3.4), '鍋爐', t3.id, it => it.kind === 'gas' ? true : '鍋爐要改用天然氣！', it => { it.obj.userData.label.visible = false; furnace.material.emissive.set(0x1040a0); plantSmoke = 0.3; hkHaze -= 0.2; progress(t3); toast('發電廠改用天然氣，排放大減！'); }, { enabled: false });
  addSlot(new THREE.Vector3(cx - 26, 0.2, cz - 1), '回收區', t3.id, it => it.kind === 'coal' ? true : '天然氣罐要放進鍋爐。', it => { furnaceSlot.enabled = true; furnaceSlot.marker.visible = true; progress(t3); });
  spawn(S.gas, '天然氣罐', cx - 12, cz + 3, t3.id, 'gas', { y: 0.05 });
  const ps = particles(150, 0x3a3430, 2.2, { opacity: 0.5 });
  effects.push((dt, T) => { const p = ps.geometry.attributes.position, sd = ps.userData.seed; for (let i = 0; i < sd.length; i++) { const f = (sd[i] * 3 + T * 0.15) % 1; p.setXYZ(i, cx - 16.5 + f * 8 + Math.sin(i) * f * 3, sd[i] < plantSmoke ? 12 + f * 16 : -50, cz - 8 - f * 4); } p.needsUpdate = true; ps.material.color.set(plantSmoke < 1 ? 0xdddddd : 0x3a3430); });
  const mon = new THREE.Group(); mon.position.set(cx - 7, 0, cz + 5.5); scene.add(mon); mesh(B(1.2, 2.4, 1.2), M(0xeeeeee), 0, 1.2, 0, mon); mesh(C(0.04, 0.04, 1.4, 4), M(0x888888), 0, 3.1, 0, mon); const mlamp = mesh(new THREE.SphereGeometry(0.2, 8, 6), M(0xff3030, { emissive: 0x880000 }), 0, 2.0, -0.62, mon);
  label('粵港空氣監測站', cx - 7, 4.6, cz + 5.5, 0.75, 'rgba(30,80,160,0.9)');
  addSwitch(mon, '粵港空氣監測站', t3.id, it => { if (t3.done < 2) { mistakes++; toast('先完成發電廠轉用天然氣！', 'bad'); return; } it.done = true; mlamp.material.color.set(0x30ff60); mlamp.material.emissive.set(0x00aa30); hkHaze = 0; progress(t3); toast('🤝 粵港合作減排，區域空氣變清新！'); }, '與廣東合作');
}

// ---------- atmosphere ----------
function updateAtmosphere() {
  const de = Math.hypot(player.pos.x - Z.energy[0], player.pos.z - Z.energy[1]);
  const dh = Math.hypot(player.pos.x - Z.hk[0], player.pos.z - Z.hk[1]);
  const s = Math.max(Math.max(0, co2) * (1 - smooth(20, 42, de)), Math.max(0, hkHaze) * (1 - smooth(26, 46, dh)) * 0.8);
  scene.fog.color.lerpColors(FOG_CLEAR, FOG_SMOG, s); scene.fog.near = 40 - 32 * s; scene.fog.far = 210 - 140 * s;
  hemi.intensity = 0.9 - 0.3 * s; sun.intensity = 2.4 - 1.2 * s;
  const n = Math.round(Math.max(0, co2) * 5);
  $('meter').innerHTML = `CO₂ <span style="color:#ff8a6a">${'█'.repeat(n)}</span>${'░'.repeat(5 - n)}<br>維港能見度 ${Math.round((1 - Math.max(0, hkHaze)) * 100)}%`;
}

// ---------- finale ----------
const fireworks = particles(500, 0xffffff, 0.9, { opacity: 1 }); fireworks.visible = false;
function finale() {
  fireworks.visible = true; player.pos.set(Z.hk[0], 0, -64); player.yaw = 0; player.pitch = 0.15;
  const stars = mistakes <= 3 ? '⭐⭐⭐' : mistakes <= 8 ? '⭐⭐' : '⭐';
  showModal(`<h1>🎉 恭喜你治好了生病的地球！</h1><p style="font-size:34px;text-align:center;margin:0">${stars}</p><p style="text-align:center">總分：<b>${score}</b>　　放錯／提示：${mistakes} 次</p><h3>你學會了：</h3><ul><li>天然資源：水、植物、動物、礦產（煤、石油）</li><li><b>不當使用天然資源會破壞生態環境</b>：水質污染、氣候變化、水土流失</li><li>國家應對：鎖邊工程、退耕還林、南水北調、減排承諾（2030 碳達峰、2060 碳中和）、可再生能源、綠色生活</li><li>香港改善空氣：停車熄匙、電動車、發電廠用天然氣、與廣東合作</li></ul>`, '欣賞煙花 🎆', () => { $('ttitle').textContent = '🎉 全部任務完成！'; $('tdesc').innerHTML = `總分 ${score}　按 F5 可重新開始`; });
  sfx(523, .2); sfx(659, .2, .2); sfx(784, .2, .4); sfx(1046, .5, .6);
}
effects.push((dt, T) => { if (!fireworks.visible) return; const p = fireworks.geometry.attributes.position, sd = fireworks.userData.seed; for (let i = 0; i < sd.length; i++) { const burst = i % 8, f = (T * 0.4 + burst * 0.13) % 1, a = sd[i] * 6.283, b = (i * 0.37) % 3.14; const bx = Z.hk[0] - 35 + burst * 10, by = 32 + (burst % 3) * 7, bz = -110; const r = f * 11; p.setXYZ(i, bx + Math.cos(a) * Math.sin(b) * r, by + Math.cos(b) * r - f * f * 5, bz + Math.sin(a) * Math.sin(b) * r); } p.needsUpdate = true; fireworks.material.color.setHSL((T * 0.2) % 1, 1, 0.65); });

// ---------- main loop ----------
const clock = new THREE.Clock(); let T = 0;
const colliders = [[-9, -28, .5], [9, -28, .5], [-9, -16, .5], [9, -16, .5], [-30, -35, 3.4], [-33, 4, 1.8], [-27, 38, 2.6], [Z.energy[0] + 2, Z.energy[1] - 7, 5.5], [Z.hk[0] - 19, Z.hk[1] - 7, 4.6]];
const wp = new THREE.Vector3(), carryOff = new THREE.Vector3();
function update(dt) {
  T += dt;
  if (!paused) {
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz -= 1; if (keys.KeyS || keys.ArrowDown) mz += 1; if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
    mx += joy.x; mz += joy.y;
    const L = Math.hypot(mx, mz); if (L > 1) { mx /= L; mz /= L; }
    const sp = (keys.ShiftLeft || keys.ShiftRight || Math.hypot(joy.x, joy.y) > 0.95) ? 10 : 6;
    const sy = Math.sin(player.yaw), cyw = Math.cos(player.yaw);
    const vx = (mx * cyw + mz * sy) * sp, vz = (-mx * sy + mz * cyw) * sp;
    let nx = player.pos.x + vx * dt, nz = player.pos.z + vz * dt;
    for (const [x, z, r] of colliders) { const dx = nx - x, dz = nz - z, d = Math.hypot(dx, dz) || 1e-3; if (d < r + 0.4) { nx = x + dx / d * (r + 0.4); nz = z + dz / d * (r + 0.4); } }
    if (Math.abs(nx + 41) < 3.8 && nz > -50 && nz < 6.6) nx = player.pos.x < -41 ? -44.8 : -37.2;
    nx = Math.max(-110, Math.min(110, nx)); nz = Math.max(-65.5, Math.min(110, nz));
    const t = curTask();
    for (const it of inter) if (it.type === 'push' && it.task === t.id && !it.done) {
      const bp = it.obj.position, dx = bp.x - nx, dz = bp.z - nz, d = Math.hypot(dx, dz);
      if (d < 1.7 && (vx * dx + vz * dz) > 0) { if (Math.abs(dx) > Math.abs(dz)) pushBlock(it, Math.abs(vx) * dt, Math.sign(dx), 0); else pushBlock(it, Math.abs(vz) * dt, 0, Math.sign(dz)); if (!it.done && Math.hypot(bp.x - nx, bp.z - nz) < 1.6) { nx = player.pos.x; nz = player.pos.z; } }
    }
    player.pos.x = nx; player.pos.z = nz;
    const onBridge = nz > 6.6 && nz < 9.4 && Math.abs(nx + 41) < 6;
    player.pos.y = (onBridge ? Math.max(0.55, G(nx, nz)) : G(nx, nz)) + 1.6 + (L > 0.1 ? Math.sin(T * 9) * 0.04 : 0);
  }
  camera.position.copy(player.pos); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 60); sun.target.position.copy(player.pos); window._sky.position.copy(player.pos);
  if (carried) { carryOff.set(0.45, -0.55, -1.3).applyEuler(camera.rotation); carried.obj.position.copy(camera.position).add(carryOff); carried.obj.rotation.set(0, player.yaw, 0); }
  focus = paused ? null : computeFocus();
  const pr = $('prompt');
  if (focus) {
    const p = focus.s ? focus.s.pos : focus.i.obj.getWorldPosition(wp); ring.visible = true; ring.position.set(p.x, (focus.s ? p.y : Math.max(G(p.x, p.z), p.y)) + 0.12, p.z); ring.scale.setScalar(1 + Math.sin(T * 6) * 0.1);
    const k = isTouch ? '按「動作」' : '按 E／左鍵';
    pr.textContent = focus.s ? `${k}：把「${carried.name}」放進「${focus.s.name}」` : `${k}：${focus.i.type === 'switch' ? focus.i.verb : focus.i.type === 'push' ? '推動' : '拿起'}「${focus.i.name}」`; pr.style.display = 'block';
  } else { ring.visible = false; if (carried && !paused) { pr.textContent = `正拿着「${carried.name}」— 走到發光圓圈並對準它`; pr.style.display = 'block'; } else pr.style.display = 'none'; }
  for (const s of slots) if (s.marker.visible) s.marker.material.opacity = 0.45 + Math.sin(T * 4) * 0.3;
  for (const e of effects) e(dt, T);
  const t = curTask();
  if (t && !t.finished) {
    const sl = carried && slots.find(s => s.task === t.id && s.enabled && (!s.filled || s.multi) && s.accepts(carried) === true);
    const near = sl || inter.find(i => i.task === t.id && !i.done) || slots.find(s => s.task === t.id && s.enabled && !s.filled);
    const bp = near ? (near.pos || near.obj.getWorldPosition(wp)) : { x: t.spawn[0], z: t.spawn[1] };
    beacon.visible = !paused; beacon.position.set(bp.x, G(bp.x, bp.z) + 20, bp.z);
    const dx = bp.x - player.pos.x, dz = bp.z - player.pos.z; $('arrow').style.transform = `rotate(${Math.atan2(dx, -dz) + player.yaw}rad)`; $('dist').textContent = `${t.zone}　${Math.round(Math.hypot(dx, dz))} 米`;
  } else beacon.visible = false;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.display = 'none'; }
  updateAtmosphere();
}
function loop() { const dt = Math.min(0.05, clock.getDelta()); update(dt); renderer.render(scene, camera); requestAnimationFrame(loop); }
updateHUD(); loop();

function begin(e) { if (e) { e.preventDefault(); } if (started) return; started = true; $('modal').style.display = 'none'; paused = false; startTask(); sfx(440, .1); if (!isTouch && !window.__test) cv.requestPointerLock?.(); }
$('start').addEventListener('click', begin); $('start').addEventListener('touchstart', begin, { passive: false });

// ---------- test hooks ----------
window.game = {
  tasks, slots, inter, player, renderer, scene, ground, groundH, get ti() { return ti; }, get score() { return score; }, get carried() { return carried; }, get focus() { return focus; },
  begin, teleport: teleportToTask, action, look(yaw, pitch) { player.yaw = yaw; player.pitch = pitch; }, at(x, z, yaw = 0, pitch = -0.15) { player.pos.set(x, 0, z); player.yaw = yaw; player.pitch = pitch; },
  closeModal() { const g = document.querySelector('#card .go'); if (g && $('modal').style.display !== 'none') g.click(); },
  solveCurrent() {
    const t = curTask(); let guard = 0;
    while (t.done < t.total && guard++ < 50) {
      const pend = inter.filter(i => i.task === t.id && !i.done);
      const push = pend.find(i => i.type === 'push'); if (push) { const s = push.slotList.find(s => !s.filled); push.obj.position.set(s.pos.x, s.pos.y, s.pos.z + 0.5); pushBlock(push, 0.1, 0, -1); continue; }
      let did = false;
      for (const it of [...pend.filter(i => i.type === 'pickup'), ...pend.filter(i => i.type === 'disp')]) {
        const obj = it.type === 'disp' ? it.make() : it; const s = slots.find(s => s.task === t.id && s.enabled && (!s.filled || s.multi) && s.accepts(obj) === true);
        if (s) { if (it.type === 'pickup') removeInter(it); if (obj.onPick) obj.onPick(); placeInSlot(obj, s); did = true; break; } else if (it.type === 'disp') scene.remove(obj.obj);
      }
      if (did) continue;
      const sw = pend.find(i => i.type === 'switch'); if (sw) { sw.onUse(sw); continue; }
      break;
    }
  }
};
