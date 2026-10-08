# 🕷️ Spider Chaser

A Chrome extension (Manifest V3) that puts realistic, living spiders on every web page.

They walk on eight legs with a real alternating gait (four legs lift while four stay planted),
stalk your mouse cursor in short bursts, and do a lot more:

- **Stalk, pounce, watch** — they creep after the cursor, pause, dash, and stop to watch it (their eyes follow it)
- **Run away** — flick the mouse fast near them, or click close to them
- **Web drops** — climb off the top of the screen and lower themselves back down on a silk thread, swinging and spinning
- **Hunt flies** — a fly lands, the spider ambushes it (the fly may escape), then eats it wrapped in silk
- **Weave webs** — walk to a screen corner and weave a web strand by strand: spokes first, then the rings
- **Wander** — roam around by themselves when the cursor leaves the window

Spiders never block clicks and never touch the page content — they are drawn on a small canvas overlay.

## Install (from source)

1. Download or clone this repository
2. Open `chrome://extensions` and turn on **Developer mode**
3. Click **Load unpacked** and choose the `spider-chaser/` folder
4. Refresh any open page

## Settings (toolbar icon)

Speed · Size · Number of spiders (1–6) · Web drops / Flies / Webs on-off · "Disable on this site" with a list of disabled sites.

Keyboard: `Alt+S` hides the spiders on the current tab, `Alt+R` resets their positions.

## Development

```
spider-chaser/   the extension (manifest.json, content.js, popup.*, icons/)
test/sim.js      headless smoke test — runs content.js against a fake page for 10 simulated minutes
publish/         store listing text and privacy policy
```

Run the smoke test (needs Node.js):

```
node test/sim.js
```

## Privacy

The extension collects nothing, makes no network requests and has no analytics or ads.
Settings are stored only in your browser. See [publish/PRIVACY.md](publish/PRIVACY.md).

## License

No license has been chosen yet.
