const DEFAULTS = { enabled: true, speed: 1, size: 1, count: 1, drops: true, flies: true, webs: true, butterfly: true, blocked: [] };

const $ = id => document.getElementById(id);
const enabled = $('enabled');
const drops = $('drops');
const flies = $('flies');
const webs = $('webs');
const butterfly = $('butterfly');
const sliders = {
  speed: { input: $('speed'), out: $('speedOut'), fmt: v => Number(v).toFixed(1) + '×' },
  size:  { input: $('size'),  out: $('sizeOut'),  fmt: v => Number(v).toFixed(1) + '×' },
  count: { input: $('count'), out: $('countOut'), fmt: v => String(Math.round(v)) }
};

const siteName = $('siteName');
const siteBtn = $('siteBtn');
const blockedBox = $('blockedBox');
const blockedList = $('blockedList');

let blocked = [];      // list of disabled hostnames (without "www.")
let currentHost = '';  // hostname of the active tab ('' if not a normal web page)

function normalize(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '');
}

function renderSite() {
  if (!currentHost) {
    siteName.textContent = 'n/a';
    siteBtn.textContent = 'Not available on this page';
    siteBtn.disabled = true;
    return;
  }
  siteName.textContent = currentHost;
  siteName.title = currentHost;
  siteBtn.disabled = false;
  siteBtn.textContent = blocked.includes(currentHost)
    ? 'Enable on this site'
    : 'Disable on this site';
}

function renderBlockedList() {
  blockedList.textContent = '';
  blockedBox.hidden = blocked.length === 0;
  for (const host of blocked) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = host;
    name.title = host;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'x';
    x.textContent = '×';
    x.title = 'Enable again on ' + host;
    x.addEventListener('click', () => saveBlocked(blocked.filter(h => h !== host)));
    li.append(name, x);
    blockedList.appendChild(li);
  }
}

function saveBlocked(list) {
  blocked = list;
  chrome.storage.local.set({ blocked });
  renderSite();
  renderBlockedList();
}

function render(s) {
  enabled.checked = s.enabled !== false;
  drops.checked = s.drops !== false;
  flies.checked = s.flies !== false;
  webs.checked = s.webs !== false;
  butterfly.checked = s.butterfly !== false;
  for (const key of Object.keys(sliders)) {
    const { input, out, fmt } = sliders[key];
    input.value = s[key];
    out.textContent = fmt(s[key]);
  }
  blocked = Array.isArray(s.blocked) ? s.blocked : [];
  renderSite();
  renderBlockedList();
}

// which site is the user looking at?
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  try {
    const url = new URL(tabs[0].url);
    if (url.protocol === 'http:' || url.protocol === 'https:') currentHost = normalize(url.hostname);
  } catch (e) {
    currentHost = '';
  }
  renderSite();
});

chrome.storage.local.get(DEFAULTS, items => render({ ...DEFAULTS, ...items }));

enabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabled.checked });
});

drops.addEventListener('change', () => {
  chrome.storage.local.set({ drops: drops.checked });
});

flies.addEventListener('change', () => {
  chrome.storage.local.set({ flies: flies.checked });
});

webs.addEventListener('change', () => {
  chrome.storage.local.set({ webs: webs.checked });
});

butterfly.addEventListener('change', () => {
  chrome.storage.local.set({ butterfly: butterfly.checked });
});

for (const key of Object.keys(sliders)) {
  const { input, out, fmt } = sliders[key];
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    chrome.storage.local.set({ [key]: v });
  });
}

siteBtn.addEventListener('click', () => {
  if (!currentHost) return;
  saveBlocked(
    blocked.includes(currentHost)
      ? blocked.filter(h => h !== currentHost)
      : [...blocked, currentHost]
  );
});

// Reset puts the sliders back to default but keeps the list of disabled sites.
$('reset').addEventListener('click', () => {
  const fresh = { ...DEFAULTS, blocked };
  chrome.storage.local.set(fresh);
  render(fresh);
});
