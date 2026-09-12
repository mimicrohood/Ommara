const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => Number(n).toLocaleString('en-US');

class CanvasBase {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const d = Math.min(devicePixelRatio || 1, 2);
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.canvas.width = this.width * d;
    this.canvas.height = this.height * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  grid() {
    const c = this.ctx;
    c.strokeStyle = '#202323';
    c.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      c.beginPath(); c.moveTo(i * this.width / 6, 0); c.lineTo(i * this.width / 6, this.height); c.stroke();
      c.beginPath(); c.moveTo(0, i * this.height / 6); c.lineTo(this.width, i * this.height / 6); c.stroke();
    }
  }
}

class AnatomyView extends CanvasBase {
  constructor(canvas, meta, somaBuffer, skeletonBuffer) {
    super(canvas);
    this.meta = meta;
    this.count = meta.renderedSomata;
    this.xyz = new Float32Array(somaBuffer, 0, this.count * 3);
    this.groups = new Uint8Array(somaBuffer, this.count * 12, this.count);
    this.skeletons = new Map();
    let offset = 0;
    for (const item of meta.skeletons) {
      const values = item.segments * 6;
      this.skeletons.set(item.label, new Float32Array(skeletonBuffer, offset, values));
      offset += values * 4;
    }
    this.layer = 'all';
    this.density = 1;
    this.yaw = -.12;
    this.pitch = .05;
    this.zoom = 1;
    this.auto = true;
    this.bind();
  }
  bind() {
    let dragging = false, px = 0, py = 0;
    this.canvas.addEventListener('pointerdown', e => { dragging = true; px = e.clientX; py = e.clientY; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      this.yaw += (e.clientX - px) * .008;
      this.pitch += (e.clientY - py) * .008;
      px = e.clientX; py = e.clientY;
    });
    this.canvas.addEventListener('pointerup', () => dragging = false);
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.max(.55, Math.min(2.8, this.zoom * Math.exp(-e.deltaY * .001)));
    }, {passive: false});
  }
  reset(view = 'front') {
    const views = {front: [-.12, .05], side: [Math.PI / 2, 0], top: [0, Math.PI / 2]};
    [this.yaw, this.pitch] = views[view] || views.front;
    this.zoom = 1;
  }
  project(x, y, z) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const rx = x * cy + z * sy;
    const rz = -x * sy + z * cy;
    const ry = y * cp - rz * sp;
    return [this.width / 2 + rx * this.width * .46 * this.zoom, this.height / 2 + ry * this.width * .46 * this.zoom, rz * cp + y * sp];
  }
  drawSkeleton(label) {
    const data = this.skeletons.get(label);
    if (!data) return;
    const c = this.ctx;
    c.strokeStyle = '#f1f59b';
    c.shadowColor = '#dce53b';
    c.shadowBlur = 4;
    c.lineWidth = 1.15;
    c.beginPath();
    for (let i = 0; i < data.length; i += 6) {
      const a = this.project(data[i], data[i + 1], data[i + 2]);
      const b = this.project(data[i + 3], data[i + 4], data[i + 5]);
      c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
    }
    c.stroke();
    c.shadowBlur = 0;
  }
  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    this.grid();
    const palette = ['#7a827e', '#a9b0ac', '#dce53b', '#83d49c', '#ef7c45', '#78a9ff', '#b99dff', '#d8a06a', '#e5e5e5'];
    const step = Math.max(1, Math.round(1 / this.density));
    c.globalAlpha = this.layer === 'all' ? .58 : .14;
    for (let i = 0; i < this.count; i += step) {
      const k = i * 3;
      const p = this.project(this.xyz[k], this.xyz[k + 1], this.xyz[k + 2]);
      if (p[0] < 0 || p[0] >= this.width || p[1] < 0 || p[1] >= this.height) continue;
      c.fillStyle = palette[this.groups[i]] || palette[0];
      const s = p[2] > 0 ? 1.25 : .75;
      c.fillRect(p[0], p[1], s, s);
    }
    c.globalAlpha = 1;
    if (this.layer !== 'all') this.drawSkeleton(this.layer);
    c.fillStyle = '#59605d'; c.font = '8px Consolas';
    c.fillText('REAL SOMA XYZ / NO SYNTHETIC NODES', 10, 16);
  }
}

class EdgeComparison extends CanvasBase {
  constructor(canvas, meta) { super(canvas); this.edges = meta.comparison.topEdges; }
  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height); this.grid();
    const left = 72, right = this.width - 12, row = (this.height - 30) / this.edges.length;
    const max = Math.max(...this.edges.flatMap(e => [e.male, e.female]));
    c.font = '7px Consolas';
    this.edges.forEach((e, i) => {
      const y = 18 + i * row;
      c.fillStyle = '#737a77'; c.fillText((e.pre + ' > ' + e.post).slice(0, 13), 7, y + 3);
      c.fillStyle = '#dce53b'; c.fillRect(left, y - 4, (right - left) * e.male / max, 2);
      c.fillStyle = '#60a9ff'; c.fillRect(left, y, (right - left) * e.female / max, 2);
      if (e.verdict === 'dimorphic') { c.fillStyle = '#ef7c45'; c.fillRect(right - 4, y - 5, 4, 7); }
    });
    c.fillStyle = '#dce53b'; c.fillText('M', left, this.height - 5);
    c.fillStyle = '#60a9ff'; c.fillText('F', left + 14, this.height - 5);
    c.fillStyle = '#737a77'; c.fillText('PUBLISHED TYPE-LEVEL WEIGHTS', left + 32, this.height - 5);
  }
}

