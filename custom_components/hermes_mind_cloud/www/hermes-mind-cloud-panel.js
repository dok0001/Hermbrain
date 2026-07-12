class HermesMindCloudPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.data = null;
    this.nodes = [];
    this.mode = 'all';
    this.selectedNode = null;
    this.hoveredNode = null;
    this.dragging = false;
    this.rotation = { x: -0.22, y: 0.28 };
    this.spin = 0;
    this.lastTime = performance.now();
    this.autoSpin = 0.00003;
    this.starfield = Array.from({ length: 180 }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random() * 0.9 + 0.1,
      s: Math.random() * 1.8 + 0.2,
    }));
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
    this.canvas = this.shadowRoot.getElementById('cloud');
    this.ctx = this.canvas.getContext('2d');
    this.detailsEl = this.shadowRoot.getElementById('details');
    this.statsEl = this.shadowRoot.getElementById('stats');
    this.filterEl = this.shadowRoot.getElementById('filters');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.shadowRoot.querySelector('.canvas-wrap'));
    this.resize();
    this.installEvents();
    this.raf = requestAnimationFrame((t) => this.animate(t));
  }

  disconnectedCallback() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          height: 100%;
          color: #eef3ff;
          --bg0: #050816;
          --bg1: #0b1026;
          --bg2: #111936;
          --line: rgba(126, 180, 255, 0.16);
          --panel: rgba(13, 19, 40, 0.78);
          --border: rgba(130, 175, 255, 0.14);
          --glow: rgba(61, 184, 255, 0.45);
          font-family: Inter, system-ui, sans-serif;
        }
        * { box-sizing: border-box; }
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.95fr);
          height: 100vh;
          background:
            radial-gradient(circle at 20% 20%, rgba(66, 153, 225, 0.14), transparent 30%),
            radial-gradient(circle at 80% 10%, rgba(166, 85, 247, 0.12), transparent 28%),
            linear-gradient(180deg, var(--bg1), var(--bg0));
        }
        .canvas-wrap {
          position: relative;
          min-height: 60vh;
          overflow: hidden;
          border-right: 1px solid var(--border);
        }
        canvas { width: 100%; height: 100%; display: block; }
        .hud {
          position: absolute;
          inset: 0 auto auto 0;
          width: min(640px, calc(100% - 28px));
          margin: 16px;
          pointer-events: none;
        }
        .headline {
          pointer-events: auto;
          background: linear-gradient(180deg, rgba(10,16,38,0.88), rgba(10,16,38,0.55));
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 16px 18px;
          backdrop-filter: blur(14px);
          box-shadow: 0 12px 42px rgba(0, 0, 0, 0.28);
        }
        .eyebrow {
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #8ab7ff;
          margin-bottom: 6px;
        }
        h1 {
          margin: 0;
          font-size: 28px;
          line-height: 1.05;
        }
        .sub {
          margin-top: 10px;
          color: #b8c8ee;
          font-size: 14px;
          line-height: 1.45;
          max-width: 62ch;
        }
        .filters {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
          pointer-events: auto;
        }
        .filters button {
          background: rgba(102, 153, 255, 0.09);
          color: #dce7ff;
          border: 1px solid rgba(135, 180, 255, 0.18);
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
          font-weight: 600;
        }
        .filters button.active {
          background: linear-gradient(180deg, rgba(63, 179, 255, 0.28), rgba(76, 97, 255, 0.2));
          box-shadow: 0 0 20px rgba(61,184,255,0.18);
        }
        .legend {
          pointer-events: auto;
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
        .card h2, .card h3 {
          margin: 0 0 10px 0;
        }
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
          .canvas-wrap { border-right: 0; border-bottom: 1px solid var(--border); }
        }
      </style>
      <div class="layout">
        <div class="canvas-wrap">
          <canvas id="cloud"></canvas>
          <div class="hud">
            <div class="headline">
              <div class="eyebrow">Hermes / Cognitive Topology</div>
              <h1>Mind Cloud</h1>
              <div class="sub">Ett levande 3D-liknande kunskapsmoln av riktiga Hermes-minnen, skills och fokusområden. Dra för att rotera, klicka på en nod för detaljer.</div>
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

  async loadData() {
    try {
      const apiPath = this.apiUrl.startsWith('/api/') ? this.apiUrl.slice(5) : this.apiUrl.replace(/^\//, '');
      if (this._hass?.callApi) {
        this.data = await this._hass.callApi('GET', apiPath);
      } else {
        const response = await fetch(this.apiUrl, { credentials: 'same-origin' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        this.data = await response.json();
      }
      this.buildNodes();
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
    if (node.type === 'memory') return '#7ee7ff';
    if (node.type === 'skill') return '#ae8cff';
    if (node.type === 'profile') return '#ffb86d';
    if (node.type === 'tool') return '#79f0ae';
    return '#d9e7ff';
  }

  buildNodes() {
    if (!this.data) return;
    const groups = [];
    const clusters = {
      memory: { center: [-70, -12, 10], spread: [88, 56, 74], baseSize: 5.8 },
      profile: { center: [82, -42, -20], spread: [82, 52, 68], baseSize: 5.2 },
      skill: { center: [18, 56, 30], spread: [126, 74, 116], baseSize: 5.4 },
      tool: { center: [0, 0, -82], spread: [72, 44, 62], baseSize: 5.0 },
    };
    const jitter = (seed, scale) => (Math.sin(seed * 12.9898) + Math.cos(seed * 78.233)) * 0.5 * scale;
    const pack = (items, type) => {
      const cluster = clusters[type];
      items.forEach((item, idx) => {
        const s = idx + 1;
        const theta = (idx / Math.max(items.length, 1)) * Math.PI * 2.35 + jitter(s, 0.35);
        const phi = ((idx * 1.618) % items.length) / Math.max(items.length, 1) * Math.PI;
        const radial = 0.4 + ((idx % 7) / 6) * 0.6;
        const x = cluster.center[0] + Math.cos(theta) * Math.sin(phi + 0.35) * cluster.spread[0] * radial + jitter(s * 0.7, 16);
        const y = cluster.center[1] + Math.sin(theta * 1.3) * cluster.spread[1] * radial + jitter(s * 1.1, 10);
        const z = cluster.center[2] + Math.cos(phi) * cluster.spread[2] * radial + jitter(s * 0.4, 14);
        groups.push({
          ...item,
          type,
          cx: x,
          cy: y,
          cz: z,
          drift: 0.00004 + (idx % 5) * 0.000012,
          wobble: 10 + (idx % 4) * 4,
          phase: theta,
          size: cluster.baseSize + (item.importance || 0.4) * 8,
          alpha: 0.42 + (item.importance || 0.4) * 0.4,
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

  installEvents() {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (ev) => {
      this.dragging = true;
      this.dragStart = { x: ev.clientX, y: ev.clientY, rx: this.rotation.x, ry: this.rotation.y };
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointermove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      if (this.dragging) {
        this.rotation.y = this.dragStart.ry + (ev.clientX - this.dragStart.x) * 0.004;
        this.rotation.x = this.dragStart.rx + (ev.clientY - this.dragStart.y) * 0.003;
      }
      this.hoveredNode = this.pickNode(ev.clientX - rect.left, ev.clientY - rect.top);
      canvas.style.cursor = this.hoveredNode ? 'pointer' : (this.dragging ? 'grabbing' : 'grab');
    });
    canvas.addEventListener('pointerup', (ev) => {
      if (this.dragging) {
        const rect = canvas.getBoundingClientRect();
        const picked = this.pickNode(ev.clientX - rect.left, ev.clientY - rect.top);
        if (picked) {
          this.selectedNode = picked;
          this.updateSidePanel();
        }
      }
      this.dragging = false;
      canvas.releasePointerCapture(ev.pointerId);
    });
    canvas.addEventListener('pointerleave', () => {
      this.dragging = false;
      this.hoveredNode = null;
    });
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
        this.updateFilters();
      });
      this.filterEl.appendChild(button);
    });
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

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.center = { x: rect.width * 0.5, y: rect.height * 0.55 };
  }

  visibleNodes() {
    if (this.mode === 'all') return this.nodes;
    return this.nodes.filter((node) => node.type === this.mode);
  }

  project(node, t) {
    const tt = t * node.drift * 60;
    let x = node.cx + Math.cos(tt + node.phase) * node.wobble;
    let y = node.cy + Math.sin(tt * 1.7 + node.phase * 0.7) * (node.wobble * 0.45);
    let z = node.cz + Math.sin(tt * 1.15 + node.phase) * (node.wobble * 0.9);

    const ry = this.rotation.y + this.spin;
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const rx = this.rotation.x;
    const cosX = Math.cos(rx), sinX = Math.sin(rx);

    let dx = x * cosY - z * sinY;
    let dz = x * sinY + z * cosY;
    let dy = y * cosX - dz * sinX;
    dz = y * sinX + dz * cosX;

    const fog = Math.max(0, 1 - (dz + 260) / 980);
    const depth = 900 / (900 + dz + 380);
    return {
      x: this.center.x + dx * depth,
      y: this.center.y + dy * depth,
      z: dz,
      depth,
      fog,
      r: Math.max(1.8, node.size * depth),
      alpha: Math.max(0.05, Math.min(1, node.alpha * depth * (0.55 + fog * 0.7))),
    };
  }

  pickNode(x, y) {
    let best = null;
    let bestDist = 999999;
    for (const node of this.visibleNodes()) {
      if (!node.screen) continue;
      const dx = node.screen.x - x;
      const dy = node.screen.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < node.screen.r + 8 && d < bestDist) {
        best = node;
        bestDist = d;
      }
    }
    return best;
  }

  drawBackground(ctx) {
    ctx.clearRect(0, 0, this.width, this.height);
    const g = ctx.createRadialGradient(this.center.x, this.center.y - 30, 50, this.center.x, this.center.y, Math.max(this.width, this.height) * 0.78);
    g.addColorStop(0, 'rgba(30,86,170,0.18)');
    g.addColorStop(0.32, 'rgba(19,34,82,0.14)');
    g.addColorStop(0.72, 'rgba(7,12,28,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    const vignette = ctx.createRadialGradient(this.center.x, this.center.y, this.width * 0.12, this.center.x, this.center.y, this.width * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(2,5,14,0.44)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);

    for (const s of this.starfield) {
      const sx = (s.x * 0.5 + 0.5) * this.width;
      const sy = (s.y * 0.5 + 0.5) * this.height;
      ctx.fillStyle = `rgba(170,205,255,${0.09 + s.z * 0.22})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawCore(ctx, t) {
    const pulse = 1 + Math.sin(t * 0.0012) * 0.04;
    const r = 44 * pulse;
    const grad = ctx.createRadialGradient(this.center.x, this.center.y, 0, this.center.x, this.center.y, r * 3.2);
    grad.addColorStop(0, 'rgba(192,244,255,0.98)');
    grad.addColorStop(0.18, 'rgba(103,210,255,0.88)');
    grad.addColorStop(0.42, 'rgba(78,132,255,0.35)');
    grad.addColorStop(1, 'rgba(83,104,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, r * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(160,220,255,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(this.center.x, this.center.y, 74 + i * 18, 22 + i * 7, this.spin * 1.3 + i * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  animate(time) {
    const dt = Math.min(32, time - this.lastTime);
    this.lastTime = time;
    this.spin += this.dragging ? 0 : dt * this.autoSpin;
    const ctx = this.ctx;
    if (!ctx || !this.width || !this.height) {
      this.raf = requestAnimationFrame((t) => this.animate(t));
      return;
    }

    this.drawBackground(ctx);
    this.drawCore(ctx, time);

    const visible = this.visibleNodes().map((node) => {
      node.screen = this.project(node, time);
      return node;
    }).sort((a, b) => a.screen.z - b.screen.z);

    const linkTarget = this.selectedNode || this.hoveredNode;
    for (let i = 0; i < visible.length; i++) {
      const node = visible[i];
      const { x, y, z, alpha } = node.screen;
      ctx.lineWidth = 0.8 + node.screen.depth * 0.45;
      ctx.strokeStyle = `rgba(126,180,255,${0.03 + alpha * 0.09})`;
      ctx.beginPath();
      ctx.moveTo(this.center.x, this.center.y);
      ctx.lineTo(x, y);
      ctx.stroke();

      const maxLinks = node.importance > 0.72 ? 3 : 2;
      let links = 0;
      for (let j = i + 1; j < visible.length && links < maxLinks; j++) {
        const other = visible[j];
        const dx = other.screen.x - x;
        const dy = other.screen.y - y;
        const dz = other.screen.z - z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz * 0.18);
        if (dist < 92) {
          ctx.strokeStyle = `rgba(132,196,255,${0.02 + Math.min(alpha, other.screen.alpha) * 0.12})`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(other.screen.x, other.screen.y);
          ctx.stroke();
          links += 1;
        }
      }

      if (linkTarget && linkTarget.id === node.id) {
        for (const other of visible) {
          if (other === node) continue;
          const dx = other.screen.x - x;
          const dy = other.screen.y - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 155) {
            ctx.strokeStyle = 'rgba(206,239,255,0.22)';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(other.screen.x, other.screen.y);
            ctx.stroke();
          }
        }
      }
    }

    for (const node of visible) {
      const { x, y, r, alpha, fog } = node.screen;
      const color = this.colorFor(node);
      ctx.shadowBlur = this.hoveredNode === node || this.selectedNode === node ? 32 : 18 + fog * 8;
      ctx.shadowColor = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.globalAlpha = alpha * 0.11;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.9, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = Math.min(1, alpha * 0.75 + 0.12);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(x - r * 0.24, y - r * 0.24, Math.max(0.9, r * 0.22), 0, Math.PI * 2);
      ctx.fill();

      if (this.hoveredNode === node || this.selectedNode === node || (node.importance > 0.86 && node.screen.depth > 0.92)) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = Math.min(1, alpha + 0.14);
        ctx.fillStyle = '#edf4ff';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.fillText(node.title.slice(0, 30), x + r + 10, y - r - 4);
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    if (this.hoveredNode && this.hoveredNode !== this.selectedNode) {
      this.updateHoverDetails();
    }
    this.raf = requestAnimationFrame((t) => this.animate(t));
  }

  updateHoverDetails() {
    if (!this.hoveredNode || this.dragging) return;
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
}

customElements.define('hermes-mind-cloud-panel', HermesMindCloudPanel);
