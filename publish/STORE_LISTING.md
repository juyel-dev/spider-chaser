# Spider Chaser — Chrome Web Store listing (copy/paste)

## Name
Spider Chaser

## Short description (max 132 characters)
Realistic spiders walk across any page, stalk your cursor, catch flies, weave webs and drop down on silk threads.

## Category
Fun  (Chrome Web Store: "Fun")

## Language
English

## Detailed description
Spider Chaser puts living spiders on every web page you visit.

They walk on eight legs with a real gait — four legs lift while the other four stay planted — and they stalk your mouse cursor in short bursts, turning slowly and stopping to watch it with their eyes.

What they do:
• Stalk your cursor, pause, pounce and watch it
• Run away if you flick the mouse fast near them, or click close to them
• Climb off the top of the screen and lower themselves back down on a silk thread, swinging and spinning
• Ambush a fly that lands on the page, and eat it
• Weave a web in a screen corner, strand by strand, spokes first, then the rings
• Wander around by themselves when the cursor leaves the window
• A colourful butterfly flutters around the page on its own, glides, lands and flies away again

Make it yours (toolbar icon):
• Speed, size and number of spiders (up to 6)
• Turn web drops, flies, webs and the butterfly on or off
• Switch the spiders off on a single site with one click
• Alt+S hides them on the current tab, Alt+R resets their positions

The spiders never block clicks or touch the page content — they are drawn on top of the page and ignore the mouse.

Privacy: the extension collects nothing, makes no network requests and has no accounts or ads. Your settings are stored only in your browser.

## Single purpose (Developer Dashboard → Privacy tab)
Show animated spiders that walk around web pages and follow the mouse cursor, as entertainment.

## Permission justifications
- **storage** — saves the user's popup settings (speed, size, number of spiders, on/off switches, list of sites where spiders are disabled) in the browser.
- **activeTab** — when the user opens the popup, reads the address of the current tab so the popup can show its name and offer "Disable on this site". Nothing else is read.
- **Content script on all URLs (`<all_urls>`)** — the spiders must be drawn on top of whichever page the user is viewing. The script only draws on its own canvas inside a closed overlay; it does not read, modify or send page content.

## Data usage disclosures (Privacy tab)
- Does the extension collect user data? **No** — none of the listed categories (personally identifiable info, health, financial, authentication, personal communications, location, web history, user activity, website content).
- Check all three certifications:
  - I do not sell or transfer user data to third parties
  - I do not use or transfer user data for purposes unrelated to the single purpose
  - I do not use or transfer user data to determine creditworthiness or for lending
- Remote code: **No** (all code is in the package).
- Privacy policy URL: host `PRIVACY.md` somewhere public (for example the GitHub repo) and paste the link.

## Store images to prepare
- Icon 128×128: `spider-chaser/icons/icon128.png` (already done)
- At least 1 screenshot, 1280×800 (best 3–5). Good shots:
  1. A spider next to the cursor on a plain article page
  2. A spider hanging on its silk thread over a page
  3. A corner web mid-weave with the spider on it
  4. The popup open (Speed / Size / Spiders / switches)
  5. A spider holding a wrapped fly
  6. The butterfly on a page
  (all of these are generated into `docs/screenshots/` by the "Screenshots" GitHub Action — download them from the Action's artifact or from the repo)
- Small promo tile 440×280 (optional but helps): big spider on a plain light background
- A short GIF/video of the thread drop or the fly pounce is the best thing for sharing on social media

## Version notes (first release)
1.7.0 — adds a butterfly, calmer walking and cleaner legs, thinner silk thread.
