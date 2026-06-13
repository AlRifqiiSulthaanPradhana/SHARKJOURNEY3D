// ============================================================
//  OCEAN GAME - Shark Journey 3D
// ============================================================

// ---------- SCENE ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x001a33);
scene.fog = new THREE.Fog(0x001a33, 50, 130);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputEncoding = THREE.sRGBEncoding;
// Canvas ditambah ke body saat startGame() dipanggil

// ---------- CONSTANTS & STATE ----------
const PLAY_Y       = -3;
const SHARK_PLAY_Y = -4;
const MAX_SPEED    = 0.15;

let score = 0, eaten = 0, combo = 0, comboTimer = 0;
let cameraMode = 0;
let msgTimer = 0, penaltyTimer = 0;
let sharkReady = false;
let sharkModel = null;
let sharkMixer = null;  // AnimationMixer untuk animasi hiu
let t = 0;
let gameStarted = false;

const keys            = {};
const coralCooldowns  = new Map();
const fishes          = [];
const corals          = [];
const seagrassPatches = [];
const causticLights   = [];
const camTarget       = new THREE.Vector3();

// ---------- LIGHTING ----------
scene.add(new THREE.AmbientLight(0x5588aa, 1.4));

const sunLight = new THREE.DirectionalLight(0x88bbff, 1.6);
sunLight.position.set(10, 30, 10);
sunLight.castShadow = true;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x003366, 0.5);
fillLight.position.set(-10, -5, -10);
scene.add(fillLight);

for (let i = 0; i < 4; i++) {
  const cl = new THREE.PointLight(0x0099ff, 0.4, 35);
  cl.position.set(Math.random() * 40 - 20, 18, Math.random() * 40 - 20);
  scene.add(cl);
  causticLights.push(cl);
}

// ---------- OCEAN FLOOR ----------
const floorGeo = new THREE.PlaneGeometry(200, 200, 40, 40);
const fv = floorGeo.attributes.position;
for (let i = 0; i < fv.count; i++) fv.setZ(i, (Math.random() - 0.5) * 1.5);
floorGeo.computeVertexNormals();
const floor = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ color: 0x1a4a2a }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -10;
floor.receiveShadow = true;
scene.add(floor);

for (let i = 0; i < 20; i++) {
  const sp = new THREE.Mesh(
    new THREE.CircleGeometry(Math.random() * 3 + 1, 8),
    new THREE.MeshLambertMaterial({ color: 0xc2a96e })
  );
  sp.rotation.x = -Math.PI / 2;
  sp.position.set(Math.random() * 160 - 80, -9.8, Math.random() * 160 - 80);
  scene.add(sp);
}

// ---------- PROCEDURAL SHARK (fallback) ----------
function makeProceduralShark() {
  const g   = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 3.5, 10), mat(0x607080));
  body.rotation.z = Math.PI / 2; g.add(body);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 3.3, 10), mat(0xddeeff));
  belly.rotation.z = Math.PI / 2; belly.position.y = -0.15; g.add(belly);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.2, 10), mat(0x607080));
  head.rotation.z = Math.PI / 2; head.position.x = 2.3; g.add(head);
  [0.4, -0.4].forEach((y, i) => {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.2, 4), mat(0x607080));
    tail.rotation.z = i === 0 ? Math.PI / 4 : -Math.PI / 4;
    tail.position.set(-2.0, y, 0); g.add(tail);
  });
  const d = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.0, 4), mat(0x506070));
  d.position.set(0, 0.8, 0); g.add(d);
  [-1, 1].forEach(s => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08), mat(0x111111));
    eye.position.set(1.8, 0.3, 0.45 * s); g.add(eye);
  });
  return g;
}

// ---------- SHARK GROUP ----------
const sharkGroup = new THREE.Group();
sharkGroup.position.set(0, SHARK_PLAY_Y, 0);
sharkGroup.userData.vel   = new THREE.Vector3();
sharkGroup.userData.angle = 0;
scene.add(sharkGroup);

// ---------- LOADING BAR ----------
function setLoadingBar(pct, txt) {
  const bar  = document.getElementById('loading-bar');
  const text = document.getElementById('loading-text');
  if (bar)  bar.style.width = pct + '%';
  if (text && txt) text.textContent = txt;
}
function hideLoading() {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
}

