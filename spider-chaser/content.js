(() => {
  'use strict';

  const ROOT_ID = '__spider_chaser_root__';
  if (window.top !== window || document.getElementById(ROOT_ID)) return;

  // ------------------------------------------------------------------
  // Helpers & constants
  // ------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeInOut = t => t * t * (3 - 2 * t);
  const wrapAngle = a => {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOTION_SCALE = reducedMotion ? 0.55 : 1;

  // Base geometry (size = 1.0). Everything is multiplied by the size setting.
  const FEMUR = 15;          // upper leg segment
  const TIBIA = 16;          // lower leg segment
  const BASE_STOP = 48;      // how close a spider comes to the cursor

  // Leg layout in body space: +x = forward, +y = right side.
  // 4 legs per side, listed front -> back. Values are for the right side.
  const LEG_DEFS = [
    { hip: [7, 3.5],    rest: [22, 20] },
    { hip: [3.5, 4.5],  rest: [13, 27] },
    { hip: [-0.5, 4.5], rest: [-4, 28] },
    { hip: [-5, 4],     rest: [-22, 22] }
  ];

  // x, y, radius (body space)
  const EYES = [
    [8.8, 1.3, 1.15], [8.8, -1.3, 1.15],
    [7.8, 3.2, 0.85], [7.8, -3.2, 0.85],
    [5.9, 3.7, 0.8],  [5.9, -3.7, 0.8],
    [4.9, 2.0, 0.65], [4.9, -2.0, 0.65]
  ];

  // ------------------------------------------------------------------
  // Settings (edited from the popup, stored in chrome.storage.local)
  // ------------------------------------------------------------------
  const DEFAULTS = { enabled: true, speed: 1, size: 1, count: 1, drops: true, flies: true, webs: true, butterfly: true, blocked: [] };

  // sites where the spiders are switched off (managed from the popup)
  const hostKey = (location.hostname || '').toLowerCase().replace(/^www\./, '');
  let blockedHere = false;
  const cfg = { ...DEFAULTS };
  let localActive = true;   // Alt+S (this tab only)

  // ------------------------------------------------------------------
  // DOM host (each spider owns one small canvas inside it)
  // ------------------------------------------------------------------
  const host = document.createElement('div');
  host.id = ROOT_ID;
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483647',
    'pointer-events:none',
    'contain:layout style paint',
    'display:block',
    'width:100vw',
    'height:100vh'
  ].join(';');

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    ':host{all:initial}' +
    'canvas{position:fixed;left:0;top:0;pointer-events:none;will-change:transform;user-select:none}';
  shadow.appendChild(style);
  document.documentElement.appendChild(host);

  // ------------------------------------------------------------------
  // Shared pointer state
  // ------------------------------------------------------------------
  const ptr = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5,
    speed: 0,
    seen: false,
    inside: true,
    outsideSince: 0,
    lastMove: 0,
    lastT: performance.now()
  };

  // ------------------------------------------------------------------
  // One spider
  // ------------------------------------------------------------------
  function createSpider(x0, y0, pers) {
    let k = cfg.size;
    let CS = 0, HALF = 0, dpr = 1;
    let forceDraw = true;
    let femur = FEMUR * k, tibia = TIBIA * k, reach = femur + tibia;

    // silk thread used for web drops (sits below the spider canvas)
    const thread = document.createElement('div');
    thread.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;display:none;pointer-events:none;' +
      'transform-origin:0 0;will-change:transform;background:rgba(238,238,238,.95);box-shadow:0 0 0 .6px rgba(70,70,70,.6)';
    shadow.appendChild(thread);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    shadow.appendChild(canvas);

    function sizeCanvas() {
      CS = Math.ceil(100 * k) * 2;
      HALF = CS / 2;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(CS * dpr);
      canvas.height = Math.round(CS * dpr);
      canvas.style.width = CS + 'px';
      canvas.style.height = CS + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      forceDraw = true;
    }

    const st = {
      x: x0,
      y: y0,
      heading: Math.PI,   // direction of travel
      rh: Math.PI,        // render heading (heading + body sway)
      speed: 0,
      sway: 0,
      twitchTimer: rand(1, 3)
    };

    const beh = {
      fleeTime: 0, fleeDir: 0, fleeCd: 0,
      dashTime: 0, dashCd: 0,
      phase: 'go', phaseTime: rand(0.2, 0.6)
    };
    const wander = { walk: 0, pause: rand(0, 1.5), heading: 0 };
    // web drop: climb off the top -> wait -> descend on a thread -> hang -> land or climb again
    const drop = {
      state: null,   // null | 'climb' | 'wait' | 'descend' | 'hang' | 'ascend'
      t: 0, clock: 0, wait: 0, hold: 0,
      ax: 0, py: 0, targetPy: 0,
      cd: rand(40, 100)
    };
    // hunting: stalk a perched fly, pounce, eat it
    const hunt = { fly: null, phase: 'stalk', go: true, phaseT: 0, dashT: 0, time: 0, cd: rand(3, 8), eatT: 0 };
    let api = null;   // public handle, set at the end
    // web building: walk to a corner, then weave a web by walking its pattern
    const build = {
      state: null,      // null | 'go' | 'build' | 'rest'
      wp: [], wi: 0, web: null, last: null,
      cd: rand(25, 60), rest: 0, time: 0,
      hubX: 0, hubY: 0, dirX: 1, dirY: 1, R: 0
    };

    // ---------------- legs ----------------
    const legs = [];
    for (const side of [-1, 1]) {
      LEG_DEFS.forEach((d, idx) => {
        legs.push({
          side, idx,
          // alternating tetrapod gait: neighbours are always in opposite groups
          group: (idx + (side > 0 ? 1 : 0)) % 2,
          hip: [d.hip[0], d.hip[1] * side],
          rest: [d.rest[0], d.rest[1] * side],
          hx: 0, hy: 0, rx: 0, ry: 0,
          fx: 0, fy: 0,
          stepping: false, t: 0, dur: 0.12,
          sx: 0, sy: 0, tx: 0, ty: 0,
          lift: 0, twitch: 0,
          cHx: 0, cHy: 0, cKx: 0, cKy: 0, cFx: 0, cFy: 0
        });
      });
    }
    const groupStepping = [false, false];

    function refreshLegFrames() {
      const c = Math.cos(st.rh), s = Math.sin(st.rh);
      for (const l of legs) {
        l.hx = st.x + (l.hip[0] * c - l.hip[1] * s) * k;
        l.hy = st.y + (l.hip[0] * s + l.hip[1] * c) * k;
        l.rx = st.x + (l.rest[0] * c - l.rest[1] * s) * k;
        l.ry = st.y + (l.rest[0] * s + l.rest[1] * c) * k;
      }
    }

    function snapFeet() {
      refreshLegFrames();
      for (const l of legs) {
        l.fx = l.rx;
        l.fy = l.ry;
        l.stepping = false;
        l.lift = 0;
      }
    }

    function limitReach(l, px, py, maxR) {
      const dx = px - l.hx, dy = py - l.hy;
      const d = Math.hypot(dx, dy);
      if (d > maxR && d > 0) {
        const f = maxR / d;
        return [l.hx + dx * f, l.hy + dy * f];
      }
      return [px, py];
    }

    // legs dangle and wiggle while hanging on the thread
    function hangLegs() {
      const c = Math.cos(st.rh), s = Math.sin(st.rh);
      for (const l of legs) {
        const w1 = Math.sin(drop.clock * 3.2 + l.idx * 1.1 + (l.side > 0 ? 1.7 : 0));
        const w2 = Math.cos(drop.clock * 2.5 + l.idx * 0.9);
        const lx = l.rest[0] * 0.82 + w1 * 1.6;
        const ly = l.rest[1] * 0.8 + w2 * 1.6;
        l.fx = st.x + (lx * c - ly * s) * k;
        l.fy = st.y + (lx * s + ly * c) * k;
        l.stepping = false;
        l.lift = 0.35;
      }
    }

    function updateLegs(dt) {
      refreshLegFrames();

      if (drop.state === 'descend' || drop.state === 'hang' || drop.state === 'ascend') {
        hangLegs();
        return true;
      }

      const ns = st.speed / k;                       // speed in "size 1" units
      const vx = Math.cos(st.heading), vy = Math.sin(st.heading);
      const lead = clamp(ns * 0.07, 0, 14) * k;
      const landing = l => limitReach(l, l.rx + vx * lead, l.ry + vy * lead, reach * 0.85);

      let busy = false;

      for (const l of legs) {
        if (l.twitch > 0) {
          l.twitch = Math.max(0, l.twitch - dt);
          busy = true;
        }
        if (!l.stepping) continue;
        busy = true;
        const tgt = landing(l);
        l.tx = tgt[0];
        l.ty = tgt[1];
        l.t += dt / l.dur;
        if (l.t >= 1) {
          l.stepping = false;
          l.t = 1;
          l.fx = l.tx;
          l.fy = l.ty;
          l.lift = 0;
        } else {
          const e = easeInOut(l.t);
          l.fx = l.sx + (l.tx - l.sx) * e;
          l.fy = l.sy + (l.ty - l.sy) * e;
          l.lift = Math.sin(Math.PI * l.t);
        }
      }

      groupStepping[0] = groupStepping[1] = false;
      for (const l of legs) if (l.stepping) groupStepping[l.group] = true;

      // one gait group swings at a time, its partners follow together
      const thr = (6 + ns * 0.01) * k;
      for (let pass = 0; pass < 2; pass++) {
        for (const l of legs) {
          if (l.stepping) continue;
          const tgt = landing(l);
          const err = Math.hypot(tgt[0] - l.fx, tgt[1] - l.fy);
          const stretch = Math.hypot(l.fx - l.hx, l.fy - l.hy);
          const limit = groupStepping[l.group] ? thr * 0.45 : thr;
          const forced = stretch > reach * 0.93;
          if (forced || (err > limit && !groupStepping[1 - l.group])) {
            l.stepping = true;
            l.t = 0;
            l.sx = l.fx;
            l.sy = l.fy;
            l.tx = tgt[0];
            l.ty = tgt[1];
            l.dur = clamp(0.14 - ns / 2500, 0.05, 0.12);
            groupStepping[l.group] = true;
            busy = true;
          }
        }
      }

      // idle: front legs twitch now and then
      if (st.speed < 3 && !groupStepping[0] && !groupStepping[1]) {
        st.twitchTimer -= dt;
        if (st.twitchTimer <= 0) {
          legs[Math.random() < 0.5 ? 0 : 4].twitch = 0.4;
          st.twitchTimer = rand(1.5, 4.5);
        }
      }

      return busy;
    }

    // ---------------- behaviour + movement ----------------
    // ---------------- hunting flies ----------------
    function endHunt(cooldown) {
      if (hunt.fly && hunt.fly.hunter === api) hunt.fly.hunter = null;
      hunt.fly = null;
      hunt.cd = cooldown;
      hunt.dashT = 0;
    }

    function canHunt() {
      return cfg.flies && !drop.state && !build.state && !hunt.fly && hunt.eatT <= 0 && hunt.cd <= 0 && beh.fleeTime <= 0;
    }

    function startHunt(f) {
      hunt.fly = f;
      hunt.phase = 'stalk';
      hunt.go = true;
      hunt.phaseT = rand(0.3, 0.7);
      hunt.time = 0;
      beh.dashTime = 0;
    }

    // ---------------- web building ----------------
    function startBuild() {
      const W = window.innerWidth, H = window.innerHeight;
      build.cd = rand(60, 140);
      if (Math.min(W, H) < 320) return;
      const R = Math.min(150 * k, Math.min(W, H) * 0.35);
      const inset = 42 * k;
      // closest corner that has no web yet
      const cands = [];
      for (const dx of [1, -1]) {
        for (const dy of [1, -1]) {
          const cx = dx > 0 ? inset : W - inset;
          const cy = dy > 0 ? inset : H - inset;
          cands.push({ dx, dy, d: Math.hypot(cx - st.x, cy - st.y) });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      const c = cands.find(cc => !webAt(cc.dx, cc.dy));
      if (!c) return;
      build.dirX = c.dx;
      build.dirY = c.dy;
      build.R = R;
      build.hubX = c.dx > 0 ? inset : W - inset;
      build.hubY = c.dy > 0 ? inset : H - inset;
      build.state = 'go';
      build.time = 0;
      build.wi = 0;
      build.last = null;
      build.web = null;
    }

    // spokes first (out and back), then the rings zig-zagging across them
    function weavePath() {
      const n = 5;
      const dirs = [];
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1)) * Math.PI / 2;
        dirs.push([build.dirX * Math.cos(a), build.dirY * Math.sin(a)]);
      }
      const P = (i, r) => [build.hubX + dirs[i][0] * r, build.hubY + dirs[i][1] * r];
      const pts = [];
      for (let i = 0; i < n; i++) {
        pts.push(P(i, build.R));
        pts.push(P(i, 0));
      }
      const r0 = 34 * k, step = 22 * k;
      let j = 0;
      for (let r = r0; r <= build.R - 8 * k; r += step, j++) {
        if (j % 2 === 0) for (let i = 0; i < n; i++) pts.push(P(i, r));
        else for (let i = n - 1; i >= 0; i--) pts.push(P(i, r));
      }
      return pts;
    }

    function beginWeave() {
      const W = window.innerWidth, H = window.innerHeight;
      const web = createWeb(build.dirX, build.dirY, build.R + 66 * k);
      build.web = web;
      const cx = build.dirX > 0 ? 0 : W;
      const cy = build.dirY > 0 ? 0 : H;
      const hx = build.hubX, hy = build.hubY, R = build.R;
      const e0 = [hx + build.dirX * R, hy];
      const e1 = [hx, hy + build.dirY * R];
      // frame threads anchoring the web to the screen corner
      webSegment(web, cx, cy, hx, hy);
      webSegment(web, hx, hy, cx, hy);
      webSegment(web, hx, hy, hx, cy);
      webSegment(web, e0[0], e0[1], e0[0], cy);
      webSegment(web, e1[0], e1[1], cx, e1[1]);
      build.wp = weavePath();
      build.wi = 0;
      build.state = 'build';
      build.time = 0;
      build.last = null;
      build.segA = [hx, hy];   // the first leg starts at the hub
      build.segT = 0;
    }

    function finishBuild() {
      build.state = 'rest';
      build.rest = rand(1.5, 3);
      if (build.web) {
        build.web.state = 'idle';
        build.web.life = 0;
      }
    }

    function endBuild() {
      if (build.web && build.web.state === 'build') {
        build.web.state = 'idle';   // unfinished web stays for a while, then fades
        build.web.life = 0;
      }
      build.state = null;
      build.web = null;
      build.last = null;
    }

    function startFlee(dir) {
      endHunt(4);
      endBuild();
      beh.fleeDir = dir + rand(-0.5, 0.5);
      beh.fleeTime = rand(0.55, 0.95);
      beh.fleeCd = 2.2;
      beh.dashTime = 0;
    }

    // ---------------- web drop ----------------
    const TAIL = 19.5;   // distance from body centre to the spinnerets (size 1)

    function showThread() {
      thread.style.transition = 'none';
      thread.style.opacity = '1';
      thread.style.display = 'block';
    }

    function updateThread() {
      const tailX = st.x - Math.cos(st.rh) * TAIL * k;
      const tailY = st.y - Math.sin(st.rh) * TAIL * k;
      const ax = drop.ax, ay = -10;
      const dx = tailX - ax, dy = tailY - ay;
      const len = Math.hypot(dx, dy);
      const ang = Math.atan2(-dx, dy);
      // the thread is a 1px-wide box as long as needed (no scaling, so its outline stays crisp)
      thread.style.height = len + 'px';
      thread.style.transform = `translate(${ax}px,${ay}px) rotate(${ang}rad)`;
    }

    function enterWait() {
      drop.state = 'wait';
      drop.wait = rand(1.5, 4);
      st.speed = 0;
      canvas.style.display = 'none';
      thread.style.display = 'none';
    }

    function beginDescend() {
      const W = window.innerWidth, H = window.innerHeight;
      const near = ptr.seen && ptr.inside;
      drop.state = 'descend';
      drop.clock = 0;
      drop.t = 0;
      drop.ax = clamp(near ? ptr.x + rand(-120, 120) : rand(80, Math.max(81, W - 80)), 60, Math.max(60, W - 60));
      const bodyY = near
        ? clamp(ptr.y - rand(60, 140), 70 * k, Math.max(71 * k, H * 0.75))
        : rand(H * 0.3, H * 0.6);
      drop.targetPy = bodyY - TAIL * k;
      drop.py = -(45 + TAIL) * k;
      canvas.style.display = '';
      showThread();
      forceDraw = true;
    }

    // cut the thread and carry on walking
    function release() {
      drop.state = null;
      drop.cd = rand(45, 110);
      thread.style.transition = 'opacity .5s';
      thread.style.opacity = '0';
      setTimeout(() => { if (!drop.state) thread.style.display = 'none'; }, 520);
      beh.phase = 'pause';
      beh.phaseTime = 0.3;
      st.speed = 0;
      st.sway = 0;
      st.rh = st.heading;
      snapFeet();
      forceDraw = true;
    }

    // abort everything instantly (reset / recenter)
    function endDrop() {
      if (!drop.state) return;
      drop.state = null;
      drop.cd = rand(45, 110);
      thread.style.display = 'none';
      canvas.style.display = '';
      forceDraw = true;
    }

    function updateDrop(dt, now) {
      drop.clock += dt;

      if (drop.state === 'wait') {
        drop.wait -= dt;
        if (drop.wait <= 0) beginDescend();
        return false;
      }

      drop.t += dt;
      const sp = cfg.speed * MOTION_SCALE;

      if (drop.state === 'descend') {
        // lowers itself in little jerks, slowing down near the target
        const remain = drop.targetPy - drop.py;
        const jerk = 0.55 + 0.45 * Math.abs(Math.sin(drop.clock * 5));
        drop.py += clamp(remain * 1.3, 18 * k, 150 * k) * jerk * sp * dt;
        if (drop.targetPy - drop.py < 2 * k) {
          drop.state = 'hang';
          drop.t = 0;
          drop.hold = rand(2, 4.5);
        }
      } else if (drop.state === 'hang') {
        if (drop.t > drop.hold) {
          if (Math.random() < 0.6) {
            release();
            return true;
          }
          drop.state = 'ascend';
          drop.t = 0;
        }
      } else if (drop.state === 'ascend') {
        drop.py -= (50 + Math.min(drop.t, 1.5) * 60) * k * sp * dt;
        if (drop.py < -70 * k) {
          enterWait();
          return false;
        }
      }

      // pose: head down, swinging and slowly spinning on the thread
      const sw = Math.sin(drop.clock * 1.7);
      const spin = Math.sin(drop.clock * 0.9) * (drop.state === 'hang' ? 0.28 : 0.1);
      const rh = Math.PI / 2 + spin + sw * 0.07;
      const tail = TAIL * k;
      st.heading = Math.PI / 2 + spin;
      st.rh = rh;
      st.sway = rh - st.heading;
      st.speed = 0;
      st.x = drop.ax + sw * 3 * k + tail * Math.cos(rh);
      st.y = drop.py + tail * Math.sin(rh) + (drop.state === 'hang' ? Math.sin(drop.clock * 2.4) * 1.2 * k : 0);
      return true;
    }

    function update(dt, now) {
      const W = window.innerWidth, H = window.innerHeight;
      const sm = k * cfg.speed * pers.speed * MOTION_SCALE;   // overall speed multiplier
      const stopDist = pers.stop * k;

      if (now - ptr.lastMove > 100) ptr.speed *= Math.exp(-5 * dt);
      beh.fleeCd = Math.max(0, beh.fleeCd - dt);
      beh.dashCd = Math.max(0, beh.dashCd - dt);

      // hanging on a thread: separate movement
      if (drop.state && drop.state !== 'climb') return updateDrop(dt, now);
      // from time to time: climb off the top and come back down on a thread
      if (cfg.drops && !drop.state && !reducedMotion) {
        drop.cd -= dt;
        if (drop.cd <= 0 && beh.fleeTime <= 0 && beh.dashTime <= 0 && !hunt.fly && hunt.eatT <= 0 && !build.state) {
          drop.state = 'climb';
          drop.cd = rand(45, 110);
        }
      }

      // from time to time: walk to a corner and weave a web
      if (cfg.webs && !build.state && !drop.state && !reducedMotion) {
        build.cd -= dt;
        if (build.cd <= 0 && beh.fleeTime <= 0 && beh.dashTime <= 0 && !hunt.fly && hunt.eatT <= 0 && webs.length < 2) {
          startBuild();
        }
      }

      // hunting bookkeeping: give up if the fly took off or it takes too long
      hunt.cd = Math.max(0, hunt.cd - dt);
      if (hunt.fly) {
        hunt.time += dt;
        if (hunt.fly.state !== 'perch' || hunt.time > 14) endHunt(hunt.fly.state === 'perch' ? 8 : 5);
      }

      const dx = ptr.x - st.x, dy = ptr.y - st.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const angToPtr = Math.atan2(dy, dx);
      const outsideLong = !ptr.inside && now - ptr.outsideSince > 2500;
      const hasTarget = ptr.seen && !outsideLong;

      let desiredSpeed = 0;
      let desiredHeading = st.heading;
      let turnRate = 5;
      let mode = 'idle';

      if (drop.state === 'climb') {
        // walk straight up and out of the screen
        mode = 'climb';
        desiredHeading = -Math.PI / 2;
        desiredSpeed = 170;
        turnRate = 6;
        if (st.y < -42 * k) {
          enterWait();
          return false;
        }
      } else if (beh.fleeTime > 0) {
        // scared: run away, bounce off screen edges
        beh.fleeTime -= dt;
        mode = 'flee';
        let fx = Math.cos(beh.fleeDir), fy = Math.sin(beh.fleeDir);
        if ((st.x < 90 && fx < 0) || (st.x > W - 90 && fx > 0)) fx = -fx;
        if ((st.y < 90 && fy < 0) || (st.y > H - 90 && fy > 0)) fy = -fy;
        beh.fleeDir = Math.atan2(fy, fx);
        desiredHeading = beh.fleeDir;
        desiredSpeed = 260;
        turnRate = 10;
      } else if (hunt.eatT > 0) {
        // eating the catch: stand still, front legs busy
        hunt.eatT -= dt;
        mode = 'eat';
        desiredHeading = st.heading;
        turnRate = 2;
        st.twitchTimer = Math.min(st.twitchTimer, 0.2);
        if (hunt.eatT <= 0) {
          hunt.cd = rand(8, 16);
          forceDraw = true;
        }
      } else if (hunt.fly) {
        // stalk a perched fly, then pounce
        const f = hunt.fly;
        const fdx = f.x - st.x, fdy = f.y - st.y;
        const fd = Math.hypot(fdx, fdy) || 0.001;
        const fAng = Math.atan2(fdy, fdx);
        desiredHeading = fAng;
        if (fd < 22 * k) {
          // got it!
          f.state = 'caught';
          hunt.fly = null;
          hunt.eatT = rand(2.5, 3.8);
          hunt.dashT = 0;
          st.speed *= 0.2;
          forceDraw = true;
          mode = 'eat';
        } else if (hunt.phase === 'pounce') {
          mode = 'dash';
          desiredSpeed = 420;
          turnRate = 12;
          hunt.dashT -= dt;
          if (hunt.dashT <= 0) {
            hunt.phase = 'stalk';
            hunt.go = false;
            hunt.phaseT = 0.3;
          }
        } else {
          mode = 'hunt';
          turnRate = 5;
          hunt.phaseT -= dt;
          if (hunt.phaseT <= 0) {
            hunt.go = !hunt.go;
            hunt.phaseT = hunt.go ? rand(0.35, 0.8) : rand(0.2, 0.55);
          }
          desiredSpeed = hunt.go ? clamp(70 + fd / k * 0.25, 70, 150) : 0;
          if (fd < 90 * k && Math.abs(wrapAngle(fAng - st.heading)) < 0.5) {
            // pounce - the fly may or may not notice in time
            hunt.phase = 'pounce';
            hunt.dashT = 0.3;
            f.threat = true;
            f.react = rand(0.1, 0.22);
            f.escDir = fAng;
          }
        }
      } else if (build.state) {
        // weaving a web in a corner
        mode = 'weave';
        build.time += dt;
        if (!cfg.webs) endBuild();
        else if (build.state === 'go') {
          const hdx = build.hubX - st.x, hdy = build.hubY - st.y;
          const hd = Math.hypot(hdx, hdy);
          desiredHeading = Math.atan2(hdy, hdx);
          desiredSpeed = clamp(80 + hd / k * 0.4, 80, 170);
          turnRate = 5;
          if (hd < 10 * k) beginWeave();
          else if (build.time > 40) endBuild();
        } else if (build.state === 'build') {
          const w = build.wp[build.wi];
          const wdx = w[0] - st.x, wdy = w[1] - st.y;
          desiredHeading = Math.atan2(wdy, wdx);
          desiredSpeed = 95;
          turnRate = 7;
          if (Math.hypot(wdx, wdy) < 7 * k) {
            // leg finished: complete its thread, start the next leg from this point
            if (build.segA && build.segT < 1) {
              const A = build.segA;
              webSegment(build.web, A[0] + (w[0] - A[0]) * build.segT, A[1] + (w[1] - A[1]) * build.segT, w[0], w[1]);
            }
            build.segA = [w[0], w[1]];
            build.segT = 0;
            build.wi++;
            if (build.wi >= build.wp.length) finishBuild();
          }
          if (build.time > 150 && build.state === 'build') finishBuild();
        } else {
          // resting after the job
          mode = 'watch';
          build.rest -= dt;
          if (build.rest <= 0) endBuild();
        }
      } else if (beh.dashTime > 0) {
        // short pounce towards the cursor
        beh.dashTime -= dt;
        mode = 'dash';
        desiredHeading = angToPtr;
        desiredSpeed = 380;
        turnRate = 8;
        if (dist < stopDist) beh.dashTime = 0;
        if (beh.dashTime <= 0) {
          beh.phase = 'pause';
          beh.phaseTime = rand(0.2, 0.4);
        }
      } else if (hasTarget) {
        // very fast cursor close by -> panic
        if (ptr.inside && ptr.speed > 1800 && dist < 260 * k && beh.fleeCd <= 0) {
          startFlee(angToPtr + Math.PI);
        }

        if (dist > stopDist + 10 * k) {
          // stalk: walk in bursts with short pauses
          beh.phaseTime -= dt;
          if (beh.phaseTime <= 0) {
            if (beh.phase === 'go') {
              beh.phase = 'pause';
              beh.phaseTime = rand(0.12, 0.45) * (dist > 350 * k ? 0.4 : 1);
              if (dist > 70 * k && dist < 220 * k && beh.dashCd <= 0 && Math.random() < 0.3) {
                beh.dashTime = 0.2;
                beh.dashCd = 3;
              }
            } else {
              beh.phase = 'go';
              beh.phaseTime = rand(0.5, 1.2) * (1 + Math.min(dist / k, 600) / 400);
            }
          }
          desiredHeading = angToPtr;
          if (beh.phase === 'go') {
            mode = 'stalk';
            desiredSpeed = clamp(70 + (dist / k - pers.stop) * 0.35, 70, 170);
          } else {
            mode = 'pause';
            desiredSpeed = 0;
          }
        } else {
          // close enough: sit still and watch the cursor
          mode = 'watch';
          desiredHeading = angToPtr;
          turnRate = 2.5;
          beh.phase = 'go';
          beh.phaseTime = 0.3;
        }
      } else {
        // nobody around: wander slowly
        mode = 'wander';
        if (wander.pause > 0) {
          wander.pause -= dt;
        } else if (wander.walk > 0) {
          wander.walk -= dt;
          desiredSpeed = 85;
          desiredHeading = wander.heading;
          turnRate = 3;
          if (wander.walk <= 0) wander.pause = rand(1.2, 3.5);
        } else {
          const tx = rand(80, Math.max(81, W - 80));
          const ty = rand(80, Math.max(81, H - 80));
          wander.heading = Math.atan2(ty - st.y, tx - st.x);
          wander.walk = rand(0.6, 1.6);
        }
      }

      // speed: turn first, then walk
      desiredSpeed *= sm;
      const angErr = wrapAngle(desiredHeading - st.heading);
      const absErr = Math.abs(angErr);
      let target = desiredSpeed;
      if (mode === 'flee' || mode === 'dash') target *= clamp(1 - absErr / 2.4, 0.3, 1);
      else target *= clamp(1 - absErr / 1.3, 0, 1);

      if (target > st.speed) st.speed = Math.min(target, st.speed + 1100 * sm * dt);
      else st.speed = Math.max(target, st.speed - 2200 * sm * dt);
      if (target === 0 && st.speed < 0.3) st.speed = 0;

      // heading changes gradually
      const prevHeading = st.heading;
      const prevSway = st.sway;
      const effTurn = turnRate / (1 + (st.speed / sm) / 600);
      st.heading = wrapAngle(st.heading + clamp(angErr, -effTurn * dt, effTurn * dt));

      // position
      st.x += Math.cos(st.heading) * st.speed * dt;
      st.y += Math.sin(st.heading) * st.speed * dt;
      const m = 36 * k;
      st.x = clamp(st.x, m, Math.max(m, W - m));
      st.y = clamp(st.y, drop.state === 'climb' ? -90 * k : m, Math.max(m, H - m));

      // while weaving, the thread is spun from the spinnerets: it is drawn as a clean straight
      // line along the current leg of the path, as far as the spinnerets have got
      if (build.state === 'build' && build.web && build.segA) {
        const B = build.wp[build.wi];
        if (B) {
          const tx = st.x - Math.cos(st.heading) * 19 * k;
          const ty = st.y - Math.sin(st.heading) * 19 * k;
          const A = build.segA;
          const abx = B[0] - A[0], aby = B[1] - A[1];
          const len2 = abx * abx + aby * aby;
          if (len2 > 1) {
            const t = clamp(((tx - A[0]) * abx + (ty - A[1]) * aby) / len2, 0, 1);
            if (t > build.segT + 0.01) {
              webSegment(build.web, A[0] + abx * build.segT, A[1] + aby * build.segT, A[0] + abx * t, A[1] + aby * t);
              build.segT = t;
            }
          }
        }
      }

      // body sways a little with the gait
      const swayTarget = reducedMotion
        ? 0
        : ((groupStepping[0] ? 1 : 0) - (groupStepping[1] ? 1 : 0)) * 0.05 * clamp(st.speed / (100 * k), 0, 1);
      st.sway += (swayTarget - st.sway) * Math.min(1, dt * 16);
      st.rh = st.heading + st.sway;

      return (
        st.speed > 0.2 ||
        Math.abs(wrapAngle(st.heading - prevHeading)) > 1e-4 ||
        Math.abs(st.sway - prevSway) > 5e-4
      );
    }

    // ---------------- drawing ----------------
    function drawLeg(l, ox, oy, bx, by) {
      const hx = l.hx - ox, hy = l.hy - oy;
      let fx = l.fx - ox, fy = l.fy - oy;

      if (l.twitch > 0) {
        const amp = 2.2 * k * (l.twitch / 0.4) * Math.sin(l.twitch * 38);
        fx += Math.cos(st.rh) * amp;
        fy += Math.sin(st.rh) * amp;
      }

      // keep foot connected to the hip
      const dx = fx - hx, dy = fy - hy;
      const d = Math.hypot(dx, dy) || 0.001;
      const dd = clamp(d, Math.abs(femur - tibia) + 0.5 * k, reach * 0.995);
      const ux = dx / d, uy = dy / d;
      fx = hx + ux * dd;
      fy = hy + uy * dd;

      // two-bone IK: pick the knee that bends away from the body
      const cosA = clamp((femur * femur + dd * dd - tibia * tibia) / (2 * femur * dd), -1, 1);
      const A = Math.acos(cosA);
      const cA = Math.cos(A), sA = Math.sin(A);
      const k1x = hx + femur * (ux * cA - uy * sA);
      const k1y = hy + femur * (ux * sA + uy * cA);
      const k2x = hx + femur * (ux * cA + uy * sA);
      const k2y = hy + femur * (-ux * sA + uy * cA);
      let kx, ky;
      if (Math.hypot(k1x - bx, k1y - by) >= Math.hypot(k2x - bx, k2y - by)) {
        kx = k1x; ky = k1y;
      } else {
        kx = k2x; ky = k2y;
      }

      if (l.lift > 0) {
        const ex = kx - bx, ey = ky - by;
        const el = Math.hypot(ex, ey) || 1;
        kx += (ex / el) * l.lift * 3 * k;
        ky += (ey / el) * l.lift * 3 * k;
      }

      l.cHx = hx; l.cHy = hy; l.cKx = kx; l.cKy = ky; l.cFx = fx; l.cFy = fy;

      ctx.lineWidth = (2.8 + l.lift * 0.6) * k;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(kx, ky);
      ctx.stroke();

      ctx.lineWidth = (1.9 + l.lift * 0.4) * k;
      ctx.beginPath();
      ctx.moveTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(kx, ky, 1.9 * k, 0, TAU);
      ctx.fill();
    }

    function setBodyShadow(on) {
      ctx.shadowColor = on ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0)';
      ctx.shadowBlur = 5 * k;
      ctx.shadowOffsetX = 2 * k;
      ctx.shadowOffsetY = 4 * k;
    }

    function drawBody() {
      // body space: +x forward (already scaled by k through ctx.scale)
      setBodyShadow(true);

      // abdomen (wobbles slightly)
      ctx.save();
      ctx.translate(-4, 0);
      ctx.rotate(-st.sway * 0.8);
      let g = ctx.createRadialGradient(-10, -2, 1, -8, 0, 12);
      g.addColorStop(0, '#5a4331');
      g.addColorStop(0.55, '#2b1d14');
      g.addColorStop(1, '#0f0a07');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(-8, 0, 11, 8.4, 0, 0, TAU);
      ctx.fill();

      setBodyShadow(false);
      ctx.fillStyle = 'rgba(200,160,110,0.26)';
      ctx.beginPath();
      ctx.ellipse(-8, 0, 8, 2.1, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,160,110,0.2)';
      for (const px of [-3.5, -8, -12.5]) {
        for (const sg of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(px, sg * 3.6, 1.7, 1.1, sg * 0.4, 0, TAU);
          ctx.fill();
        }
      }
      ctx.fillStyle = '#1a110b';
      ctx.beginPath();
      ctx.ellipse(-19.2, 0, 1.7, 1.3, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      // cephalothorax
      setBodyShadow(true);
      g = ctx.createRadialGradient(5, -1.5, 1, 3, 0, 9);
      g.addColorStop(0, '#6a4e38');
      g.addColorStop(0.55, '#2a1b12');
      g.addColorStop(1, '#120c08');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(3, 0, 8.2, 6.6, 0, 0, TAU);
      ctx.fill();

      setBodyShadow(false);
      ctx.fillStyle = 'rgba(210,170,120,0.18)';
      for (const sg of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(3, sg * 3.6, 6, 1.1, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(1.5, 0, 1.5, 0.6, 0, 0, TAU);
      ctx.fill();

      // pedipalps + chelicerae
      ctx.strokeStyle = '#2a1d14';
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      for (const sg of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(8.5, sg * 1.8);
        ctx.lineTo(12.4, sg * 2.7);
        ctx.stroke();
      }
      ctx.fillStyle = '#150e09';
      for (const sg of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(10.2, sg * 1, 1.6, 1.2, 0, 0, TAU);
        ctx.fill();
      }

      if (hunt.eatT > 0) {
        // the catch, wrapped in silk
        ctx.fillStyle = '#d6d0c6';
        ctx.beginPath();
        ctx.ellipse(14.2, 0, 3.4, 2.4, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90,80,70,0.55)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(12.2, -1.6); ctx.lineTo(16.2, 1.6);
        ctx.moveTo(12.2, 1.6); ctx.lineTo(16.2, -1.6);
        ctx.moveTo(14.2, -2.4); ctx.lineTo(14.2, 2.4);
        ctx.stroke();
      }

      // eyes (tiny highlights follow the cursor)
      let lx = 0, ly = 0;
      if (ptr.seen) {
        const la = Math.atan2(ptr.y - st.y, ptr.x - st.x) - st.rh;
        lx = Math.cos(la);
        ly = Math.sin(la);
      }
      for (const e of EYES) {
        ctx.fillStyle = '#050505';
        ctx.beginPath();
        ctx.arc(e[0], e[1], e[2], 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(e[0] + lx * e[2] * 0.3 - e[2] * 0.15, e[1] + ly * e[2] * 0.3 - e[2] * 0.15, e[2] * 0.3, 0, TAU);
        ctx.fill();
      }
    }

    function draw() {
      const ox = Math.round(st.x) - HALF;
      const oy = Math.round(st.y) - HALF;
      canvas.style.transform = `translate3d(${ox}px,${oy}px,0)`;
      ctx.clearRect(0, 0, CS, CS);

      const bx = st.x - ox, by = st.y - oy;

      // legs (with soft shadow)
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.30)';
      ctx.shadowBlur = 3 * k;
      ctx.shadowOffsetX = 2 * k;
      ctx.shadowOffsetY = 3 * k;
      ctx.strokeStyle = '#1c130d';
      ctx.fillStyle = '#2a1d14';
      for (const l of legs) drawLeg(l, ox, oy, bx, by);

      // leg highlights
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.strokeStyle = 'rgba(255,225,190,0.14)';
      ctx.lineWidth = 0.7 * k;
      for (const l of legs) {
        ctx.beginPath();
        ctx.moveTo(l.cHx - 0.4 * k, l.cHy - 0.6 * k);
        ctx.lineTo(l.cKx - 0.4 * k, l.cKy - 0.6 * k);
        ctx.stroke();
      }

      // body
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(st.rh);
      ctx.scale(k, k);
      drawBody();
      ctx.restore();

      ctx.shadowColor = 'rgba(0,0,0,0)';
    }

    // ---------------- public API ----------------
    function tick(dt, now) {
      if (drop.state === 'wait') {
        updateDrop(dt, now);
        if (drop.state === 'wait') return;   // still off-screen
      }
      const bodyMoved = update(dt, now);
      const legsBusy = updateLegs(dt);
      const hanging = drop.state === 'descend' || drop.state === 'hang' || drop.state === 'ascend';
      if (hanging) updateThread();
      if (bodyMoved || legsBusy || forceDraw || hanging || now - ptr.lastMove < 80) {
        forceDraw = false;
        draw();
      }
    }

    function setSize(newK) {
      k = newK;
      femur = FEMUR * k;
      tibia = TIBIA * k;
      reach = femur + tibia;
      sizeCanvas();
      snapFeet();
    }

    function scare(px, py) {
      const dx = st.x - px, dy = st.y - py;
      if (drop.state === 'wait') return;   // off-screen
      if (Math.hypot(dx, dy) < 320 * k) {
        if (drop.state === 'climb') drop.state = null;
        else if (drop.state) release();      // hanging -> drops and runs
        startFlee(Math.atan2(dy, dx));
      }
    }

    function placeAt(x, y) {
      endDrop();
      endBuild();
      st.x = x;
      st.y = y;
      st.speed = 0;
      beh.fleeTime = 0;
      beh.dashTime = 0;
      snapFeet();
      forceDraw = true;
    }

    function onResize() {
      const m = 36 * k;
      const nx = clamp(st.x, m, Math.max(m, window.innerWidth - m));
      const ny = clamp(st.y, m, Math.max(m, window.innerHeight - m));
      const moved = nx !== st.x || ny !== st.y;
      st.x = nx;
      st.y = ny;
      if (moved) snapFeet();
      if (Math.min(window.devicePixelRatio || 1, 2) !== dpr) sizeCanvas();
      forceDraw = true;
    }

    function invalidate() { forceDraw = true; }
    function destroy() { endHunt(0); endBuild(); canvas.remove(); thread.remove(); }

    sizeCanvas();
    snapFeet();

    api = {
      st,
      get k() { return k; },
      tick, setSize, scare, placeAt, onResize, invalidate, destroy,
      canHunt, startHunt
    };
    return api;
  }

  // ------------------------------------------------------------------
  // Spider manager
  // ------------------------------------------------------------------
  const spiders = [];

  function spawnSpider() {
    const W = window.innerWidth, H = window.innerHeight;
    const first = spiders.length === 0;
    const x = first ? Math.max(120, W * 0.78) : rand(80, Math.max(81, W - 80));
    const y = first ? Math.max(140, H * 0.78) : rand(Math.max(81, H * 0.5), Math.max(82, H - 80));
    const pers = first
      ? { speed: 1, stop: BASE_STOP }
      : { speed: rand(0.85, 1.15), stop: BASE_STOP + rand(8, 45) };
    spiders.push(createSpider(x, y, pers));
  }

  function syncCount() {
    while (spiders.length < cfg.count) spawnSpider();
    while (spiders.length > cfg.count) spiders.pop().destroy();
  }

  let last = performance.now();

  function isVisible() { return cfg.enabled && localActive && !blockedHere; }

  function applyVisibility() {
    const vis = isVisible();
    host.style.display = vis ? 'block' : 'none';
    if (vis) {
      last = performance.now();
      spiders.forEach(s => s.invalidate());
    }
  }

  function applySettings(s) {
    cfg.enabled = s.enabled !== false;
    cfg.drops = s.drops !== false;
    cfg.flies = s.flies !== false;
    cfg.webs = s.webs !== false;
    cfg.butterfly = s.butterfly !== false;
    cfg.blocked = Array.isArray(s.blocked) ? s.blocked : [];
    blockedHere = !!hostKey && cfg.blocked.includes(hostKey);
    cfg.speed = clamp(Number(s.speed) || 1, 0.4, 2.5);
    cfg.size = clamp(Number(s.size) || 1, 0.5, 2.5);
    cfg.count = clamp(Math.round(Number(s.count) || 1), 1, 8);
    spiders.forEach(sp => {
      if (Math.abs(sp.k - cfg.size) > 1e-3) sp.setSize(cfg.size);
    });
    syncCount();
    applyVisibility();
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  function onPointerMove(e) {
    if (!isVisible()) return;
    const now = performance.now();
    const dt = Math.max(8, now - ptr.lastT);
    const inst = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) / dt * 1000;
    ptr.speed = ptr.speed * 0.7 + inst * 0.3;
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.lastT = now;
    ptr.lastMove = now;
    ptr.seen = true;
    ptr.inside = true;
  }

  function onMouseOut(e) {
    if (!e.relatedTarget) {
      ptr.inside = false;
      ptr.outsideSince = performance.now();
    }
  }

  function onClick(e) {
    if (!isVisible()) return;
    spiders.forEach(s => s.scare(e.clientX, e.clientY));
  }

  function toggleLocal() {
    localActive = !localActive;
    applyVisibility();
  }

  function recenter() {
    spiders.forEach((s, i) => {
      s.placeAt(
        clamp(window.innerWidth * 0.7 - i * 70, 60, Math.max(60, window.innerWidth - 60)),
        clamp(window.innerHeight * 0.7 + (i % 2 ? 40 : -20), 60, Math.max(60, window.innerHeight - 60))
      );
    });
  }

  function onKeyDown(e) {
    if (!e.altKey) return;
    const key = (e.key || '').toLowerCase();
    if (e.code === 'KeyS' || key === 's') {
      e.preventDefault();
      toggleLocal();
    } else if (e.code === 'KeyR' || key === 'r') {
      e.preventDefault();
      recenter();
    }
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
  window.addEventListener('mouseout', onMouseOut, { passive: true, capture: true });
  window.addEventListener('click', onClick, { passive: true, capture: true });
  window.addEventListener('keydown', onKeyDown, { passive: false, capture: true });
  window.addEventListener('resize', () => {
    spiders.forEach(s => s.onResize());
    webs.forEach(placeWeb);
  }, { passive: true });

  // Some pages wipe the DOM - put the spiders back if that happens.
  const observer = new MutationObserver(() => {
    if (!host.isConnected && document.documentElement) {
      document.documentElement.appendChild(host);
      spiders.forEach(s => s.invalidate());
    }
  });
  observer.observe(document.documentElement, { childList: true });

  // ------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // Flies: small prey that lands now and then. Spiders ambush the landed ones.
  // ------------------------------------------------------------------
  const flies = [];
  const FLY_C = 36;          // canvas size of one fly (CSS px)
  let flyCd = rand(8, 20);   // seconds until the next fly shows up

  function createFly() {
    const W = window.innerWidth, H = window.innerHeight;
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = -20; y = rand(40, Math.max(41, H - 40)); }
    else if (side === 1) { x = W + 20; y = rand(40, Math.max(41, H - 40)); }
    else if (side === 2) { x = rand(40, Math.max(41, W - 40)); y = -20; }
    else { x = rand(40, Math.max(41, W - 40)); y = H + 20; }

    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(FLY_C * dpr);
    canvas.height = Math.round(FLY_C * dpr);
    canvas.style.width = FLY_C + 'px';
    canvas.style.height = FLY_C + 'px';
    const fctx = canvas.getContext('2d');
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    shadow.appendChild(canvas);

    return {
      x, y,
      heading: Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5),
      tv: 0, speed: 160, burst: 0,
      state: 'fly',            // 'fly' | 'perch' | 'caught' | 'gone'
      stateT: rand(2.5, 5),    // time left flying before it lands
      perchT: 0, pt: 0,        // time left perched / time spent perched
      t: rand(0, 10),
      entered: false,
      hunter: null,            // spider that is stalking this fly
      threat: false, react: 0, escDir: 0,
      canvas, ctx: fctx
    };
  }

  function flyTakeOff(f, escDir) {
    f.state = 'fly';
    f.stateT = rand(3, 7);
    f.tv = 0;
    f.threat = false;
    f.pt = 0;
    if (escDir !== undefined) {
      f.heading = escDir + rand(-0.4, 0.4);   // dart away from the spider
      f.burst = 0.7;
    } else {
      f.heading = rand(0, TAU);
      f.burst = 0.3;
    }
    f.hunter = null;
  }

  function updateFly(f, dt) {
    const W = window.innerWidth, H = window.innerHeight;
    f.t += dt;

    if (f.state === 'fly') {
      // erratic zig-zag flight
      f.tv += rand(-40, 40) * dt;
      f.tv *= Math.max(0, 1 - 2.5 * dt);
      f.tv = clamp(f.tv, -7, 7);
      f.heading = wrapAngle(f.heading + f.tv * dt);

      let sp = 130 + 90 * Math.abs(Math.sin(f.t * 2.3));
      if (f.burst > 0) {
        f.burst -= dt;
        sp = 330;
      }

      // stay on screen (steer back towards the middle near the edges)
      const m = 36;
      const inside = f.x > m && f.x < W - m && f.y > m && f.y < H - m;
      if (inside) f.entered = true;
      if (!inside) {
        const toC = Math.atan2(H / 2 - f.y, W / 2 - f.x);
        f.heading = wrapAngle(f.heading + clamp(wrapAngle(toC - f.heading), -6 * dt, 6 * dt));
      }

      f.x += Math.cos(f.heading) * sp * dt;
      f.y += Math.sin(f.heading) * sp * dt;
      f.speed = sp;

      f.stateT -= dt;
      if (f.stateT <= 0 && f.entered && inside) {
        f.state = 'perch';
        f.perchT = rand(3.5, 7);
        f.pt = 0;
        f.speed = 0;
        f.threat = false;
      }
    } else if (f.state === 'perch') {
      f.speed = 0;
      f.perchT -= dt;
      f.pt += dt;

      if (f.threat) {
        // spider is pouncing: maybe it notices just in time
        f.react -= dt;
        if (f.react <= 0) {
          f.threat = false;
          if (Math.random() < 0.3) flyTakeOff(f, f.escDir);
        }
      } else if (f.hunter) {
        // spider creeping close: the fly may get nervous
        const h = f.hunter;
        const d = Math.hypot(h.st.x - f.x, h.st.y - f.y);
        if (d < 110 * h.k && Math.random() < 0.45 * dt) {
          flyTakeOff(f, Math.atan2(f.y - h.st.y, f.x - h.st.x));
        }
      }

      if (f.state === 'perch' && f.perchT <= 0) flyTakeOff(f);
    }
  }

  function drawFly(f) {
    const c = f.ctx;
    const ox = Math.round(f.x) - FLY_C / 2;
    const oy = Math.round(f.y) - FLY_C / 2;
    f.canvas.style.transform = `translate3d(${ox}px,${oy}px,0)`;
    c.clearRect(0, 0, FLY_C, FLY_C);
    const bx = f.x - ox, by = f.y - oy;

    // soft shadow
    c.fillStyle = 'rgba(0,0,0,0.18)';
    c.beginPath();
    c.ellipse(bx + 2, by + 3.5, 4.2, 2.4, f.heading, 0, TAU);
    c.fill();

    c.save();
    c.translate(bx, by);
    c.rotate(f.heading);

    // wings: blur-flapping in flight, folded back when perched
    const flying = f.state === 'fly';
    const theta = flying ? 0.9 + 0.7 * Math.sin(f.t * 95) : 0.15 + 0.04 * Math.sin(f.t * 7);
    c.fillStyle = 'rgba(215,230,250,0.55)';
    c.strokeStyle = 'rgba(120,140,170,0.5)';
    c.lineWidth = 0.5;
    for (const sg of [-1, 1]) {
      c.save();
      c.translate(0.8, sg * 1.2);
      c.rotate(Math.atan2(sg * Math.sin(theta), -Math.cos(theta)));
      c.beginPath();
      c.ellipse(3.6, 0, 3.8, 1.5, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.restore();
    }

    // body
    c.fillStyle = '#1a1612';
    c.beginPath();
    c.ellipse(-1.6, 0, 3.4, 2.3, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#2a251e';
    c.beginPath();
    c.ellipse(1.2, 0, 2.4, 2.1, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#1a1612';
    c.beginPath();
    c.arc(3.6, 0, 1.7, 0, TAU);
    c.fill();
    c.fillStyle = '#a3262a';
    for (const sg of [-1, 1]) {
      c.beginPath();
      c.arc(4.2, sg * 1.2, 0.95, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  function updateFlies(dt) {
    // a new fly shows up every now and then
    if (cfg.flies && flies.length < (spiders.length > 2 ? 2 : 1)) {
      flyCd -= dt;
      if (flyCd <= 0) {
        flies.push(createFly());
        flyCd = rand(25, 60);
      }
    }

    for (let i = flies.length - 1; i >= 0; i--) {
      const f = flies[i];
      if (!cfg.flies && f.state !== 'caught') f.state = 'gone';
      if (f.state === 'caught' || f.state === 'gone') {
        f.canvas.remove();
        flies.splice(i, 1);
        continue;
      }
      updateFly(f, dt);
      drawFly(f);
    }

    // hand landed flies to the nearest free spider
    for (const f of flies) {
      if (f.state !== 'perch' || f.hunter || f.threat || f.pt < 0.8) continue;
      let best = null, bestD = 650;
      for (const s of spiders) {
        if (!s.canHunt()) continue;
        const d = Math.hypot(s.st.x - f.x, s.st.y - f.y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best) {
        best.startHunt(f);
        f.hunter = best;
      }
    }
  }

  // ------------------------------------------------------------------
  // Webs: woven by the spiders in a screen corner, they fade away after a while
  // ------------------------------------------------------------------
  const webs = [];

  function placeWeb(w) {
    w.ox = w.dirX > 0 ? 0 : window.innerWidth - w.size;
    w.oy = w.dirY > 0 ? 0 : window.innerHeight - w.size;
    w.canvas.style.transform = `translate3d(${w.ox}px,${w.oy}px,0)`;
  }

  function webAt(dirX, dirY) {
    return webs.some(w => w.dirX === dirX && w.dirY === dirY);
  }

  function createWeb(dirX, dirY, size) {
    const s = Math.ceil(size);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(s * dpr);
    canvas.height = Math.round(s * dpr);
    canvas.style.cssText =
      `position:fixed;left:0;top:0;width:${s}px;height:${s}px;pointer-events:none;will-change:transform`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    // webs sit below the spiders and flies
    shadow.insertBefore(canvas, shadow.firstChild ? shadow.firstChild.nextSibling : null);

    const w = {
      dirX, dirY, size: s, canvas, ctx,
      ox: 0, oy: 0,
      state: 'build',            // 'build' | 'idle' | 'fade'
      life: 0, maxLife: rand(70, 110),
      fade: 0
    };
    placeWeb(w);
    webs.push(w);
    return w;
  }

  // draw one thread (coordinates are page/viewport coordinates): a thin pale line with a faint
  // dark edge so it shows on light and dark pages alike (no blur: overlaps stay crisp)
  function webSegment(w, x1, y1, x2, y2) {
    const c = w.ctx;
    c.beginPath();
    c.moveTo(x1 - w.ox, y1 - w.oy);
    c.lineTo(x2 - w.ox, y2 - w.oy);
    c.strokeStyle = 'rgba(60,60,60,0.35)';
    c.lineWidth = 1.7;
    c.stroke();
    c.strokeStyle = 'rgba(250,250,250,0.95)';
    c.lineWidth = 0.8;
    c.stroke();
  }

  function updateWebs(dt) {
    for (let i = webs.length - 1; i >= 0; i--) {
      const w = webs[i];
      if (!cfg.webs && w.state !== 'fade') {
        w.state = 'fade';
        w.fade = 2.5;           // webs switched off: vanish quickly
      }
      if (w.state === 'idle') {
        w.life += dt;
        if (w.life > w.maxLife) {
          w.state = 'fade';
          w.fade = 0;
        }
      } else if (w.state === 'fade') {
        w.fade += dt;
        w.canvas.style.opacity = String(clamp(1 - w.fade / 4, 0, 1));
        if (w.fade >= 4) {
          w.canvas.remove();
          webs.splice(i, 1);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Butterfly: a colourful visitor that flutters around on its own,
  // lands now and then, keeps away from the spiders and leaves after a while
  // ------------------------------------------------------------------
  const BF_C = 96;          // canvas size (CSS px)
  const BF_SCALE = 1.35;    // butterfly size
  const BF_PALETTES = [
    { a: '#ff9d1c', b: '#d65a00', edge: '#1b0f08', dots: '#fff4e0', vein: 'rgba(30,15,5,0.55)' },    // monarch
    { a: '#8fd3ff', b: '#1d5fe0', edge: '#0b1530', dots: '#e8f6ff', vein: 'rgba(5,15,50,0.5)' },      // blue morpho
    { a: '#fff08a', b: '#f0b400', edge: '#241a05', dots: '#fffbe0', vein: 'rgba(40,25,0,0.55)' },    // swallowtail
    { a: '#ffc2ee', b: '#b23fd1', edge: '#2a0a33', dots: '#fff0fb', vein: 'rgba(45,10,60,0.5)' }      // orchid
  ];
  // wing outlines for one side (body axis = x, wing spreads towards +y)
  const WING_FORE = new Path2D('M4 1.5 C12 4 13 15 5 19 C1 19 -3 13 -3 6 C-3 3 0 2 4 1.5 Z');
  const WING_HIND = new Path2D('M-2 1.5 C-4 6 -9 14 -12 15 C-16 15 -17 9 -12 5 C-9 3 -6 2 -2 1.5 Z');
  const FORE_VEINS = [[3, 2, 11, 9], [3, 2, 8, 15.5], [2, 2, 2, 17], [2, 2, -2, 10]];
  const HIND_VEINS = [[-2, 2, -8, 6.5], [-2, 2, -11, 10.5], [-2, 2, -6.5, 13]];
  const FORE_DOTS = [[9.5, 10.8], [7.4, 15.6], [11.2, 6.2]];
  const HIND_DOTS = [[-12, 10.5], [-10.4, 13.2]];

  let butterfly = null;
  let bfCd = rand(3, 6);    // seconds until it shows up

  function createButterfly() {
    const W = window.innerWidth, H = window.innerHeight;
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = -50; y = rand(80, Math.max(81, H - 80)); }
    else if (side === 1) { x = W + 50; y = rand(80, Math.max(81, H - 80)); }
    else if (side === 2) { x = rand(80, Math.max(81, W - 80)); y = -50; }
    else { x = rand(80, Math.max(81, W - 80)); y = H + 50; }

    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(BF_C * dpr);
    canvas.height = Math.round(BF_C * dpr);
    canvas.style.width = BF_C + 'px';
    canvas.style.height = BF_C + 'px';
    const bctx = canvas.getContext('2d');
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    shadow.appendChild(canvas);

    return {
      x, y,
      heading: Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.4, 0.4),
      tv: 0, sp: 0, t: rand(0, 10),
      flap: rand(0, TAU), openness: 1, gliding: false, glideT: rand(1, 3),
      state: 'fly',              // 'fly' | 'rest' | 'leave'
      stateT: rand(10, 22),      // time until it may land
      restT: 0,
      life: rand(90, 150),       // seconds on screen before it flies away
      exitDir: 0,
      pal: BF_PALETTES[Math.floor(Math.random() * BF_PALETTES.length)],
      canvas, ctx: bctx
    };
  }

  // returns false when the butterfly has left the screen
  function updateButterfly(b, dt) {
    const W = window.innerWidth, H = window.innerHeight;
    b.t += dt;

    // wings: flapping, now and then gliding with open wings; slow open/close when resting
    if (b.state === 'rest') {
      b.openness = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(b.t * 1.7));
    } else {
      b.glideT -= dt;
      if (b.glideT <= 0) {
        b.gliding = !b.gliding;
        b.glideT = b.gliding ? rand(0.6, 1.4) : rand(2.5, 5);
      }
      if (b.gliding) {
        b.openness += (1 - b.openness) * Math.min(1, dt * 6);
      } else {
        b.flap += dt * TAU * 5.5 * MOTION_SCALE;
        b.openness = 0.2 + 0.8 * Math.abs(Math.cos(b.flap));
      }
    }

    const m = 70;
    const inside = b.x > m && b.x < W - m && b.y > m && b.y < H - m;
    let targetSp = 0;

    if (b.state === 'fly') {
      // lazy, meandering flight
      b.tv += rand(-5, 5) * dt;
      b.tv *= Math.max(0, 1 - 1.5 * dt);
      b.tv = clamp(b.tv, -1.7, 1.7);
      b.heading = wrapAngle(b.heading + b.tv * dt);
      if (!inside) {
        const toC = Math.atan2(H / 2 - b.y, W / 2 - b.x);
        b.heading = wrapAngle(b.heading + clamp(wrapAngle(toC - b.heading), -2.2 * dt, 2.2 * dt));
      }
      targetSp = 50 + 35 * Math.sin(b.t * 0.9) + (b.gliding ? 0 : 30 * Math.abs(Math.sin(b.flap)));

      // keep away from spiders
      for (const s of spiders) {
        const dx = b.x - s.st.x, dy = b.y - s.st.y;
        if (Math.hypot(dx, dy) < 110 * s.k) {
          b.heading = wrapAngle(b.heading + clamp(wrapAngle(Math.atan2(dy, dx) - b.heading), -3 * dt, 3 * dt));
        }
      }

      b.life -= dt;
      if (b.life <= 0) {
        b.state = 'leave';
        b.exitDir = Math.atan2(b.y - H / 2, b.x - W / 2);
      }
      b.stateT -= dt;
      if (b.stateT <= 0) {
        b.stateT = rand(10, 22);
        if (inside && Math.random() < 0.45) {
          b.state = 'rest';
          b.restT = rand(4, 9);
          b.gliding = false;
        }
      }
    } else if (b.state === 'leave') {
      b.heading = wrapAngle(b.heading + clamp(wrapAngle(b.exitDir - b.heading), -1.5 * dt, 1.5 * dt));
      targetSp = 75;
      if (b.x < -70 || b.x > W + 70 || b.y < -70 || b.y > H + 70) return false;
    } else {
      // resting on the page
      b.restT -= dt;
      let scared = false;
      for (const s of spiders) {
        if (Math.hypot(b.x - s.st.x, b.y - s.st.y) < 90 * s.k) scared = true;
      }
      if (b.restT <= 0 || scared) {
        b.state = 'fly';
        b.heading = rand(0, TAU);
        b.stateT = rand(10, 22);
        b.glideT = 0.4;
      }
    }

    b.sp += (targetSp * MOTION_SCALE - b.sp) * Math.min(1, dt * 3);
    b.x += Math.cos(b.heading) * b.sp * dt;
    b.y += Math.sin(b.heading) * b.sp * dt;
    return true;
  }

  function drawWing(c, wing, veins, dots, pal, grad) {
    c.fillStyle = grad;
    c.fill(wing);
    c.save();
    c.clip(wing);
    c.strokeStyle = pal.vein;
    c.lineWidth = 0.5;
    c.beginPath();
    for (const v of veins) {
      c.moveTo(v[0], v[1]);
      c.lineTo(v[2], v[3]);
    }
    c.stroke();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.45)';   // pale rim so it also shows on dark pages
    c.lineWidth = 2.8;
    c.lineJoin = 'round';
    c.stroke(wing);
    c.strokeStyle = pal.edge;
    c.lineWidth = 1.4;
    c.stroke(wing);
    c.fillStyle = pal.dots;
    for (const d of dots) {
      c.beginPath();
      c.arc(d[0], d[1], 0.8, 0, TAU);
      c.fill();
    }
  }

  function drawButterfly(b) {
    const c = b.ctx;
    const resting = b.state === 'rest';
    const open = b.openness;
    const pal = b.pal;
    const ox = Math.round(b.x) - BF_C / 2;
    const oy = Math.round(b.y) - BF_C / 2;
    b.canvas.style.transform = `translate3d(${ox}px,${oy}px,0)`;
    c.clearRect(0, 0, BF_C, BF_C);

    const bx = b.x - ox;
    const by = b.y - oy + (resting ? 0 : Math.sin(b.flap) * 1.6);   // little up-and-down bob
    const rot = b.heading + (resting ? 0 : Math.sin(b.t * 3) * 0.06);

    // soft shadow on the page
    c.save();
    c.translate(bx + 3, by + 10);
    c.rotate(rot);
    c.scale(BF_SCALE, BF_SCALE);
    c.fillStyle = 'rgba(0,0,0,0.13)';
    c.beginPath();
    c.ellipse(-2, 0, 11, Math.max(1, 18 * open), 0, 0, TAU);
    c.fill();
    c.restore();

    c.save();
    c.translate(bx, by);
    c.rotate(rot);
    c.scale(BF_SCALE, BF_SCALE);

    // wings (the flap squeezes them towards the body)
    for (const sg of [1, -1]) {
      c.save();
      c.scale(1, sg * Math.max(0.05, open));
      const g = c.createLinearGradient(0, 1, 0, 19);
      g.addColorStop(0, pal.a);
      g.addColorStop(1, pal.b);
      drawWing(c, WING_HIND, HIND_VEINS, HIND_DOTS, pal, g);
      drawWing(c, WING_FORE, FORE_VEINS, FORE_DOTS, pal, g);
      c.restore();
    }

    // body, head and antennae (with a faint light glow so they show on dark pages)
    c.shadowColor = 'rgba(255,255,255,0.7)';
    c.shadowBlur = 2.5;
    c.fillStyle = '#1a120d';
    c.beginPath();
    c.ellipse(-1, 0, 9, 1.7, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(5, 0, 2.2, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(9.2, 0, 1.7, 0, TAU);
    c.fill();
    c.strokeStyle = '#1a120d';
    c.lineWidth = 0.7;
    c.lineCap = 'round';
    for (const sg of [1, -1]) {
      c.beginPath();
      c.moveTo(10, sg * 0.8);
      c.quadraticCurveTo(14, sg * 2, 16.5, sg * 5.5);
      c.stroke();
      c.beginPath();
      c.arc(16.7, sg * 5.8, 0.9, 0, TAU);
      c.fill();
    }
    c.shadowColor = 'rgba(0,0,0,0)';
    c.shadowBlur = 0;
    c.restore();
  }

  function updateButterflies(dt) {
    if (cfg.butterfly && !butterfly) {
      bfCd -= dt;
      if (bfCd <= 0) butterfly = createButterfly();
    }
    if (!butterfly) return;
    if (!cfg.butterfly && butterfly.state !== 'leave') {
      // switched off: it politely flies away
      butterfly.state = 'leave';
      butterfly.exitDir = Math.atan2(butterfly.y - window.innerHeight / 2, butterfly.x - window.innerWidth / 2);
    }
    if (updateButterfly(butterfly, dt)) {
      drawButterfly(butterfly);
    } else {
      butterfly.canvas.remove();
      butterfly = null;
      bfCd = rand(25, 70);
    }
  }

  function separate(dt) {
    for (let i = 0; i < spiders.length; i++) {
      for (let j = i + 1; j < spiders.length; j++) {
        const a = spiders[i], b = spiders[j];
        let dx = b.st.x - a.st.x, dy = b.st.y - a.st.y;
        let d = Math.hypot(dx, dy);
        const minD = 48 * (a.k + b.k) / 2;
        if (d >= minD) continue;
        if (d < 0.01) {
          const ang = rand(0, TAU);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const push = (minD - d) * Math.min(1, dt * 6) * 0.5;
        const nx = dx / d, ny = dy / d;
        a.st.x -= nx * push;
        a.st.y -= ny * push;
        b.st.x += nx * push;
        b.st.y += ny * push;
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!isVisible()) return;

    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;

    updateFlies(dt);
    updateWebs(dt);
    updateButterflies(dt);
    if (spiders.length > 1) separate(dt);
    for (const s of spiders) s.tick(dt, now);
  }

  // ------------------------------------------------------------------
  // Start: load saved settings, then react to popup changes live
  // ------------------------------------------------------------------
  const hasStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  if (hasStorage) {
    try {
      chrome.storage.local.get(DEFAULTS, items => applySettings({ ...DEFAULTS, ...(items || {}) }));
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const next = { ...cfg };
        for (const key in changes) next[key] = changes[key].newValue;
        applySettings(next);
      });
    } catch (err) {
      applySettings(DEFAULTS);
    }
  } else {
    applySettings(DEFAULTS);
  }

  requestAnimationFrame(frame);
})();
