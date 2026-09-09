"""Sweep suite — clicks every control in every view as every account.

Catches the class of bug a scripted test misses: a path nobody thought to
script. It found `h is not a function`, where a board.js entry point called
from the dashboard ran before board.render() had ever assigned its helper.

Run from the repository root:  python3 tests/sweep.test.py
Set CHROME_PATH if Chromium lives somewhere else.
Originate Command · application
"""
import os, pathlib, sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("[INFO] Playwright is not installed in the active Python environment.")
    print("       To execute sweep tests, run: pip install playwright && playwright install")
    sys.exit(0)

CHROME = os.environ.get('CHROME_PATH', '')
if not CHROME:
    if sys.platform == 'win32':
        candidates = [
            r'C:\Program Files\Google\Chrome\Application\chrome.exe',
            r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
            os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
            r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
            r'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
        ]
        for c in candidates:
            if os.path.exists(c):
                CHROME = c
                break
    else:
        for c in ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium-browser']:
            if os.path.exists(c):
                CHROME = c
                break

url = pathlib.Path('index.html').resolve().as_uri()
problems = []

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    page = b.new_page(viewport={'width': 1400, 'height': 1000})
    errs = []
    page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    page.on('console', lambda m: errs.append(m.type.upper() + ': ' + m.text)
            if m.type in ('error', 'warning')
            and 'fonts.g' not in m.text and 'ERR_CONN' not in m.text else None)
    page.goto(url, wait_until='domcontentloaded')
    page.wait_for_timeout(400)

    def shut():
        page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>{d.close();d.remove();})")

    # Load all user accounts from the application store
    users = page.evaluate("""() => {
        try {
            return (OC.store.state.users || []).map(u => ({ id: u.id, name: u.name, admin: !!u.admin }));
        } catch (_) {
            return [{ id: 'u-shohag', name: 'Shohag Munshe', admin: true }];
        }
    }""")
    if not users:
        users = [{'id': 'u-shohag', 'name': 'Shohag Munshe', 'admin': True}]

    clicks = 0
    for u in users:
        shut()
        page.evaluate(f"() => {{ localStorage.setItem('oc-authenticated-user', '{u['id']}'); location.reload(); }}")
        page.wait_for_timeout(350)
        target_views = ['Dashboard', 'Notice Board', 'Management', 'Clients Portal', 'Messages', 'Foundation']
        for view in target_views:
            shut()
            btn = page.get_by_role('button', name=view, exact=True)
            if btn.count() == 0:
                continue
            btn.first.click()
            page.wait_for_timeout(200)
            before = len(errs)
            for i in range(page.locator('#page button').count()):
                bt = page.locator('#page button').nth(i)
                try:
                    if not bt.is_visible():
                        continue
                    if (bt.inner_text() or '').strip() in ('Revoke',):
                        continue           # removes the row the loop is walking
                    bt.click(timeout=1200)
                    clicks += 1
                    page.wait_for_timeout(70)
                    shut()
                except Exception:
                    shut()
            for sel in range(page.locator('#page select').count()):
                s = page.locator('#page select').nth(sel)
                try:
                    opts = s.locator('option').count()
                    if opts > 1:
                        s.select_option(index=opts - 1, timeout=1000); page.wait_for_timeout(90)
                        s.select_option(index=0, timeout=1000); page.wait_for_timeout(90)
                except Exception:
                    pass
            for cb in range(page.locator('#page input[type=checkbox]').count()):
                try:
                    page.locator('#page input[type=checkbox]').nth(cb).click(timeout=800)
                    page.wait_for_timeout(80)
                except Exception:
                    pass
            new = errs[before:]
            if new:
                problems.append(f"{u} / {view}: {new}")

    print(f"{len(users)} accounts x 5 views, {clicks} controls clicked")
    print("PROBLEMS:", problems or "none")
    b.close()

sys.exit(1 if problems else 0)