// ---------- SHOW HUD & CONTROLS ----------
function showGameUI() {
  document.getElementById('hud').style.display           = 'block';
  document.getElementById('mute-btn').style.display      = 'block';
  document.getElementById('cam-btn').style.display       = 'block';
  document.getElementById('speed-bar').style.display     = 'block';
  document.getElementById('kombo-display').style.display = 'block';
  document.getElementById('msg-popup').style.display     = 'block';
  document.getElementById('penalty-popup').style.display = 'block';
  document.getElementById('controls-forward').style.display = 'flex';
  document.getElementById('controls-turn').style.display    = 'flex';
}

// ---------- SMALL FISH ----------
const FISH_COLORS = [0xff6600, 0xffaa00, 0xff3399, 0x00ffaa, 0xffff00, 0x00ccff, 0xff44cc, 0x44ff88];

function makeSmallFish(color) {
  const g   = new THREE.Group();
  const col = color || FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)];
  const mat = new THREE.MeshLambertMaterial({ color: col });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), mat);
  body.scale.x = 1.7; g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7, 4), mat);
  tail.rotation.z = Math.PI / 2; tail.position.x = -0.85; g.add(tail);
  [[0.28, Math.PI / 6], [-0.28, -Math.PI / 6]].forEach(([yO, zR]) => {
    const tf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.45, 4), mat);
    tf.position.set(-0.85, yO, 0); tf.rotation.z = zR; g.add(tf);
  });
  const dor = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 4), mat);
  dor.position.set(0, 0.45, 0); g.add(dor);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  eye.position.set(0.42, 0.12, 0.38); g.add(eye);
  return g;
}

function spawnFish() {
  const angle = Math.random() * Math.PI * 2;
  const r     = 12 + Math.random() * 50;
  const f     = makeSmallFish();
  f.position.set(Math.cos(angle) * r, PLAY_Y, Math.sin(angle) * r);
  f.rotation.y = Math.random() * Math.PI * 2;
  f.userData.swimPhase = Math.random() * Math.PI * 2;
  scene.add(f);
  fishes.push(f);
}

for (let i = 0; i < 30; i++) spawnFish();

// ---------- PILLARS ----------
const PILLAR_COLORS = [0xff4466, 0xff8800, 0xff44cc, 0xffcc00, 0x44ffcc, 0xff6644, 0xff2299, 0x00ffaa];
const PILLAR_COUNT  = 40;

for (let i = 0; i < PILLAR_COUNT; i++) {
  const angle  = Math.random() * Math.PI * 2;
  const r      = 8 + Math.random() * 70;
  const cx     = Math.cos(angle) * r;
  const cz     = Math.sin(angle) * r;
  const height = 18 + Math.random() * 8;
  const width  = 0.6 + Math.random() * 0.8;
  const col    = PILLAR_COLORS[Math.floor(Math.random() * PILLAR_COLORS.length)];
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, width),
    new THREE.MeshLambertMaterial({ color: col })
  );
  mesh.position.set(cx, -10 + height / 2, cz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  corals.push({ x: cx, z: cz, radius: width * 0.8 });
  coralCooldowns.set(i, 0);
}

// ---------- SEAGRASS ----------
function makeSeagrass(x, z) {
  const g = new THREE.Group();
  for (let i = 0; i < 5 + Math.floor(Math.random() * 5); i++) {
    const h   = 2 + Math.random() * 3;
    const col = new THREE.Color(0x1a7a30); col.lerp(new THREE.Color(0x2daa50), Math.random());
    const bm  = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });
    const bg  = new THREE.PlaneGeometry(0.18 + Math.random() * 0.1, h, 1, 6);
    const pa  = bg.attributes.position;
    for (let j = 0; j < pa.count; j++) {
      const yN = pa.getY(j) / h + 0.5;
      pa.setX(j, pa.getX(j) + yN * yN * 0.5 * (Math.random() - 0.5) * 2);
    }
    bg.computeVertexNormals();
    const blade = new THREE.Mesh(bg, bm);
    blade.position.set((Math.random() - 0.5) * 0.8, -10 + h / 2, (Math.random() - 0.5) * 0.8);
    blade.rotation.y = Math.random() * Math.PI * 2;
    blade.userData.swayPhase = Math.random() * Math.PI * 2;
    blade.userData.swaySpeed = 0.5 + Math.random() * 0.5;
    g.add(blade);
  }
  g.position.set(x, 0, z);
  return g;
}