class Histogram extends CanvasBase {
  constructor(canvas, values) { super(canvas); this.values = values; }
  draw() {
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height); this.grid();
    const max = Math.max(...this.values);
    const w = this.width / this.values.length;
    this.values.forEach((v, i) => {
      const h = (this.height - 18) * v / max;
      c.fillStyle = i % 2 ? '#aeb62f' : '#dce53b';
      c.globalAlpha = .72;
      c.fillRect(i * w + 1, this.height - h - 12, Math.max(1, w - 2), h);
    });
    c.globalAlpha = 1; c.fillStyle = '#717875'; c.font = '8px Consolas';
    c.fillText('-1.0', 6, this.height - 3); c.fillText('NORMALIZED DEPTH', this.width / 2 - 40, this.height - 3); c.fillText('+1.0', this.width - 30, this.height - 3);
  }
}

async function boot() {
  try {
    const [meta, somaBuffer, skeletonBuffer] = await Promise.all([
      fetch('data/derived/connectome-meta.json').then(r => r.json()),
      fetch('data/derived/male-somata.bin').then(r => r.arrayBuffer()),
      fetch('data/derived/courtship-skeletons.bin').then(r => r.arrayBuffer()),
    ]);
    const anatomy = new AnatomyView($('#maleBrain'), meta, somaBuffer, skeletonBuffer);
    const comparison = new EdgeComparison($('#femaleBrain'), meta);
    const histogram = new Histogram($('#traceChart'), meta.histogramZ);
    $('#runState').textContent = 'VERIFIED / LOADED';
    $('#somaCount').textContent = fmt(meta.renderedSomata) + ' SOMATA';
    $('#visibleCount').textContent = fmt(meta.renderedSomata);
    $('#segmentCount').textContent = fmt(meta.skeletons.reduce((n, x) => n + x.segments, 0));
    $('#courtshipEdges').textContent = fmt(meta.comparison.courtshipRows);
    $('#dimorphicCount').textContent = fmt(meta.comparison.verdicts.dimorphic || 0);
    $('#isomorphicCount').textContent = fmt(meta.comparison.verdicts.isomorphic || 0);
    $('#noiseCount').textContent = fmt(meta.comparison.verdicts.noise || 0);
    $('#annotationRows').textContent = fmt(meta.annotationRows);
    $('#tracedCount').textContent = fmt(meta.tracedNonGlia);
    $('#loadedSomata').textContent = fmt(meta.renderedSomata);
    $('#fruCount').textContent = fmt(meta.fruDsxAnnotated);

    $$('#layerTabs button').forEach(button => button.onclick = () => {
      $$('#layerTabs button').forEach(b => b.classList.toggle('active', b === button));
      anatomy.layer = button.dataset.layer;
      $('#activeLabel').textContent = button.dataset.layer === 'all' ? 'ALL SOMATA' : button.dataset.layer + ' / REAL SWC';
      $('#visibleCount').textContent = button.dataset.layer === 'all' ? fmt(Math.ceil(meta.renderedSomata * anatomy.density)) : 'CONTEXT + 1 CELL';
      history.replaceState(null, '', button.dataset.layer === 'all' ? location.pathname : '?layer=' + encodeURIComponent(button.dataset.layer));
    });
    const requestedLayer = new URLSearchParams(location.search).get('layer');
    const requestedButton = requestedLayer && $(`#layerTabs button[data-layer='${CSS.escape(requestedLayer)}']`);
    if (requestedButton) requestedButton.click();
    let view = 'front';
    $$('#projectionTabs button').forEach(button => button.onclick = () => {
      view = button.dataset.view;
      $$('#projectionTabs button').forEach(b => b.classList.toggle('active', b === button));
      anatomy.reset(view);
    });
    $('#density').oninput = e => {
      anatomy.density = Number(e.target.value) / 100;
      $('#densityValue').textContent = e.target.value + '%';
      $('#visibleCount').textContent = fmt(Math.ceil(meta.renderedSomata * anatomy.density));
      e.target.style.background = 'linear-gradient(to right,var(--male) ' + e.target.value + '%,var(--line) ' + e.target.value + '%)';
    };
    $('#autoRotate').onclick = e => {
      anatomy.auto = !anatomy.auto;
      e.currentTarget.setAttribute('aria-checked', anatomy.auto);
    };
    $('#resetView').onclick = () => anatomy.reset(view);
    document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'r') anatomy.reset(view); });
    let last = 0;
    function frame(t) {
      if (t - last > 40) {
        if (anatomy.auto) anatomy.yaw += .0022;
        anatomy.draw(); comparison.draw(); histogram.draw(); last = t;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (error) {
    $('#runState').textContent = 'DATA LOAD ERROR';
    $('#runState').title = error.message;
    console.error(error);
  }
}

const easternClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false, timeZoneName: 'short',
});
function updateClock() {
  $('#clock').textContent = easternClock.format(new Date()).replace('24:', '00:');
}
updateClock();
setInterval(updateClock, 1000);
const copyButton = $('#copyEquation');
if (copyButton) copyButton.onclick = async () => {
  const equation = 'dv/dt = (v_rest - v + g) / tau_m\ndg/dt = -g / tau_syn\nspike if v > v_threshold\ng += contacts * transmitter_sign * w_syn';
  try {
    await navigator.clipboard.writeText(equation);
    copyButton.textContent = 'COPIED';
    setTimeout(() => copyButton.textContent = 'COPY', 1400);
  } catch { copyButton.textContent = 'SELECT'; }
};
const copyCA = $('#copyCA');
if (copyCA) copyCA.onclick = async () => {
  const address = $('#caBox').dataset.address;
  try {
    await navigator.clipboard.writeText(address);
    copyCA.textContent = 'COPIED';
    setTimeout(() => copyCA.textContent = 'COPY', 1400);
  } catch { copyCA.textContent = 'SELECT'; }
};
boot();
