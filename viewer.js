import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const COLORS = { front: '#b47f9c', back: '#8c719f', 'gusset-outer': '#759c98', 'gusset-lining': '#dfbf81' };
const NAMES = { front: '前片 · 1 片', back: '后片 · 1 片', 'gusset-outer': '裆外片 · 1 片', 'gusset-lining': '棉质裆里 · 1 片' };
const PROFILE = [[0, .110, .084], [.025, .149, .112], [.060, .176, .132], [.120, .190, .140], [.200, .182, .127], [.270, .169, .115], [.350, .158, .106], [.450, .156, .105]];
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function profile(y) {
  if (y <= PROFILE[0][0]) return PROFILE[0].slice(1);
  for (let i = 1; i < PROFILE.length; i++) {
    if (y <= PROFILE[i][0]) {
      const a = PROFILE[i - 1], b = PROFILE[i], t = (y - a[0]) / (b[0] - a[0]);
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
  }
  return PROFILE.at(-1).slice(1);
}

function ellipsePerimeter(a, b) {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
}

function disposeGroup(group) {
  group.traverse(o => {
    o.geometry?.dispose();
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of materials) if (m) { m.map?.dispose(); m.dispose(); }
  });
  group.clear();
}

function surfaceGeometry(rows, columns, vertex, reverse = false) {
  const positions = [], indices = [], uv = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    positions.push(...vertex(c / columns, r / rows)); uv.push(c / columns, r / rows);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const a = r * (columns + 1) + c;
    const faces = [a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1];
    indices.push(...(reverse ? [faces[2], faces[1], faces[0], faces[5], faces[4], faces[3]] : faces));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function label(text, width = .31) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.beginPath(); ctx.roundRect(5, 8, 502, 112, 26); ctx.fill();
  ctx.font = '500 48px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#55485f'; ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.scale.set(width, width / 4, 1); sprite.renderOrder = 10;
  return sprite;
}

function line(points, color, dashed = false) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => Array.isArray(p) ? V(...p) : p));
  const material = dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: .008, gapSize: .006, transparent: true, opacity: .55 })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: .8 });
  const object = new THREE.Line(geometry, material); if (dashed) object.computeLineDistances();
  return object;
}