for (let i = 0; i < 80; i++) {
  const a  = Math.random() * Math.PI * 2, r = 5 + Math.random() * 75;
  const sg = makeSeagrass(Math.cos(a) * r, Math.sin(a) * r);
  scene.add(sg); seagrassPatches.push(sg);
}

// ---------- PARTICLES ----------
function makeParticles(count, spread, yMin, yMax, color, size, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random()-0.5)*spread;
    pos[i*3+1] = Math.random()*(yMax-yMin)+yMin;
    pos[i*3+2] = (Math.random()-0.5)*spread;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity }));
}
const bubbles  = makeParticles(200, 100, -10, 25, 0xaaddff, 0.15, 0.5);
const plankton = makeParticles(500, 120, -10, 20, 0x88ffcc, 0.08, 0.3);
scene.add(bubbles); scene.add(plankton);

// ---------- SOUND EFFECTS ----------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSFX_eat() {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.08);
  osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.18);
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.25);
}

function playSFX_combo() {
  [0, 0.07, 0.14].forEach((delay, i) => {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'square';
    const freqs = [400, 600, 900];
    osc.frequency.setValueAtTime(freqs[i], audioCtx.currentTime + delay);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.12);
    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + 0.12);
  });
}

function playSFX_crash() {
  audioCtx.resume().then(() => {
    const bufferSize = audioCtx.sampleRate * 0.4;
    const buffer     = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data       = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 200;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(1.0, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    source.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    source.start(); source.stop(audioCtx.currentTime + 0.4);

    const osc   = audioCtx.createOscillator();
    const ogain = audioCtx.createGain();
    osc.connect(ogain); ogain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3);
    ogain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    ogain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.3);
  });
}

// ---------- BACKGROUND MUSIC ----------
const bgm   = new Audio('BACKSOUNDGAME.mp3');
bgm.loop    = true;
bgm.volume  = 0.5;

function startBGM() {
  bgm.play().catch(() => {});
}

// Mute button
let isMuted = false;
document.getElementById('mute-btn').addEventListener('click', () => {
  isMuted   = !isMuted;
  bgm.muted = isMuted;
  document.getElementById('mute-btn').textContent = isMuted ? '🔇' : '🔊';
});

// ---------- INPUT ----------
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup',   e => keys[e.key] = false);

function addTouch(id, key) {
  const el = document.getElementById(id);
  el.addEventListener('touchstart', e => { e.preventDefault(); keys[key] = true;  }, { passive: false });
  el.addEventListener('touchend',   e => { e.preventDefault(); keys[key] = false; }, { passive: false });
  el.addEventListener('mousedown', () => keys[key] = true);
  el.addEventListener('mouseup',   () => keys[key] = false);
}
addTouch('btn-up',    'ArrowUp');
addTouch('btn-down',  'ArrowDown');
addTouch('btn-left',  'ArrowLeft');
addTouch('btn-right', 'ArrowRight');
document.getElementById('cam-btn').addEventListener('click', () => cameraMode = (cameraMode + 1) % 3);

// ---------- HUD HELPERS ----------
function showMsg(txt) {
  document.getElementById('msg-popup').textContent = txt;
  document.getElementById('msg-popup').style.opacity = '1';
  msgTimer = 0.7;
}
function showPenalty(txt) {
  document.getElementById('penalty-popup').textContent = txt;
  document.getElementById('penalty-popup').style.opacity = '1';
  penaltyTimer = 0.8;
}

