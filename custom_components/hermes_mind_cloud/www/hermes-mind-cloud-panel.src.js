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
    this.clusterShells = [];
    this.lastTime = performance.now();
    this.autoDrift = 0.00001;
    this.cameraHome = new THREE.Vector3(0, 20, 320);
    this.cameraTarget = new THREE.Vector3(0, 8, 0);
    this.sectionState = {
      hud: false,
      snapshot: false,
      details: false,
      skills: true,
    };
    this.viewPreset = 'focus';
    this.labelItems = [];
    this.labelNodes = [];
    this.selectedLinks = [];
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
    this.presetEl = this.shadowRoot.getElementById('presets');
    this.tooltipEl = this.shadowRoot.getElementById('tooltip');
    this.labelsEl = this.shadowRoot.getElementById('labels');
    this.installSectionToggles();
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
          --bg0: #02030a;
          --bg1: #070312;
          --bg2: #11061f;
          --line: rgba(255, 56, 179, 0.18);
          --panel: rgba(12, 7, 28, 0.78);
          --border: rgba(255, 71, 198, 0.16);
          font-family: Inter, system-ui, sans-serif;
        }
        * { box-sizing: border-box; }
        .layout {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1.78fr) minmax(300px, 0.82fr);
          height: 100vh;
          background:
            radial-gradient(circle at 18% 16%, rgba(255, 45, 167, 0.16), transparent 24%),
            radial-gradient(circle at 74% 14%, rgba(121, 56, 255, 0.15), transparent 22%),
            radial-gradient(circle at 50% 58%, rgba(32, 255, 240, 0.08), transparent 22%),
            linear-gradient(180deg, #09030f, #04030b 58%, #020207);
        }
        .layout::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: repeating-linear-gradient(180deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 4px);
          mix-blend-mode: soft-light;
          opacity: 0.28;
        }
        .scene-wrap {
          position: relative;
          min-height: 60vh;
          overflow: hidden;
          border-right: 1px solid rgba(255, 66, 200, 0.10);
          box-shadow: inset -30px 0 90px rgba(10, 3, 24, 0.54), inset 0 0 140px rgba(31, 245, 255, 0.05);
        }
        .scene-wrap::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background: radial-gradient(circle at 50% 50%, transparent 38%, rgba(255, 33, 170, 0.06) 70%, rgba(0,0,0,0.22) 100%);
        }
        #scene {
          position: absolute;
          inset: 0;
        }
        .labels {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          overflow: hidden;
        }
        canvas {
          width: 100%;
          height: 100%;
          display: block;
        }
        .hud {
          position: absolute;
          inset: 0 auto auto 0;
          width: min(520px, calc(100% - 28px));
          margin: 16px;
          pointer-events: none;
          z-index: 2;
        }
        .headline {
          pointer-events: auto;
          background: linear-gradient(180deg, rgba(18,8,34,0.82), rgba(8,6,24,0.28));
          border: 1px solid rgba(255, 77, 193, 0.28);
          border-radius: 18px;
          padding: 12px 14px;
          backdrop-filter: blur(14px);
          box-shadow: 0 0 0 1px rgba(255, 77, 193, 0.08), 0 0 24px rgba(255, 40, 164, 0.16), 0 0 48px rgba(58, 230, 255, 0.10), 0 14px 44px rgba(0, 0, 0, 0.22);
        }
        .eyebrow {
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #ff5fc9;
          margin-bottom: 6px;
          text-shadow: 0 0 12px rgba(255, 74, 193, 0.44);
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
        .filters, .presets {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
        }
        .presets {
          margin-top: 10px;
        }
        .filters button, .presets button {
          background: rgba(33, 238, 255, 0.08);
          color: #e7f8ff;
          border: 1px solid rgba(65, 245, 255, 0.22);
          border-radius: 999px;
          padding: 7px 11px;
          cursor: pointer;
          font-weight: 700;
          box-shadow: inset 0 0 12px rgba(71, 197, 255, 0.06);
        }
        .filters button.active, .presets button.active {
          background: linear-gradient(180deg, rgba(255, 54, 182, 0.30), rgba(51, 250, 255, 0.18));
          box-shadow: 0 0 26px rgba(255, 54, 182, 0.22), 0 0 20px rgba(43, 233, 255, 0.18), inset 0 0 18px rgba(90, 195, 255, 0.12);
        }
        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .toggle-btn {
          appearance: none;
          border: 1px solid rgba(133, 180, 255, 0.12);
          background: rgba(95, 130, 255, 0.08);
          color: #d7e5ff;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          line-height: 1;
          cursor: pointer;
        }
        .toggle-btn:hover {
          background: rgba(95, 130, 255, 0.14);
        }
        .section-body.collapsed {
          display: none;
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
        .label {
          position: absolute;
          transform: translate(-50%, -50%);
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 11px;
          line-height: 1.2;
          letter-spacing: 0.04em;
          color: #f2fcff;
          background: rgba(6, 14, 30, 0.72);
          border: 1px solid rgba(81, 246, 255, 0.18);
          backdrop-filter: blur(10px);
          white-space: nowrap;
          opacity: 0;
          transition: opacity 120ms ease, transform 120ms ease;
          text-shadow: 0 0 10px rgba(116, 239, 255, 0.55);
          box-shadow: 0 0 16px rgba(47, 236, 255, 0.08);
        }
        .label.visible { opacity: 1; }
        .label.active {
          background: rgba(30, 10, 48, 0.94);
          border-color: rgba(255, 79, 195, 0.52);
          box-shadow: 0 0 18px rgba(255, 57, 179, 0.20), 0 0 38px rgba(61, 237, 255, 0.18);
        }
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
          padding: 16px;
          overflow: auto;
          background: linear-gradient(180deg, rgba(6,10,24,0.90), rgba(10,14,31,0.84));
          backdrop-filter: blur(8px);
        }
        .card {
          background: linear-gradient(180deg, rgba(8, 18, 40, 0.78), rgba(9, 13, 30, 0.62));
          border: 1px solid rgba(85, 232, 255, 0.16);
          border-radius: 18px;
          padding: 14px;
          margin-bottom: 12px;
          box-shadow: 0 0 0 1px rgba(82, 214, 255, 0.04), 0 0 22px rgba(45, 207, 255, 0.08), 0 10px 24px rgba(0,0,0,0.18);
          backdrop-filter: blur(12px);
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
          <div class="labels" id="labels"></div>
          <div class="tooltip" id="tooltip"></div>
          <div class="hud">
            <div class="headline">
              <div class="section-head">
                <div>
                  <div class="eyebrow">Hermes / Neural Memory Topology</div>
                  <h1>Mind Cloud</h1>
                </div>
                <button class="toggle-btn" data-section-toggle="hud">Minimera</button>
              </div>
              <div class="section-body" data-section-body="hud">
                <div class="sub">Cyberpunk-pass: svartlila djup, hetare magenta/cyan-neon, scanline-hologramkänsla och tätare energinät utan större bollar.</div>
                <div class="presets" id="presets"></div>
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
        </div>
        <aside>
          <div class="card">
            <div class="section-head">
              <h2>Live snapshot</h2>
              <button class="toggle-btn" data-section-toggle="snapshot">Minimera</button>
            </div>
            <div class="section-body" data-section-body="snapshot">
              <div class="stats" id="stats"></div>
            </div>
          </div>
          <div class="card" id="details-card">
            <div class="section-head">
              <h3>Fokus</h3>
              <button class="toggle-btn" data-section-toggle="details">Minimera</button>
            </div>
            <div class="section-body" data-section-body="details">
              <div id="details"></div>
            </div>
          </div>
          <div class="card">
            <div class="section-head">
              <h3>Top skills</h3>
              <button class="toggle-btn" data-section-toggle="skills">Visa</button>
            </div>
            <div class="section-body collapsed" data-section-body="skills">
              <div class="list" id="topskills"></div>
            </div>
          </div>
        </aside>
      </div>
    `;
  }

  installSectionToggles() {
    this.shadowRoot.querySelectorAll('[data-section-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.sectionToggle;
        this.sectionState[key] = !this.sectionState[key];
        this.applySectionState();
      });
    });
    this.applySectionState();
  }

  applySectionState() {
    this.shadowRoot.querySelectorAll('[data-section-body]').forEach((el) => {
      const key = el.dataset.sectionBody;
      const collapsed = !!this.sectionState[key];
      el.classList.toggle('collapsed', collapsed);
    });
    this.shadowRoot.querySelectorAll('[data-section-toggle]').forEach((btn) => {
      const key = btn.dataset.sectionToggle;
      btn.textContent = this.sectionState[key] ? 'Visa' : 'Minimera';
    });
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05020b);
    this.scene.fog = new THREE.FogExp2(0x0a0312, 0.0031);

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
    this.controls.enableRotate = true;
    this.controls.minDistance = 180;
    this.controls.maxDistance = 520;
    this.controls.autoRotate = false;
    this.controls.target.copy(this.cameraTarget);

    const ambient = new THREE.AmbientLight(0xc66dff, 0.72);
    this.scene.add(ambient);

    const keyLight = new THREE.PointLight(0x16f7ff, 2.45, 1450, 2);
    keyLight.position.set(0, 40, 35);
    this.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0xff35b2, 1.18, 1250, 2);
    fillLight.position.set(-180, 80, 220);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xa4ff1f, 0.56, 960, 2);
    rimLight.position.set(210, -40, -180);
    this.scene.add(rimLight);

    const coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(18, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x72f6ff, transparent: true, opacity: 0.98 })
    );
    this.scene.add(coreGlow);
    this.coreGlow = coreGlow;

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(36, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x624dff, transparent: true, opacity: 0.12 })
    );
    this.scene.add(shell);
    this.coreShell = shell;

    const stars = [];
    for (let i = 0; i < 520; i++) {
      stars.push((Math.random() - 0.5) * 1600, (Math.random() - 0.5) * 1100, (Math.random() - 0.5) * 1400);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xa8c7ff, size: 1.35, transparent: true, opacity: 0.44, sizeAttenuation: true });
    this.starfield = new THREE.Points(starGeo, starMat);
    this.scene.add(this.starfield);

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
      this.updatePresets();
      this.refreshFocusState();
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
          size: cluster.baseSize * 0.68 + (item.importance || 0.4) * 2.12,
          alpha: 0.46 + (item.importance || 0.4) * 0.42,
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
    this.clusterShells = [];
    this.nodeObjects = [];
    this.nodeMap = new Map();
    this.labelNodes = [];
    this.selectedLinks = [];

    const shells = {
      memory: { pos: [-75, -6, 10], scale: [190, 112, 152], color: 0x5fdcff },
      profile: { pos: [86, -36, -18], scale: [168, 100, 132], color: 0xffb86d },
      skill: { pos: [12, 62, 26], scale: [240, 140, 214], color: 0x9d76ff },
      tool: { pos: [0, 0, -88], scale: [146, 88, 116], color: 0x74ebb2 },
    };
    for (const [type, shell] of Object.entries(shells)) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 28, 28),
        new THREE.MeshBasicMaterial({
          color: shell.color,
          transparent: true,
          opacity: 0.003,
          wireframe: false,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      mesh.position.set(...shell.pos);
      mesh.scale.set(...shell.scale);
      mesh.userData.type = type;
      mesh.userData.baseOpacity = 0.003;
      this.graphRoot.add(mesh);
      this.clusterShells.push(mesh);
    }

    const sphereGeo = new THREE.SphereGeometry(1, 20, 20);
    for (const node of this.nodes) {
      const color = this.colorFor(node);
      const material = new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.18,
        roughness: 0.18,
        metalness: 0.14,
        clearcoat: 0.55,
        clearcoatRoughness: 0.18,
        transparent: true,
        opacity: Math.min(0.98, node.alpha),
      });
      const mesh = new THREE.Mesh(sphereGeo.clone(), material);
      mesh.position.copy(node.position);
      const scale = node.size;
      mesh.scale.setScalar(scale);
      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 18),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false })
      );
      aura.scale.setScalar(1.95);
      mesh.add(aura);
      mesh.userData.aura = aura;
      mesh.userData.node = node;
      this.graphRoot.add(mesh);
      this.nodeObjects.push(mesh);
      this.nodeMap.set(node.id, mesh);
      if ((node.importance || 0) >= 0.72 || ['memory', 'skill'].includes(node.type)) this.labelNodes.push(node);
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
    this.buildLabels();
    if (linkPositions.length) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPositions, 3));
      const lineMat = new THREE.LineBasicMaterial({ color: 0xff3eb4, transparent: true, opacity: 0.13 });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      this.graphRoot.add(lines);
      this.lines = lines;
    }

    const selectedGeo = new THREE.BufferGeometry();
    selectedGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    const selectedMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    this.selectedLines = new THREE.LineSegments(selectedGeo, selectedMat);
    this.graphRoot.add(this.selectedLines);
  }

  buildLabels() {
    if (!this.labelsEl) return;
    const priority = [...this.nodes]
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, 14);
    this.labelsEl.innerHTML = '';
    this.labelItems = priority.map((node) => {
      const el = document.createElement('div');
      el.className = 'label';
      el.textContent = node.title;
      this.labelsEl.appendChild(el);
      return { node, el };
    });
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
    this.refreshFocusState();
    this.updateSidePanel();
    const mesh = this.nodeMap.get(this.selectedNode.id);
    if (mesh) {
      this.cameraTarget.copy(mesh.position);
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
        this.refreshFocusState();
        this.updateFilters();
      });
      this.filterEl.appendChild(button);
    });
  }

  updatePresets() {
    if (!this.presetEl) return;
    const presets = [
      ['minimal', 'Minimal'],
      ['focus', 'Focus'],
      ['constellation', 'Constellation'],
      ['explore', 'Explore'],
    ];
    this.presetEl.innerHTML = '';
    presets.forEach(([value, label]) => {
      const button = document.createElement('button');
      button.textContent = label;
      if (this.viewPreset === value) button.classList.add('active');
      button.addEventListener('click', () => {
        this.viewPreset = value;
        if (value === 'minimal') {
          this.mode = 'all';
          this.sectionState.hud = false;
        }
        if (value === 'focus' && this.selectedNode?.type && this.selectedNode.type !== 'core') {
          this.mode = this.selectedNode.type;
        }
        if (value === 'explore') {
          this.mode = 'all';
          this.sectionState.skills = true;
        }
        if (value === 'constellation') {
          this.mode = 'all';
        }
        this.applySectionState();
        this.applyVisibility();
        this.refreshFocusState();
        this.updateFilters();
        this.updatePresets();
      });
      this.presetEl.appendChild(button);
    });
  }

  refreshFocusState() {
    const selectedId = this.selectedNode?.id;
    const selectedType = this.selectedNode?.type && this.selectedNode.type !== 'core' ? this.selectedNode.type : null;
    const positions = [];
    for (const [a, b] of this.linkPairs || []) {
      const aId = a?.userData?.node?.id;
      const bId = b?.userData?.node?.id;
      const related = selectedId && (aId === selectedId || bId === selectedId);
      if (!related) continue;
      positions.push(a.position.x, a.position.y, a.position.z, b.position.x, b.position.y, b.position.z);
    }
    this.selectedLinks = positions;
    if (this.selectedLines?.geometry) {
      this.selectedLines.geometry.dispose?.();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.selectedLines.geometry = geo;
      this.selectedLines.visible = positions.length > 0 && this.viewPreset !== 'minimal';
    }
    if (selectedType && this.viewPreset === 'focus') {
      this.mode = selectedType;
    }
    if (!selectedType && this.viewPreset === 'focus') {
      this.mode = 'all';
    }
    this.applyVisibility();
  }

  applyVisibility() {
    for (const mesh of this.nodeObjects) {
      const node = mesh.userData.node;
      mesh.visible = this.mode === 'all' || node.type === this.mode;
    }
    if (this.lines) this.lines.visible = this.mode === 'all';
    for (const shell of this.clusterShells || []) {
      shell.visible = this.mode === 'all' || shell.userData.type === this.mode;
    }
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
    this.updateLabelPositions();
  }

  updateLabelPositions() {
    if (!this.labelsEl || !this.labelItems?.length || !this.camera || !this.renderer) return;
    const selectedId = this.selectedNode?.id;
    const selectedType = this.selectedNode?.type && this.selectedNode.type !== 'core' ? this.selectedNode.type : null;
    for (const { node, el } of this.labelItems) {
      const mesh = this.nodeMap.get(node.id);
      if (!mesh || !mesh.visible) {
        el.classList.remove('visible', 'active');
        continue;
      }
      const pos = mesh.position.clone().project(this.camera);
      const visible = pos.z < 1 && pos.z > -1;
      const related = !selectedType || node.type === selectedType || node.id === selectedId;
      const shouldShow = visible && (
        this.viewPreset === 'explore' ||
        this.viewPreset === 'constellation' ||
        node.id === selectedId ||
        (related && (node.importance || 0) >= 0.72)
      );
      if (!shouldShow) {
        el.classList.remove('visible', 'active');
        continue;
      }
      const x = (pos.x * 0.5 + 0.5) * this.width;
      const y = (-pos.y * 0.5 + 0.5) * this.height;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.classList.toggle('active', node.id === selectedId);
      el.classList.add('visible');
    }
  }

  animate(time) {
    const dt = Math.min(32, time - this.lastTime);
    this.lastTime = time;
    const t = time * 0.001;

    if (this.graphRoot) {
      this.graphRoot.rotation.y += this.autoDrift * dt;
      this.coreGlow.scale.setScalar(1 + Math.sin(t * 1.2) * 0.06);
      this.coreShell.rotation.y -= this.autoDrift * dt * 2.2;
      this.coreShell.rotation.x += this.autoDrift * dt * 1.1;
    }
    if (this.starfield) {
      this.starfield.rotation.y += this.autoDrift * dt * 0.12;
      this.starfield.rotation.x = Math.sin(t * 0.04) * 0.04;
    }

    const selectedType = this.selectedNode?.type && this.selectedNode.type !== 'core' ? this.selectedNode.type : null;
    const selectedId = this.selectedNode?.id;
    for (const mesh of this.nodeObjects) {
      const node = mesh.userData.node;
      mesh.position.x = node.position.x + Math.cos(t * node.drift + node.phase) * node.wobble;
      mesh.position.y = node.position.y + Math.sin(t * node.drift * 1.6 + node.phase) * (node.wobble * 0.45);
      mesh.position.z = node.position.z + Math.sin(t * node.drift * 1.1 + node.phase * 0.7) * (node.wobble * 0.8);
      const active = this.hoveredNode?.id === node.id || selectedId === node.id;
      const directlyRelated = !!selectedId && (this.selectedLinks?.length ? this.linkPairs.some(([a, b]) => (a?.userData?.node?.id === selectedId && b?.userData?.node?.id === node.id) || (b?.userData?.node?.id === selectedId && a?.userData?.node?.id === node.id)) : false);
      const related = !selectedType || node.type === selectedType || directlyRelated;
      const presetScale = this.viewPreset === 'minimal' ? 0.92 : this.viewPreset === 'explore' ? 0.98 : this.viewPreset === 'constellation' ? 0.95 : 0.96;
      const scale = active ? node.size * 1.26 : related ? node.size * presetScale : node.size * 0.84;
      mesh.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.16);
      mesh.material.emissiveIntensity = active ? 2.35 : directlyRelated ? 1.58 : related ? 1.18 : 0.46;
      mesh.material.opacity = active ? 1 : directlyRelated ? Math.min(1, node.alpha) : related ? Math.min(0.98, node.alpha) : Math.max(0.10, node.alpha * 0.26);
      if (mesh.userData.aura) {
        mesh.userData.aura.material.opacity = active ? 0.34 : directlyRelated ? 0.22 : related ? 0.13 : 0.05;
        const auraScale = active ? 2.46 : directlyRelated ? 2.16 : 2.0;
        mesh.userData.aura.scale.setScalar(auraScale);
      }
    }
    for (const shell of this.clusterShells || []) {
      const emphasize = selectedType ? shell.userData.type === selectedType : true;
      shell.material.opacity = this.viewPreset === 'minimal'
        ? 0.0006
        : this.viewPreset === 'constellation'
          ? 0.0015
          : emphasize ? 0.006 : 0.0009;
      shell.rotation.y += this.autoDrift * dt * 0.18;
      shell.rotation.x += this.autoDrift * dt * 0.08;
    }

    if (this.lines?.geometry && this.linkPairs?.length) {
      const pos = this.lines.geometry.attributes.position.array;
      let k = 0;
      for (const [a, b] of this.linkPairs) {
        pos[k++] = a.position.x; pos[k++] = a.position.y; pos[k++] = a.position.z;
        pos[k++] = b.position.x; pos[k++] = b.position.y; pos[k++] = b.position.z;
      }
      this.lines.geometry.attributes.position.needsUpdate = true;
      this.lines.material.opacity = this.viewPreset === 'minimal'
        ? 0.052
        : this.viewPreset === 'constellation'
          ? 0.19
          : selectedType ? 0.078 : this.viewPreset === 'explore' ? 0.16 : 0.125;
    }

    if (this.selectedLines) {
      this.selectedLines.visible = (this.selectedLinks?.length || 0) > 0 && this.viewPreset !== 'minimal';
    }

    this.controls.target.lerp(this.cameraTarget, 0.08);
    this.controls?.update();
    this.updateLabelPositions();
    this.renderer?.render(this.scene, this.camera);
    this.raf = requestAnimationFrame((next) => this.animate(next));
  }
}

customElements.define('hermes-mind-cloud-panel', HermesMindCloudPanel);