export class GarmentViewer {
  constructor(container, { onStatus = () => {} } = {}) {
    if (!container) throw new Error('三维展示容器不存在。');
    this.container = container; this.onStatus = onStatus;
    this.view = 'wear'; this.assembly = 3; this.bodyVisible = true; this.selected = null; this.disposed = false;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#f0edf3');
    this.scene.fog = new THREE.Fog('#f0edf3', 4, 9);
    this.camera = new THREE.PerspectiveCamera(36, 1, .01, 30);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      onStatus('三维视图未能启动：此浏览器无法使用 WebGL。'); throw error;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '可拖动旋转、滚轮缩放的内裤三维结构展示');
    this.canvas.setAttribute('role', 'img'); this.canvas.tabIndex = 0;
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', zIndex: '0', touchAction: 'none' });
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.prepend(this.canvas);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = .075;
    this.controls.minDistance = .55; this.controls.maxDistance = 5;
    this.controls.minPolarAngle = .08; this.controls.maxPolarAngle = Math.PI - .08;
    this.controls.autoRotateSpeed = .65;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    this.scene.add(new THREE.HemisphereLight('#fff9ff', '#a69eb2', 2.6));
    const key = new THREE.DirectionalLight('#ffffff', 3.3); key.position.set(-1.6, 2.6, 2.4);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: .1, far: 8 });
    key.shadow.bias = -.0001; key.shadow.normalBias = .008; key.shadow.radius = 3; key.shadow.intensity = .20;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#e0d8f5', 1.3); fill.position.set(1.8, .8, -1.8); this.scene.add(fill);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#f0edf3', roughness: 1 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -.358; this.floor.receiveShadow = true; this.scene.add(this.floor);
    this.bodyGroup = new THREE.Group(); this.bodyGroup.name = 'Actual Blender mannequin'; this.scene.add(this.bodyGroup);
    this.wearGroup = new THREE.Group(); this.flatGroup = new THREE.Group(); this.guidesGroup = new THREE.Group(); this.labelGroup = new THREE.Group();
    this.scene.add(this.wearGroup, this.flatGroup, this.guidesGroup, this.labelGroup);
    this.pieceGroups = {}; this.pieceMeshes = []; this.bodyMeshes = []; this.elasticGroup = new THREE.Group();
    this.scene.add(this.elasticGroup);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.resize(); this.reset();

    this._onContextLost = event => { event.preventDefault(); this.onStatus('三维显示连接暂时中断，请刷新页面恢复。'); };
    this.canvas.addEventListener('webglcontextlost', this._onContextLost);
    this._onPointerDown = e => { this.pointerStart = [e.clientX, e.clientY]; };
    this._onPointerUp = e => this.pick(e);
    this.canvas.addEventListener('pointerdown', this._onPointerDown); this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.onStatus('正在载入 Blender 人台…');
    new GLTFLoader().load(new URL('./assets/mannequin.glb', import.meta.url).href, gltf => {
      if (this.disposed) { disposeGroup(gltf.scene); return; }
      try {
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse(source => {
          if (!source.isMesh) return;
          const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
          const material = new THREE.MeshStandardMaterial({ color: '#e3e0e5', roughness: .74, metalness: 0 });
          const mesh = new THREE.Mesh(geometry, material); mesh.name = source.name;
          mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.userData.originalPositions = new Float32Array(geometry.attributes.position.array);
          this.bodyGroup.add(mesh); this.bodyMeshes.push(mesh);
        });
        disposeGroup(gltf.scene);
        if (!this.bodyMeshes.length) throw new Error('GLB 中没有可显示的网格。');
        this.updateBody(); this.applyVisibility(); this.onStatus('Blender 人台已载入 · 拖动旋转，滚轮缩放');
      } catch (error) { this.onStatus(`人台读取失败：${error.message}`); }
    }, undefined, error => {
      if (!this.disposed) this.onStatus(`Blender 人台未能载入：${error.message || '请检查模型文件或网络连接'}。服装结构仍可查看。`);
    });
    let previous = 0;
    const render = time => {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(render);
      if (document.hidden || time - previous < 1000 / 40) return;
      const delta = previous ? Math.min((time - previous) / 1000, .1) : .025; previous = time;
      for (const group of Object.values(this.pieceGroups)) if (group.userData.target) group.position.lerp(group.userData.target, 1 - Math.exp(-delta * 11));
      this.controls.update(delta); this.renderer.render(this.scene, this.camera);
    };
    this.frame = requestAnimationFrame(render);
  }

  resize() {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1), height = Math.max(this.container.clientHeight, 350);
    const oldAspect = this.camera.aspect;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
    if (this._hasSized && Math.abs(oldAspect - this.camera.aspect) > .04) this.reset();
    this.layoutLabels();
    this._hasSized = true;
  }

  update(model) {
    if (!model?.valid) return;
    try {
      this.model = model; this.params = model.params;
      const p = model.params, high = p.rise === 'high';
      this.frontTop = clamp((high ? .35 : .27) + (p.frontLength - (high ? 26 : 18)) / 100, .19, .43);
      this.backTop = clamp((high ? .35 : .27) + (p.backLength - (high ? 29 : 21)) / 100, .19, .43);
      this.sideTop = (this.frontTop + this.backTop) / 2;
      this.sideBottom = clamp(this.sideTop - p.sideSeam / 100, .085, this.sideTop - .025);
      this.crotchFrontY = clamp(.014 + (p.gussetLength - 17) * .002, .004, .048);
      this.crotchBackY = this.crotchFrontY;
      this.updateBody(); this.buildWear(); this.buildFlat(); this.applyVisibility(); this.selectPiece(this.selected);
    } catch (error) {
      this.onStatus(`三维参数更新失败：${error.message}`);
    }
  }

  radialScale(y) {
    if (!this.params) return 1;
    const hip = this.params.hip / 104;
    const waistY = this.sideTop || .27;
    const [a, b] = profile(waistY);
    const waist = this.params.waist / (ellipsePerimeter(a, b) * 100);
    const t = clamp((y - .12) / Math.max(.05, waistY - .12), 0, 1);
    return lerp(hip, waist, t * t * (3 - 2 * t));
  }

  updateBody() {
    for (const mesh of this.bodyMeshes) {
      const original = mesh.userData.originalPositions, pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = original[i * 3 + 1], s = this.radialScale(y);
        pos.setXYZ(i, original[i * 3] * s, y, original[i * 3 + 2] * s);
      }
      pos.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    }
  }

  pointOnPanel(id, u, v) {
    const back = id === 'back', theta = (u - .5) * Math.PI, s = Math.abs(Math.sin(theta));
    const seamWidth = (back ? this.params.gussetBack : this.params.gussetFront) / 100;
    const crotchY = back ? this.crotchBackY : this.crotchFrontY;
    const r0 = profile(crotchY)[0] * this.radialScale(crotchY) + .006;
    const joinThreshold = clamp(seamWidth / 2 / r0, .07, .66);
    const t = clamp((s - joinThreshold) / (1 - joinThreshold), 0, 1);
    const bottom = lerp(crotchY, this.sideBottom, Math.pow(t, .77));
    const top = lerp(back ? this.backTop : this.frontTop, this.sideTop, s * s);
    const y = lerp(bottom, top, v);
    const [rx, rz] = profile(y), scale = this.radialScale(y);
    return [(rx * scale + .006) * Math.sin(theta), y, (back ? -1 : 1) * (rz * scale + .006) * Math.cos(theta)];
  }

  gussetPoint(u, v, lining = false) {
    const frontWidth = this.params.gussetFront / 100, backWidth = this.params.gussetBack / 100;
    const width = lerp(frontWidth, backWidth, v) * (1 - .18 * Math.sin(Math.PI * v));
    const frontDepth = profile(this.crotchFrontY)[1] * this.radialScale(this.crotchFrontY) + .006;
    const backDepth = profile(this.crotchBackY)[1] * this.radialScale(this.crotchBackY) + .006;
    const x = (u - .5) * width;
    // A gently curved bridge, underneath the body. It remains an illustrative fabric surface.
    const y = -.016 + (.016 + lerp(this.crotchFrontY, this.crotchBackY, v)) * Math.pow(Math.abs(2 * v - 1), 2.2) + (lining ? .0028 : 0);
    const endRadius = lerp(profile(this.crotchFrontY)[0] * this.radialScale(this.crotchFrontY), profile(this.crotchBackY)[0] * this.radialScale(this.crotchBackY), v) + .006;
    const endRound = Math.sqrt(Math.max(.65, 1 - (x / endRadius) ** 2));
    const z = lerp(frontDepth, -backDepth, v) * endRound;
    return [x, y, z];
  }

  material(id) {
    const mat = new THREE.MeshStandardMaterial({ color: COLORS[id], side: THREE.DoubleSide, roughness: .9, metalness: 0, transparent: true, opacity: 1 });
    mat.userData.pieceId = id; return mat;
  }

  buildWear() {
    disposeGroup(this.wearGroup); disposeGroup(this.elasticGroup); disposeGroup(this.guidesGroup); disposeGroup(this.labelGroup);
    this.pieceGroups = {}; this.pieceMeshes = [];
    for (const id of Object.keys(COLORS)) {
      const group = new THREE.Group(); group.name = NAMES[id]; group.userData.pieceId = id;
      const isBody = id === 'front' || id === 'back';
      const point = isBody ? (u, v) => this.pointOnPanel(id, u, v) : (u, v) => this.gussetPoint(u, v, id === 'gusset-lining');
      const mesh = new THREE.Mesh(surfaceGeometry(isBody ? 40 : 32, isBody ? 72 : 18, point, id === 'back'), this.material(id));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.pieceId = id;
      mesh.renderOrder = id === 'gusset-lining' ? 2 : 1;
      group.add(mesh); this.pieceMeshes.push(mesh);
      const boundary = [];
      for (let i = 0; i <= 72; i++) boundary.push(point(i / 72, 0));
      for (let i = 1; i <= 40; i++) boundary.push(point(1, i / 40));
      for (let i = 71; i >= 0; i--) boundary.push(point(i / 72, 1));
      for (let i = 39; i >= 0; i--) boundary.push(point(0, i / 40));
      const seam = line(boundary, new THREE.Color(COLORS[id]).multiplyScalar(.55));
      seam.userData.pieceId = id; group.add(seam);
      this.wearGroup.add(group); this.pieceGroups[id] = group;
      if (isBody) {
        for (const edge of [0, 1]) {
          const points = Array.from({ length: 101 }, (_, i) => V(...point(i / 100, edge)));
          const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
          const trim = new THREE.Mesh(new THREE.TubeGeometry(curve, 128, edge ? .0024 : .0018, 6, false), new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS[id]).multiplyScalar(.7), roughness: .95 }));
          trim.userData.pieceId = id; this.elasticGroup.add(trim);
        }
      } else if (id === 'gusset-outer') {
        for (const edge of [0, 1]) {
          const points = Array.from({ length: 61 }, (_, i) => V(...point(edge, i / 60)));
          const trim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, .0016, 5, false), new THREE.MeshStandardMaterial({ color: '#527874', roughness: .95 }));
          trim.userData.pieceId = id; this.elasticGroup.add(trim);
        }
      }
    }
    const shifts = this.explodeShifts();
    const explodedPoint = (id, point) => V(...point).applyAxisAngle(V(1, 0, 0), this.explodeTilt(id)).add(shifts[id]);
    // Matching A/B gusset joins and the C side seams remain visible between separated pieces.
    const connectors = [
      [explodedPoint('front', this.pointOnPanel('front', .5, 0)), explodedPoint('gusset-outer', this.gussetPoint(.5, 0))],
      [explodedPoint('back', this.pointOnPanel('back', .5, 0)), explodedPoint('gusset-outer', this.gussetPoint(.5, 1))],
      [explodedPoint('gusset-outer', this.gussetPoint(.5, .5)), explodedPoint('gusset-lining', this.gussetPoint(.5, .5, true))],
    ];
    for (const side of [0, 1]) for (const height of [0, 1]) connectors.push([
      V(...this.pointOnPanel('front', side, height)).add(shifts.front), V(...this.pointOnPanel('back', side, height)).add(shifts.back),
    ]);
    for (const points of connectors) this.guidesGroup.add(line(points, '#b1a7bd', true));
    const placements = { front: [.0, this.frontTop + .105, .28], back: [.0, this.backTop + .125, -.27], 'gusset-outer': [-.24, -.13, .05], 'gusset-lining': [.38, .035, .05] };
    for (const id of Object.keys(COLORS)) {
      const sprite = label(NAMES[id], .23); sprite.position.set(...placements[id]);
      sprite.userData.labelId = id; sprite.userData.desktopPosition = sprite.position.clone(); this.labelGroup.add(sprite);
    }
    this.layoutLabels();
  }

  buildFlat() {
    disposeGroup(this.flatGroup);
    const pieces = this.model.pieces;
    const leftWidth = Math.max(pieces[0].seamBounds.width, pieces[2].seamBounds.width) / 100;
    const rightWidth = Math.max(pieces[1].seamBounds.width, pieces[3].seamBounds.width) / 100;
    const firstHeight = Math.max(pieces[0].seamBounds.height, pieces[1].seamBounds.height) / 100;
    const secondHeight = Math.max(pieces[2].seamBounds.height, pieces[3].seamBounds.height) / 100;
    const gap = .15, xLeft = -(rightWidth + gap) / 2, xRight = (leftWidth + gap) / 2;
    const totalHeight = firstHeight + secondHeight + .17;
    pieces.forEach((piece, index) => {
      const group = new THREE.Group(), b = piece.seamBounds;
      const midX = (b.minX + b.maxX) / 2, midY = (b.minY + b.maxY) / 2;
      const points = piece.seamPoints.map(([x, y]) => [(x - midX) / 100, -(y - midY) / 100]);
      const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.material(piece.id)); mesh.userData.pieceId = piece.id; group.add(mesh);
      this.pieceMeshes.push(mesh);
      const outline = line([...points, points[0]].map(([x, y]) => [x, y, .0005]), new THREE.Color(COLORS[piece.id]).multiplyScalar(.55)); outline.userData.pieceId = piece.id; group.add(outline);
      group.add(line([[0, -b.height / 200 + .01, .001], [0, b.height / 200 - .01, .001]], '#ffffff', true));
      const sprite = label(NAMES[piece.id]); sprite.position.set(0, -b.height / 200 - .044, .01); group.add(sprite);
      const row = index < 2 ? 0 : 1;
      group.position.set(index % 2 ? xRight : xLeft, row ? totalHeight / 2 - firstHeight - .17 - secondHeight / 2 : totalHeight / 2 - firstHeight / 2, 0);
      this.flatGroup.add(group);
    });
    this.flatWidth = leftWidth + rightWidth + gap; this.flatHeight = totalHeight + .13;
  }

  explodeShifts() {
    return { front: V(0, .035, .24), back: V(0, .035, -.24), 'gusset-outer': V(-.055, -.075, 0), 'gusset-lining': V(.18, .08, .015) };
  }

  explodeTilt(id) { return id === 'gusset-lining' ? .85 : id === 'gusset-outer' ? .48 : 0; }

  layoutLabels() {
    for (const sprite of this.labelGroup?.children || []) {
      if (sprite.userData.desktopPosition) sprite.position.copy(sprite.userData.desktopPosition);
      if (this.camera.aspect < 1) {
        if (sprite.userData.labelId === 'gusset-lining') sprite.position.set(.20, -.125, .03);
        if (sprite.userData.labelId === 'gusset-outer') sprite.position.set(-.20, -.15, .03);
      }
    }
  }

  applyVisibility() {
    const flat = this.view === 'flat', exploded = this.view === 'explode';
    this.flatGroup.visible = flat; this.wearGroup.visible = !flat;
    this.bodyGroup.visible = !flat && !exploded && this.bodyVisible && this.assembly !== 2;
    this.elasticGroup.visible = !flat && !exploded && this.assembly !== 2;
    this.guidesGroup.visible = exploded; this.labelGroup.visible = exploded;
    this.floor.visible = !flat;
    const shifts = this.explodeShifts();
    for (const [id, group] of Object.entries(this.pieceGroups)) {
      group.userData.target = exploded ? shifts[id] : V(0, 0, 0);
      group.rotation.x = exploded ? this.explodeTilt(id) : 0;
      // Keep a newly generated group in its current view without a misleading assembly flash.
      if (!group.userData.positionInitialized) { group.position.copy(group.userData.target); group.userData.positionInitialized = true; }
    }
  }

  setView(view) {
    if (!['wear', 'explode', 'flat'].includes(view)) return;
    this.view = view; this.assembly = view === 'wear' ? 3 : view === 'flat' ? 0 : 1;
    this.applyVisibility(); this.reset();
  }

  setAssembly(step) {
    const value = clamp(Math.round(Number(step) || 0), 0, 3);
    this.assembly = value; this.view = value === 0 ? 'flat' : value === 1 ? 'explode' : 'wear';
    this.applyVisibility(); this.reset();
  }

  reset() {
    if (this.view === 'flat') {
      const fit = Math.max((this.flatHeight || .75), (this.flatWidth || 1.2) / Math.max(this.camera.aspect, .45));
      const distance = fit / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.2;
      this.camera.position.set(0, 0, Math.max(1.4, distance)); this.controls.target.set(0, 0, 0);
    } else if (this.view === 'explode') {
      const fit = Math.max(1, .94 / this.camera.aspect * Math.sqrt(Math.max(1, (this.params?.hip || 104) / 104)));
      this.camera.position.set(.82 * fit, .13 + .30 * fit, 1.20 * fit); this.controls.target.set(0, .13, 0);
    } else {
      const fit = Math.max(1, .65 / this.camera.aspect * Math.max(1, (this.params?.hip || 104) / 104));
      this.camera.position.set(.78 * fit, .065 + .285 * fit, 1.42 * fit); this.controls.target.set(0, .065, 0);
    }
    this.controls.update(); this.controls.saveState();
  }

  setCamera(direction) {
    const sign = direction === 'back' ? -1 : 1;
    const distance = this.view === 'flat' ? Math.max(this.camera.position.distanceTo(this.controls.target), 1.6) : this.view === 'explode' ? 1.95 : 1.62;
    const y = this.view === 'flat' ? 0 : .065;
    this.controls.target.set(0, y, 0); this.camera.position.set(0, y + (this.view === 'flat' ? 0 : .10), sign * distance); this.controls.update();
  }

  setBodyVisible(visible) { this.bodyVisible = Boolean(visible); this.applyVisibility(); }
  setAutoRotate(rotate) { this.controls.autoRotate = Boolean(rotate); }

  selectPiece(id) {
    this.selected = Object.hasOwn(COLORS, id) ? id : null;
    const apply = object => {
      if (!object.material || !object.userData.pieceId) return;
      const active = !this.selected || object.userData.pieceId === this.selected;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const mat of materials) {
        mat.transparent = true; mat.opacity = active ? 1 : .27;
        mat.depthWrite = active;
        if (mat.emissive) { mat.emissive.set(active && this.selected ? COLORS[this.selected] : '#000000'); mat.emissiveIntensity = active && this.selected ? .10 : 0; }
      }
      object.renderOrder = active ? 2 : 1;
    };
    this.wearGroup.traverse(apply); this.flatGroup.traverse(apply); this.elasticGroup.traverse(apply);
  }

  pick(event) {
    if (!this.pointerStart || Math.hypot(event.clientX - this.pointerStart[0], event.clientY - this.pointerStart[1]) > 6 || event.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect(), mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, this.camera);
    const visible = this.pieceMeshes.filter(m => { let o = m; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
    const hit = ray.intersectObjects(visible, false)[0];
    if (hit) { const id = hit.object.userData.pieceId; this.selectPiece(id); this.container.dispatchEvent(new CustomEvent('piece-select', { detail: { id } })); }
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect(); this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this._onPointerDown); this.canvas.removeEventListener('pointerup', this._onPointerUp); this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    disposeGroup(this.scene); this.renderer.dispose(); this.canvas.remove();
  }
}