// ---------- GAME LOOP ----------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;

  causticLights.forEach((cl, i) => {
    cl.position.x += Math.sin(t * 0.3 + i) * 0.05;
    cl.position.z += Math.cos(t * 0.25 + i) * 0.05;
    cl.intensity   = 0.3 + Math.sin(t * 1.5 + i) * 0.1;
  });

  const bp = bubbles.geometry.attributes.position;
  for (let i = 0; i < 200; i++) {
    bp.setY(i, bp.getY(i) + 0.02);
    if (bp.getY(i) > 15) bp.setY(i, -10);
  }
  bp.needsUpdate = true;

  seagrassPatches.forEach(sg => sg.children.forEach(b => {
    b.rotation.z = Math.sin(t * b.userData.swaySpeed + b.userData.swayPhase) * 0.15;
  }));

  if (!sharkReady) { renderer.render(scene, camera); return; }

  // Update animasi mixer
  if (sharkMixer) sharkMixer.update(dt);

  // Shark movement
  let speed = 0;
  if (keys['ArrowUp']    || keys['w'] || keys['W']) speed =  MAX_SPEED;
  if (keys['ArrowDown']  || keys['s'] || keys['S']) speed = -MAX_SPEED * 0.5;
  if (keys['ArrowLeft']  || keys['a'] || keys['A']) sharkGroup.userData.angle += 0.045;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) sharkGroup.userData.angle -= 0.045;

  const vel = sharkGroup.userData.vel;
  vel.x += (Math.sin(sharkGroup.userData.angle) * speed - vel.x) * 0.12;
  vel.z += (Math.cos(sharkGroup.userData.angle) * speed - vel.z) * 0.12;
  vel.y  = 0;

  sharkGroup.position.x += vel.x;
  sharkGroup.position.z += vel.z;
  sharkGroup.position.y  = SHARK_PLAY_Y;
  sharkGroup.rotation.y  = sharkGroup.userData.angle;
  sharkGroup.rotation.z  = Math.sin(t * 2.5) * 0.06 * (speed > 0 ? 1 : 0.3);

  if (sharkGroup.position.x >  90) sharkGroup.position.x = -90;
  if (sharkGroup.position.x < -90) sharkGroup.position.x =  90;
  if (sharkGroup.position.z >  90) sharkGroup.position.z = -90;
  if (sharkGroup.position.z < -90) sharkGroup.position.z =  90;

  document.getElementById('speed-fill').style.width =
    Math.min(100, (vel.length() / MAX_SPEED) * 100) + '%';

  // Coral collision
  corals.forEach((c, idx) => {
    coralCooldowns.set(idx, Math.max(0, coralCooldowns.get(idx) - dt));
    if (coralCooldowns.get(idx) > 0) return;
    const dx = sharkGroup.position.x - c.x;
    const dz = sharkGroup.position.z - c.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < c.radius + 1.0) {
      sharkGroup.position.x += (dx / dist) * 0.35;
      sharkGroup.position.z += (dz / dist) * 0.35;
      vel.x *= -0.3; vel.z *= -0.3;
      score = Math.max(0, score - 15);
      combo = 0; comboTimer = 0;
      document.getElementById('score').textContent     = score;
      document.getElementById('combo-val').textContent = '0x';
      document.getElementById('kombo-display').style.opacity = '0';
      playSFX_crash();
      showPenalty('-15 NABRAK CORAL!');
      coralCooldowns.set(idx, 1.5);
    }
  });

  // Fish collision
  const toRemove = [];
  fishes.forEach(f => {
    f.position.y = PLAY_Y;
    f.rotation.z = Math.sin(t * 4 + f.userData.swimPhase) * 0.15;
    const dx   = f.position.x - sharkGroup.position.x;
    const dz   = f.position.z - sharkGroup.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1.8) {
      toRemove.push(f);
      eaten++; combo++; comboTimer = 2.5;
      const pts = 10 * Math.max(1, combo);
      score += pts;
      document.getElementById('score').textContent     = score;
      document.getElementById('eaten').textContent     = eaten;
      document.getElementById('combo-val').textContent = combo + 'x';
      if (combo > 2) playSFX_combo(); else playSFX_eat();
      showMsg(combo > 2 ? '+' + pts + ' KOMBO!' : '+' + pts);
      setTimeout(spawnFish, 2000);
    }
  });
  toRemove.forEach(f => { scene.remove(f); fishes.splice(fishes.indexOf(f), 1); });

  // Combo timer
  if (comboTimer > 0) {
    comboTimer -= dt;
    if (combo >= 3) {
      document.getElementById('kombo-display').style.opacity = '1';
      document.getElementById('kombo-display').textContent   = combo + 'x KOMBO!';
    }
    if (comboTimer <= 0) {
      combo = 0;
      document.getElementById('combo-val').textContent       = '0x';
      document.getElementById('kombo-display').style.opacity = '0';
    }
  }

  if (msgTimer     > 0) { msgTimer     -= dt; if (msgTimer     <= 0) document.getElementById('msg-popup').style.opacity     = '0'; }
  if (penaltyTimer > 0) { penaltyTimer -= dt; if (penaltyTimer <= 0) document.getElementById('penalty-popup').style.opacity = '0'; }

  // Camera
  const sp  = sharkGroup.position;
  const ang = sharkGroup.userData.angle;

  if (cameraMode === 0) {
    const targetPos = new THREE.Vector3(
      sp.x + Math.sin(ang) * -8, sp.y + 5, sp.z + Math.cos(ang) * -8
    );
    camera.position.lerp(targetPos, 0.08);
    camTarget.lerp(new THREE.Vector3(
      sp.x + Math.sin(ang) * 4, sp.y, sp.z + Math.cos(ang) * 4
    ), 0.1);
    camera.lookAt(camTarget);
  } else if (cameraMode === 1) {
    camera.position.lerp(new THREE.Vector3(
      sp.x + Math.sin(ang + Math.PI / 2) * 10, sp.y + 5, sp.z + Math.cos(ang + Math.PI / 2) * 10
    ), 0.06);
    camera.lookAt(sp);
  } else {
    camera.position.lerp(new THREE.Vector3(
      sp.x + Math.sin(ang) * 3, sp.y + 1, sp.z + Math.cos(ang) * 3
    ), 0.12);
    camera.lookAt(new THREE.Vector3(
      sp.x + Math.sin(ang) * 10, sp.y, sp.z + Math.cos(ang) * 10
    ));
  }

  renderer.render(scene, camera);
}

