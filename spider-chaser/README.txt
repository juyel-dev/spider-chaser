SPIDER CHASER  (v1.6.0)
======================

Realistic spiders that walk across any webpage and stalk your mouse cursor.


INSTALL
-------
1. Open  chrome://extensions
2. Turn on "Developer mode" (top right)
3. Click "Load unpacked" and select this folder (the one containing manifest.json)
4. Refresh any open page. Pin the extension (puzzle icon) to reach its popup quickly.

After changing any file: click the Reload button on the extension card, then refresh the page.


WHAT THE SPIDERS DO
-------------------
- Walk on 8 legs with a real alternating gait: 4 legs lift while the other 4 stay planted.
- Stalk the cursor in short bursts with pauses, turn gradually, and stop a little way
  from the cursor to watch it (their eyes follow it).
- Pounce now and then.
- Panic and run away if the cursor is flicked fast nearby, or if you click close to them.
- Wander around by themselves when the cursor leaves the window.
- Twitch their front legs when standing still.
- Web drops: every minute or so a spider climbs off the top of the screen and lowers itself
  back down on a silk thread. It hangs, swings and spins, then either cuts the thread and
  lands, or climbs back up and drops somewhere else.
  Clicking near a hanging spider makes it fall and run.
- Several spiders keep their distance from each other.
- Flies: a small fly flies in now and then, zig-zags around and lands. A nearby spider
  creeps up on it in short bursts and pounces. The fly may notice in time and escape.
  A catch is eaten for a few seconds (wrapped in silk).
- Webs: now and then a spider walks to a screen corner and weaves a web by walking its
  pattern (spokes first, then the rings). The web stays for a minute or two, then fades.
  If something scares the spider, the unfinished web is left behind.


POPUP (toolbar icon)
--------------------
- On/Off switch ........... all spiders, all tabs
- Speed (0.5x - 2x)
- Size  (0.6x - 2x)
- Spiders (1 - 6)
- Web drops on/off
- Flies (prey) on/off
- Webs on/off
- This site ............... "Disable on this site" / "Enable on this site"
- Disabled sites .......... list of sites where spiders are off (click x to enable again)
- Reset to default ........ resets the sliders (keeps the disabled-sites list)

Changes apply instantly on open pages. Settings are saved in the browser.


KEYBOARD SHORTCUTS (on the page)
--------------------------------
Alt + S    hide / show the spiders on this tab only (comes back after refresh)
Alt + R    reset the spiders' positions


PRIVACY
-------
The extension makes no network requests and collects nothing. Permissions used:
- storage    to remember your popup settings and the disabled-sites list
- activeTab  to read the address of the current tab when you open the popup
             (so it can show / save the site name)
The spiders are drawn on a small canvas on top of the page and never touch page content.
They ignore mouse input, so they never block clicks. Works on regular web pages only
(not on chrome:// pages or the Chrome Web Store).


FILES
-----
manifest.json          extension definition (Manifest V3)
content.js             the spiders: movement, legs, drawing, web drops, flies, webs
popup.html/.css/.js    the settings popup
icons/                 toolbar and extension-page icons

Outside this folder (not part of the extension):
../old-versions/       earlier versions of the code, kept as a backup
../test/sim.js         headless smoke test (node sim.js) - runs content.js with a fake
                       page for 10 simulated minutes and reports errors
../publish/            store listing text, privacy policy and the ready-to-upload ZIP


TROUBLESHOOTING
---------------
- No spider: reload the extension AND refresh the page; check the popup switch;
  check that the site is not in "Disabled sites"; try Alt + R.
- Spider seems stuck after changing size: use Alt + R.
- Too fast / too slow: use the Speed slider.
- A page looks wrong when a spider is over it: use "Disable on this site".
