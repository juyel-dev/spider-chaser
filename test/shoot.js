// Takes the README / store screenshots with the real content.js running in headless Chrome.
//   cd test && npm install && node shoot.js        (needs Google Chrome or Edge installed)
// The demo page (demo/demo.html) loads ../spider-chaser/content.js and shortens its timers so that
// each behaviour starts within a second or two; shots are taken at the exact moment of interest.
const fs = require('fs');
const path = require('path');
require('./demo/server.js');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(p => p && fs.existsSync(p));

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE = 'http://localhost:8765/test/demo/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

async function openPage(browser, url, w, h) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.log('   [console error]', m.text()); });
  page.on('pageerror', e => console.log('   [page error]', e.message));
  await page.goto(BASE + url, { waitUntil: 'load' });
  return page;
}

async function openDemo(browser, query, w = 1280, h = 800) {
  const page = await openPage(browser, 'demo.html?' + query, w, h);
  await page.waitForFunction('window.__ready && window.__spiders && window.__spiders.length > 0', { timeout: 15000 });
  return page;
}

// hold the animation exactly where it is, take the picture, let it run again
async function snap(page, name, freeze = true) {
  if (freeze) { await page.evaluate(() => { window.__freeze = true; }); await sleep(200); }
  await page.screenshot({ path: path.join(OUT, name) });
  if (freeze) await page.evaluate(() => { window.__freeze = false; });
  console.log('saved', name);
}

const until = (page, fn, timeout, ...args) => page.waitForFunction(fn, { timeout, polling: 'raf' }, ...args);

(async () => {
  if (!CHROME) throw new Error('Chrome/Edge not found');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: process.env.CHROME_HEADLESS || true,
    args: ['--no-sandbox', ...(process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [])]
  });
  const only = process.argv[2];                      // e.g. node shoot.js drop
  const want = name => !only || only === name;

  try {
    if (want('walk')) {
      console.log('1/7 stalking the cursor');
      const page = await openDemo(browser, 'shot=walk&size=1.5');
      await page.evaluate(() => window.__mouse(330, 410));
      await until(page, () => {
        const s = window.__spiders[0].st, d = Math.hypot(330 - s.x, 410 - s.y);
        return d < 135 && d > 90 && s.speed > 60 && s.speed < 260;
      }, 60000);
      await snap(page, '01-stalking.png');
      await page.close();
    }

    if (want('drop')) {
      console.log('2/7 hanging on the silk thread');
      const page = await openDemo(browser, 'shot=drop&size=1.5');
      await page.evaluate(() => window.__mouse(640, 560));
      await until(page, () => { const d = window.__spiders[0]._drop; return d.state === 'hang' && d.t > 0.9; }, 90000);
      await snap(page, '02-silk-drop.png');
      await page.close();
    }

    if (want('web')) {
      console.log('3/7 weaving a web');
      const page = await openDemo(browser, 'shot=web&size=1.5');
      await page.evaluate(() => window.__mouse(640, 300));
      await until(page, () => { const b = window.__spiders[0]._build; return b.state === 'build' && b.wi >= 26; }, 120000);
      await snap(page, '03-weaving-web.png');
      await page.close();
    }

    if (want('fly')) {
      console.log('4/7 eating a fly (can take a while)');
      const page = await openDemo(browser, 'shot=fly&size=1.6');
      await page.evaluate(() => window.__mouse(640, 330));
      await until(page, () => window.__spiders[0]._hunt.eatT > 0.8, 240000);
      await sleep(500);                      // let the caught fly disappear, the wrapped bundle stays
      await snap(page, '04-eating-fly.png');
      await page.close();
    }

    if (want('popup')) {
      console.log('5/7 popup');
      const page = await openPage(browser, 'popup-preview.html', 1280, 800);
      await page.waitForFunction(() => {
        const f = document.querySelector('iframe');
        const el = f && f.contentDocument && f.contentDocument.getElementById('siteName');
        return el && el.textContent.length > 2;
      }, { timeout: 15000 });
      await sleep(300);
      await snap(page, '05-popup.png', false);
      await page.close();
    }

    if (want('butterfly')) {
      console.log('butterfly');
      const page = await openDemo(browser, 'shot=butterfly');
      await page.evaluate(() => window.__mouse(640, 600));
      await until(page, () => {
        const b = window.__bf && window.__bf();
        return b && b.state === 'fly' && b.gliding && b.openness > 0.97 && b.x > 250 && b.x < 1030 && b.y > 160 && b.y < 600;
      }, 120000);
      await snap(page, '06-butterfly.png');
      await page.close();
    }

    if (want('hero')) {
      console.log('6/7 hero image (1280x640)');
      const page = await openDemo(browser, 'shot=hero&size=1.8&count=3', 1280, 640);
      await page.evaluate(() => window.__mouse(640, 330));
      await sleep(14000);
      await snap(page, '00-hero.png');
      await page.close();
    }

    if (want('promo')) {
      console.log('7/7 promo tile (440x280)');
      const page = await openDemo(browser, 'shot=hero&size=1.3&count=2', 440, 280);
      await page.evaluate(() => window.__mouse(220, 150));
      await sleep(10000);
      await snap(page, 'promo-440x280.png');
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log('done ->', OUT);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
