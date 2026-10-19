// Headless smoke test for content.js: fake DOM + fake canvas, simulated time and mouse.
// Run:  node sim.js
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'spider-chaser', 'content.js'), 'utf8');
const ROOT_ID = '__spider_chaser_root__';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(seed, opts) {
  const rng = mulberry32(seed);
  const FakeMath = Object.create(Math);
  FakeMath.random = rng;

  const stats = {
    errors: new Map(), nan: 0, dropShows: 0,
    created: { spider: 0, fly: 0, web: 0, butterfly: 0 }, removed: { spider: 0, fly: 0, web: 0, butterfly: 0 },
    webLines: 0, flyDraws: 0, spiderDraws: 0, butterflyDraws: 0, maxCanvases: 0, eatFrames: 0
  };
  const allCanvases = [];
  let nowMs = 0;
  let rafQueue = [];
  const winListeners = {};
  let changedListener = null;
  let storageCb = null;

  function makeCtx(owner) {
    const t = {};
    return new Proxy(t, {
      get(target, p) {
        if (p in target) return target[p];
        if (p === 'createRadialGradient' || p === 'createLinearGradient') return () => ({ addColorStop() {} });
        return () => {
          if (p === 'lineTo') owner.lines++;
          if (p === 'fill' || p === 'stroke') owner.draws++;
        };
      },
      set(target, p, v) {
        if (p === 'fillStyle' && v === '#d6d0c6') stats.eatFrames++;
        target[p] = v;
        return true;
      }
    });
  }

  function makeEl(tag) {
    const el = {
      tag, id: '', children: [], parent: null, width: 0, height: 0, lines: 0, draws: 0, removed: false,
      get isConnected() { return !this.removed; },
      appendChild(c) { if (c.parent) c.remove(); this.children.push(c); c.parent = this; c.removed = false; return c; },
      append(...cs) { cs.forEach(c => this.appendChild(c)); },
      insertBefore(c, ref) {
        if (c.parent) c.remove();
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
        c.parent = this; c.removed = false; return c;
      },
      remove() {
        if (this.parent) {
          const i = this.parent.children.indexOf(this);
          if (i >= 0) this.parent.children.splice(i, 1);
          this.parent = null;
        }
        this.removed = true;
      },
      setAttribute() {},
      attachShadow() { this.shadowRoot = makeEl('shadow'); this.shadowRoot.parent = this; return this.shadowRoot; },
      getContext() { return this._ctx || (this._ctx = makeCtx(this)); },
      get firstChild() { return this.children[0] || null; },
      get nextSibling() {
        if (!this.parent) return null;
        const i = this.parent.children.indexOf(this);
        return this.parent.children[i + 1] || null;
      }
    };
    el.style = new Proxy({ cssText: '' }, {
      set(t, p, v) {
        t[p] = v;
        if (p === 'transform' && String(v).includes('NaN')) stats.nan++;
        if (p === 'display' && tag === 'div' && v === 'block' && el.id !== ROOT_ID) stats.dropShows++;
        return true;
      }
    });
    if (tag === 'canvas') allCanvases.push(el);
    return el;
  }

  const html = makeEl('html');
  html.clientWidth = 1280;
  html.clientHeight = 720;
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); }
  };
  win.top = win;
  const doc = {
    documentElement: html,
    createElement: tag => makeEl(tag),
    getElementById: () => null,
    addEventListener() {}
  };
  const chromeStub = {
    storage: {
      local: {
        get(defaults, cb) { storageCb = () => cb({ ...defaults, ...opts }); }
      },
      onChanged: { addListener(fn) { changedListener = fn; } }
    }
  };
  const perf = { now: () => nowMs };
  class FakeMO { observe() {} }

  const fn = new Function(
    'window', 'document', 'chrome', 'performance', 'requestAnimationFrame', 'MutationObserver', 'location', 'Math', 'Path2D',
    code
  );
  fn(win, doc, chromeStub, perf, cb => { rafQueue.push(cb); return rafQueue.length; }, FakeMO, { hostname: 'example.com' }, FakeMath, class Path2D {});
  if (storageCb) storageCb();

  function fire(type, ev) {
    for (const f of winListeners[type] || []) f(ev);
  }
  function pointer(x, y) {
    fire('pointermove', { clientX: x, clientY: y });
  }

  function typeOf(el) {
    if (el.style.width === '36px') return 'fly';
    if (el.style.width === '96px') return 'butterfly';
    if (el.style.cssText && el.style.cssText.includes('will-change:transform')) return 'web';
    return 'spider';
  }

  const SIM_SECONDS = opts.seconds || 600;
  const dtMs = 1000 / 60;
  let t = 0;
  for (let step = 0; step < SIM_SECONDS * 60; step++) {
    nowMs += dtMs;
    t = nowMs / 1000;
    const ph = t % 100;

    // scripted mouse
    if (ph > 85 && ph < 95) {
      if (ph - 85 < 0.02) fire('mouseout', { relatedTarget: null });   // cursor leaves the window
    } else if (ph > 60 && ph < 75) {
      // cursor sits still
    } else if (step % 2 === 0) {
      const fast = (t % 40 > 38) ? 4 : 1;
      pointer(640 + 420 * Math.sin(t * 0.4 * fast), 360 + 250 * Math.sin(t * 0.27 * fast));
    }
    if (t % 55 < 0.02) fire('click', { clientX: 600, clientY: 300 });

    // live settings changes
    if (changedListener) {
      if (Math.abs(t - 200) < 0.009) changedListener({ size: { newValue: 1.8 }, count: { newValue: 3 } }, 'local');
      if (Math.abs(t - 300) < 0.009) changedListener({ size: { newValue: 0.7 }, count: { newValue: 1 }, speed: { newValue: 1.8 } }, 'local');
      if (Math.abs(t - 400) < 0.009) changedListener({ flies: { newValue: false }, webs: { newValue: false }, drops: { newValue: false }, butterfly: { newValue: false } }, 'local');
      if (Math.abs(t - 450) < 0.009) changedListener({ flies: { newValue: true }, webs: { newValue: true }, drops: { newValue: true }, butterfly: { newValue: true }, speed: { newValue: 1 } }, 'local');
    }

    const q = rafQueue;
    rafQueue = [];
    for (const cb of q) {
      try { cb(nowMs); } catch (e) {
        const key = e.message + ' @ ' + (e.stack || '').split('\n')[1];
        stats.errors.set(key, (stats.errors.get(key) || 0) + 1);
      }
    }

    if (step % 120 === 0) {
      const live = allCanvases.filter(c => !c.removed).length;
      if (live > stats.maxCanvases) stats.maxCanvases = live;
    }
  }

  for (const c of allCanvases) {
    const ty = typeOf(c);
    stats.created[ty]++;
    if (c.removed) stats.removed[ty]++;
    if (ty === 'web') stats.webLines += c.lines;
    if (ty === 'fly') stats.flyDraws += c.draws;
    if (ty === 'butterfly') stats.butterflyDraws += c.draws;
    if (ty === 'spider') stats.spiderDraws += c.draws;
  }
  return stats;
}

let failed = false;
for (const [seed, opts] of [
  [1, { seconds: 600 }],
  [2, { seconds: 600, count: 4, size: 1.3 }],
  [3, { seconds: 600, count: 2, speed: 1.5 }]
]) {
  const t0 = Date.now();
  const s = run(seed, opts);
  if (s.errors.size || s.nan) failed = true;
  console.log(`--- seed ${seed} ${JSON.stringify(opts)}  (${((Date.now() - t0) / 1000).toFixed(1)}s real)`);
  console.log('errors   :', s.errors.size ? [...s.errors.entries()].map(([k, v]) => `${v}x ${k}`).join('\n           ') : 'none');
  console.log('NaN transforms:', s.nan);
  console.log('canvases created:', JSON.stringify(s.created), ' removed:', JSON.stringify(s.removed), ' max live:', s.maxCanvases);
  console.log('thread shown (web drops):', s.dropShows, ' web threads drawn:', s.webLines, ' fly draws:', s.flyDraws, ' frames eating a catch:', s.eatFrames, ' butterfly draws:', s.butterflyDraws);
}
if (failed) {
  console.error('FAILED: runtime errors or NaN positions found');
  process.exit(1);
}