// ---------- START GAME (dipanggil dari tombol Mulai Main) ----------
function startGame() {
  // Tambah canvas ke body
  document.body.appendChild(renderer.domElement);

  // Load model hiu
  setLoadingBar(10, 'Memuat model hiu...');
  const gltfLoader = new THREE.GLTFLoader();
  gltfLoader.load(
    'great_white_shark.glb',
    (gltf) => {
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = new THREE.Vector3(); box.getSize(size);
      model.scale.setScalar(4.0 / Math.max(size.x, size.y, size.z));
      box.setFromObject(model);
      const center = new THREE.Vector3(); box.getCenter(center);
      model.position.sub(center);
      model.rotation.y = 0;
      model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      sharkModel = model;
      sharkGroup.add(model);

      // --- Aktifkan animasi bawaan GLB ---
      if (gltf.animations && gltf.animations.length > 0) {
        sharkMixer = new THREE.AnimationMixer(model);
        // Mainkan semua animasi yang ada (biasanya animasi berenang)
        gltf.animations.forEach(clip => {
          const action = sharkMixer.clipAction(clip);
          action.play();
        });
        console.log('Animasi ditemukan:', gltf.animations.map(a => a.name));
      } else {
        console.log('Tidak ada animasi di GLB');
      }

      sharkReady = true;
      setLoadingBar(100, 'Siap!');
      setTimeout(() => {
        hideLoading();
        showGameUI();
        animate();
      }, 500);
    },
    (xhr) => {
      if (xhr.total > 0) setLoadingBar(10 + (xhr.loaded / xhr.total) * 85, 'Memuat model hiu...');
    },
    (err) => {
      console.warn('GLB gagal, pakai model cadangan:', err);
      sharkGroup.add(makeProceduralShark());
      sharkReady = true;
      setLoadingBar(100, 'Siap! (model cadangan)');
      setTimeout(() => {
        hideLoading();
        showGameUI();
        animate();
      }, 500);
    }
  );
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});