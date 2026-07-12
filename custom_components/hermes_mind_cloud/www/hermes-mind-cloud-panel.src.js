import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

class HermesMindCloudPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.data = null;
    this.nodes = [];
    this.mode = 'all';
    this.selectedNode = null;
    this.hoveredNode = null;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.nodeObjects = [];
    this.nodeMap = new Map();
    this.lastTime = performance.now();
    this.autoDrift = 0.000035;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    const panel = hass?.panels?.['hermes-mind-cloud'];
    this.apiUrl = panel?.config?.api_url || '/api/hermes_mind_cloud/data';
    if (!this._loaded) {
      this._loaded = true;
      this.loadData();
    }
  }

  connectedCallback() {
    this.sceneHost = this.shadowRoot.getElementById('scene');
    this.detailsEl = this.shadowRoot.getElementById('details');
    this.statsEl = this.shadowRoot.getElementById('stats');
    this.filterEl = this.shadowRoot.getElementById('filters');
    this.tooltipEl = this.shadowRoot.getElementById('tooltip');
    this.initThree();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.sceneHost);
    this.resize();
    this.installEvents();
    this.raf = requestAnimationFrame((t) => this.animate(t));
  }

  disconnectedCallback() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          color: #eef3ff;
          --bg0: #040711;
          --bg1: #091125;
          --bg2: #0d1630;
          --line: rgba(126, 180, 255, 0.16);
          --panel: rgba(10, 15, 31, 0.78);
          --border: rgba(130, 175, 255, 0.12);
          font-family: Inter, system-ui, sans-serif;
        }
        * { box-sizing: border-box; }
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1.72fr) minmax(320px, 0.9fr);
          height: 100vh;
          background:
            radial-gradient(circle at 22% 18%, rgba(53, 121, 255, 0.12), transparent 28%),
            radial-gradient(circle at 70% 18%, rgba(117, 81, 255, 0.1), transparent 24%),
            linear-gradient(180deg, var(--bg1), var(--bg0));
        }
        .scene-wrap {
          position: relative;
          min-height: 60vh;
          overflow: hidden;
          border-right: 1px solid var(--border);
        }
        #scene {
          position: absolute;
          inset: 0;
        }
        canvas {
          width: 100%;
          height: 100%;
          display: block;
        }
        .hud {
          position: absolute;
          inset: 0 auto auto 0;
          width: min(620px, calc(100% - 28px));
          margin: 16px;
          pointer-events: none;
          z-index: 2;
        }
        .headline {
          pointer-events: auto;
          background: linear-gradient(180deg, rgba(9,14,31,0.76), rgba(9,14,31,0.36));
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 14px 16px;
          backdrop-filter: blur(12px);
          box-shadow: 0 12px 42px rgba(0, 0, 0, 0.24);
        }
        .eyebrow {
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #90b9ff;
          margin-bottom: 6px;
        }
        h1 {
          margin: 0;
          font-size: 26px;
          line-height: 1.04;
        }
        .sub {
          margin-top: 8px;
          color: #b6c8ef;
          font-size: 13px;
          line-height: 1.45;
          max-width: 64ch;
        }
        .filters {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
        }
        .filters button {
          background: rgba(102, 153, 255, 0.08);
          color: #dce7ff;
          border: 1px solid rgba(135, 180, 255, 0.15);
          border-radius: 999px;
          padding: 7px 11px;
          cursor: pointer;
          font-weight: 600;
        }
        .filters button.active {
          background: linear-gradient(180deg, rgba(63, 179, 255, 0.24), rgba(76, 97, 255, 0.16));
          box-shadow: 0 0 20px rgba(61,184,255,0.12);
        }
        .legend {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          color: #97a8d9;
          font-size: 12px;
        }
        .legend span::before {
          content: '';
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 8px;
          vertical-align: middle;
        }
        .memory::before { background: #7ee7ff; }
        .skill::before { background: #ae8cff; }
        .profile::before { background: #ffb86d; }
        .tool::before { background: #79f0ae; }
        .tooltip {
          position: absolute;
          transform: translate(-50%, calc(-100% - 14px));
          pointer-events: none;
          background: rgba(7, 12, 26, 0.86);
          border: 1px solid rgba(135, 180, 255, 0.18);
          border-radius: 12px;
          padding: 8px 10px;
          font-size: 12px;
          color: #ebf2ff;
          min-width: 120px;
          max-width: 260px;
          opacity: 0;
          transition: opacity 140ms ease;
          backdrop-filter: blur(8px);
          z-index: 3;
          box-shadow: 0 14px 30px rgba(0,0,0,0.26);
        }
        .tooltip.visible { opacity: 1; }
        aside {
          padding: 18px;
          overflow: auto;
          background: linear-gradient(180deg, rgba(6,10,24,0.96), rgba(10,14,31,0.92));
        }
        .card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 16px;
          margin-bottom: 14px;
          box-shadow: 0 12px 28px rgba(0,0,0,0.22);
          backdrop-filter: blur(10px);
        }
        .card h2, .card h3 { margin: 0 0 10px 0; }
        .stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .stat {
          padding: 12px;
          border-radius: 14px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .stat .v { font-size: 24px; font-weight: 800; }
        .stat .k { font-size: 12px; color: #93a4d6; text-transform: uppercase; letter-spacing: 0.08em; }
        .detail-type {
          display: inline-block;
          font-size: 12px;
          color: #8ab7ff;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          margin-bottom: 10px;
        }
        .detail-body {
          color: #d9e3ff;
          line-height: 1.55;
          font-size: 14px;
          white-space: pre-wrap;
        }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .chip {
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(126, 180, 255, 0.10);
          border: 1px solid rgba(126, 180, 255, 0.12);
          color: #d9e3ff;
          font-size: 12px;
        }
        .list { display: grid; gap: 8px; }
        .row {
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          color: #cfdbff;
        }
        .row strong { display: block; }
        .row small { color: #95a8d7; }
        @media (max-width: 980px) {
          .layout { grid-template-columns: 1fr; grid-template-rows: minmax(56vh, 60vh) auto; }
          .scene-wrap { border-right: 0; border-bottom: 1px solid var(--border); }
        }
      </style>
      <div class="layout">
        <div class="scene-wrap">
          <div id="scene"></div>
          <div class="tooltip" id="tooltip"></div>
          <div class="hud">
            <div class="headline">
              <div class="eyebrow">Hermes / Neural Memory Topology</div>
              <h1>Mind Cloud</h1>
              <div class="sub">Riktig 3D-scen med lugn kamera, klickbara minnesnoder och semantiska kluster. Dra för att rotera, scrolla för att zooma, klicka för detaljer.</div>
              <div class="filters" id="filters"></div>
              <div class="legend">
                <span class="memory">Memory</span>
                <span class="skill">Skills</span>
                <span class="profile">Profile</span>
                <span class="tool">Tools</span>
              </div>
            </div>
          </div>
        </div>
        <aside>
          <div class="card">
            <h2>Live snapshot</h2>
            <div class="stats" id="stats"></div>
          </div>
          <div class="card" id="details"></div>
          <div class="card">
            <h3>Top skills</h3>
            <div class="list" id="topskills"></div>
          </div>
        </aside>
      </div>
    `;
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050916);
    this.scene.fog = new THREE.FogExp2(0x070b18, 0.0022);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 2000);
    this.camera.position.set(0, 20, 320);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.sceneHost.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false;
    this.controls.minDistance = 180;
    this.controls.maxDistance = 520;
    this.controls.autoRotate = false;
    this.controls.target.set(0, 8, 0);

    const ambient = new THREE.AmbientLight(0x8fb5ff, 0.9);
    this.scene.add(ambient);

    const keyLight = new THREE.PointLight(0x6ed5ff, 1.5, 1200, 2);
    keyLight.position.set(0, 40, 35);
    this.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x6e7dff, 0.65, 1100, 2);
    fillLight.position.set(-180, 80, 220);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x89ffc9, 0.4, 900, 2);
    rimLight.position.set(210, -40, -180);
    this.scene.add(rimLight);

    const coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(18, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x85e8ff, transparent: true, opacity: 0.95 })
    );
    this.scene.add(coreGlow);
    this.coreGlow = coreGlow;

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(36, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x4c69ff, transparent: true, opacity: 0.08 })
    );
    this.scene.add(shell);
    this.coreShell = shell;

    this.graphRoot = new THREE.Group();
    this.scene.add(this.graphRoot);
  }

  async loadData() {
    try {
      const apiPath = this.apiUrl.startsWith('/api/') ? this.apiUrl.slice(5) : this.apiUrl.replace(/^\//, '');
      if (this._hass?.callApi) {
        this.data = await this._hass.callApi('GET', apiPath);
      } else {
        const response = await fetch(this.apiUrl, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        this.data = await response.json();
      }
      this.buildNodes();
      this.rebuildScene();
      this.applyVisibility();
      this.selectedNode = {
        title: this.data.core.title,
        type: 'core',
        group: 'core',
        text: this.data.core.text,
        meta: `${this.data.meta.memory_count} memories · ${this.data.meta.top_skill_count} visible skills`,
      };
      this.updateFilters();
      this.updateSidePanel();
    } catch (err) {
      this.detailsEl.innerHTML = `<h3>Could not load data</h3><div class="detail-body">${String(err?.message || err)}</div>`;
    }
  }

  colorFor(node) {
    if (node.type === 'memory') return 0x7ee7ff;
    if (node.type === 'skill') return 0xae8cff;
    if (node.type === 'profile') return 0xffb86d;
    if (node.type === 'tool') return 0x79f0ae;
    return 0xd9e7ff;
  }

  colorCss(node) {
    if (node.type === 'memory') return '#7ee7ff';
    if (node.type === 'skill') return '#ae8cff';
    if (node.type === 'profile') return '#ffb86d';
    if (node.type === 'tool') return '#79f0ae';
    return '#d9e7ff';
  }

  buildNodes() {
    if (!this.data) return;
    const clusters = {
      memory: { center: new THREE.Vector3(-75, -6, 10), spread: new THREE.Vector3(85, 52, 72), baseSize: 2.8 },
      profile: { center: new THREE.Vector3(86, -36, -18), spread: new THREE.Vector3(84, 48, 64), baseSize: 2.7 },
      skill: { center: new THREE.Vector3(12, 62, 26), spread: new THREE.Vector3(124, 72, 116), baseSize: 2.9 },
      tool: { center: new THREE.Vector3(0, 0, -88), spread: new THREE.Vector3(72, 44, 58), baseSize: 2.5 },
    };
    const jitter = (seed, scale) => (Math.sin(seed * 12.9898) + Math.cos(seed * 78.233)) * 0.5 * scale;
    const groups = [];
    const pack = (items, type) => {
      const cluster = clusters[type];
      items.forEach((item, idx) => {
        const s = idx + 1;
        const count = Math.max(items.length, 1);
        const theta = (idx / count) * Math.PI * 2.5 + jitter(s, 0.35);
        const phi = ((idx * 1.618) % count) / count * Math.PI;
        const radial = 0.38 + ((idx % 7) / 6) * 0.64;
        const position = new THREE.Vector3(
          cluster.center.x + Math.cos(theta) * Math.sin(phi + 0.4) * cluster.spread.x * radial + jitter(s * 0.7, 16),
          cluster.center.y + Math.sin(theta * 1.3) * cluster.spread.y * radial + jitter(s * 1.1, 10),
          cluster.center.z + Math.cos(phi) * cluster.spread.z * radial + jitter(s * 0.4, 14)
        );
        groups.push({
          ...item,
          type,
          position,
          drift: 0.18 + (idx % 5) * 0.05,
          wobble: 3.5 + (idx % 4) * 1.2,
          phase: theta,
          size: cluster.baseSize + (item.importance || 0.4) * 3.8,
          alpha: 0.42 + (item.importance || 0.4) * 0.45,
        });
      });
    };

    pack(this.data.memories, 'memory');
    pack(this.data.profile, 'profile');
    pack(this.data.skills, 'skill');
    pack(this.data.tools, 'tool');
    this.nodes = groups;
    this.updateTopSkills();
  }

  rebuildScene() {
    if (!this.graphRoot) return;
    while (this.graphRoot.children.length) {
      const child = this.graphRoot.children.pop();
      if (child.geometry) child.geometry.dispose?.();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
        else child.material.dispose?.();
      }
      if (child.parent) child.parent.remove(child);
    }

    this.linkPairs = [];
    this.nodeObjects = [];
    this.nodeMap = new Map();

    const sphereGeo = new THREE.SphereGeometry(1, 20, 20);
    for (const node of this.nodes) {
      const color = this.colorFor(node);
      const material = new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.75,
        roughness: 0.34,
        metalness: 0.04,
        transparent: true,
        opacity: Math.min(0.98, node.alpha),
      });
      const mesh = new THREE.Mesh(sphereGeo.clone(), material);
      mesh.position.copy(node.position);
      const scale = node.size;
      mesh.scale.setScalar(scale);
      mesh.userData.node = node;
      this.graphRoot.add(mesh);
      this.nodeObjects.push(mesh);
      this.nodeMap.set(node.id, mesh);
    }

    const linkPositions = [];
    const linkPairs = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      const neighbors = [];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const dist = a.position.distanceTo(b.position);
        const threshold = a.type === b.type ? 72 : 58;
        if (dist < threshold) neighbors.push({ b, dist });
      }
      neighbors.sort((x, y) => x.dist - y.dist);
      for (const { b } of neighbors.slice(0, a.importance > 0.72 ? 3 : 2)) {
        linkPositions.push(a.position.x, a.position.y, a.position.z, b.position.x, b.position.y, b.position.z);
        linkPairs.push([this.nodeMap.get(a.id), this.nodeMap.get(b.id)]);
      }
    }

    this.linkPairs = linkPairs;
    if (linkPositions.length) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPositions, 3));
      const lineMat = new THREE.LineBasicMaterial({ color: 0x86c2ff, transparent: true, opacity: 0.15 });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      this.graphRoot.add(lines);
      this.lines = lines;
    }
  }

  installEvents() {
    this.renderer.domElement.addEventListener('pointermove', (ev) => this.onPointerMove(ev));
    this.renderer.domElement.addEventListener('pointerleave', () => {
      this.hoveredNode = null;
      this.tooltipEl.classList.remove('visible');
    });
    this.renderer.domElement.addEventListener('click', (ev) => this.onClick(ev));
  }

  onPointerMove(ev) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointer.set(x, y);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.nodeObjects);
    const hit = hits[0]?.object?.userData?.node || null;
    this.hoveredNode = hit;
    if (hit) {
      this.tooltipEl.textContent = hit.title;
      this.tooltipEl.style.left = `${ev.clientX - rect.left}px`;
      this.tooltipEl.style.top = `${ev.clientY - rect.top}px`;
      this.tooltipEl.classList.add('visible');
      if (this.hoveredNode !== this.selectedNode) this.updateHoverDetails();
    } else {
      this.tooltipEl.classList.remove('visible');
    }
  }

  onClick() {
    if (!this.hoveredNode) return;
    this.selectedNode = this.hoveredNode;
    this.updateSidePanel();
    const mesh = this.nodeMap.get(this.selectedNode.id);
    if (mesh) {
      this.controls.target.lerp(mesh.position, 0.35);
    }
  }

  updateFilters() {
    const modes = [
      ['all', 'All'],
      ['memory', 'Memory'],
      ['skill', 'Skills'],
      ['profile', 'Profile'],
      ['tool', 'Tools'],
    ];
    this.filterEl.innerHTML = '';
    modes.forEach(([value, label]) => {
      const button = document.createElement('button');
      button.textContent = label;
      if (this.mode === value) button.classList.add('active');
      button.addEventListener('click', () => {
        this.mode = value;
        this.applyVisibility();
        this.updateFilters();
      });
      this.filterEl.appendChild(button);
    });
  }

  applyVisibility() {
    for (const mesh of this.nodeObjects) {
      const node = mesh.userData.node;
      mesh.visible = this.mode === 'all' || node.type === this.mode;
    }
    if (this.lines) this.lines.visible = this.mode === 'all';
  }

  updateTopSkills() {
    const el = this.shadowRoot.getElementById('topskills');
    if (!this.data) return;
    el.innerHTML = this.data.skills.slice(0, 8).map((skill) => `
      <div class="row">
        <strong>${skill.title}</strong>
        <small>${skill.category} · uses ${skill.use_count} · views ${skill.view_count}</small>
      </div>
    `).join('');
  }

  updateSidePanel() {
    if (!this.data) return;
    this.statsEl.innerHTML = `
      <div class="stat"><div class="v">${this.data.meta.memory_count}</div><div class="k">Memories</div></div>
      <div class="stat"><div class="v">${this.data.meta.profile_count}</div><div class="k">Profile nodes</div></div>
      <div class="stat"><div class="v">${this.data.meta.top_skill_count}</div><div class="k">Visible skills</div></div>
      <div class="stat"><div class="v">${this.data.meta.tool_count}</div><div class="k">Tools</div></div>
    `;
    const item = this.selectedNode;
    if (!item) return;
    const chips = [];
    if (item.group) chips.push(item.group);
    if (item.category) chips.push(item.category);
    if (item.use_count != null) chips.push(`uses ${item.use_count}`);
    if (item.view_count != null) chips.push(`views ${item.view_count}`);
    if (item.patch_count != null) chips.push(`patches ${item.patch_count}`);
    if (item.meta) chips.push(item.meta);

    this.detailsEl.innerHTML = `
      <div class="detail-type">${item.type || 'core'}</div>
      <h3>${item.title}</h3>
      <div class="detail-body">${item.text || ''}</div>
      <div class="chips">${chips.map((chip) => `<span class="chip">${chip}</span>`).join('')}</div>
    `;
  }

  updateHoverDetails() {
    if (!this.hoveredNode) return;
    const item = this.hoveredNode;
    this.detailsEl.innerHTML = `
      <div class="detail-type">hover · ${item.type}</div>
      <h3>${item.title}</h3>
      <div class="detail-body">${item.text || ''}</div>
      <div class="chips">
        <span class="chip">${item.group || item.category || 'node'}</span>
        ${item.use_count != null ? `<span class="chip">uses ${item.use_count}</span>` : ''}
      </div>
    `;
  }

  resize() {
    if (!this.sceneHost || !this.renderer || !this.camera) return;
    const rect = this.sceneHost.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height, false);
  }

  animate(time) {
    const dt = Math.min(32, time - this.lastTime);
    this.lastTime = time;
    const t = time * 0.001;

    if (this.graphRoot) {
      this.graphRoot.rotation.y += this.autoDrift * dt;
      this.coreGlow.scale.setScalar(1 + Math.sin(t * 1.2) * 0.06);
      this.coreShell.rotation.y -= this.autoDrift * dt * 3;
      this.coreShell.rotation.x += this.autoDrift * dt * 1.3;
    }

    for (const mesh of this.nodeObjects) {
      const node = mesh.userData.node;
      mesh.position.x = node.position.x + Math.cos(t * node.drift + node.phase) * node.wobble;
      mesh.position.y = node.position.y + Math.sin(t * node.drift * 1.6 + node.phase) * (node.wobble * 0.45);
      mesh.position.z = node.position.z + Math.sin(t * node.drift * 1.1 + node.phase * 0.7) * (node.wobble * 0.8);
      const active = this.hoveredNode?.id === node.id || this.selectedNode?.id === node.id;
      const scale = active ? node.size * 1.18 : node.size;
      mesh.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.18);
      mesh.material.emissiveIntensity = active ? 1.35 : 0.72;
      mesh.material.opacity = active ? 1 : Math.min(0.98, node.alpha);
    }

    if (this.lines?.geometry && this.linkPairs?.length) {
      const pos = this.lines.geometry.attributes.position.array;
      let k = 0;
      for (const [a, b] of this.linkPairs) {
        pos[k++] = a.position.x; pos[k++] = a.position.y; pos[k++] = a.position.z;
        pos[k++] = b.position.x; pos[k++] = b.position.y; pos[k++] = b.position.z;
      }
      this.lines.geometry.attributes.position.needsUpdate = true;
    }

    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
    this.raf = requestAnimationFrame((next) => this.animate(next));
  }
}

customElements.define('hermes-mind-cloud-panel', HermesMindCloudPanel);
