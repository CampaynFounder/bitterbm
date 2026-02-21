#!/usr/bin/env python3
"""
Debug scraper iframe content. Run from project root:
  pip install playwright && python3 -m playwright install chromium
  python3 scripts/debug-scraper-iframe.py
"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    page.set_default_timeout(30_000)

    page.goto("https://superiorcourtclerk.cobbcounty.gov/WebCaseManagement/mainpage.aspx")
    page.wait_for_load_state("domcontentloaded")

    # Wait for content and list frames (site may use <frame> or <iframe>)
    page.wait_for_timeout(4000)

    print("Frames on page:")
    for i, f in enumerate(page.frames):
        url = f.url[:70] if len(f.url) > 70 else f.url
        print(f"  [{i}] name={f.name!r} url={url!r}")

    # Try legacy <frame> first (frameset), then <iframe>
    main_frame = page.frame(name="main")
    if main_frame:
        print("\nUsing page.frame(name='main') (legacy frame)...")
        try:
            links = main_frame.locator("a").all()
            print(f"Found {len(links)} links:")
            for i, link in enumerate(links[:15]):
                try:
                    lid = link.get_attribute("id")
                    href = link.get_attribute("href") or ""
                    text = (link.inner_text() or "")[:60]
                    print(f"  [{i}] id={lid!r} | text={text!r} | href={href[:50]!r}...")
                except Exception as e:
                    print(f"  [{i}] error: {e}")
        except Exception as e:
            print(f"Links failed: {e}")
    else:
        frame = page.frame_locator('iframe[name="main"]')
        if page.locator('iframe[name="main"]').count() == 0:
            frame = page.frame_locator('iframe[src*="Main"]')
        print("\nUsing frame_locator (iframe)...")
        try:
            frame.locator("body").screenshot(path="iframe_content.png", timeout=10_000)
            print("Screenshot saved: iframe_content.png")
        except Exception as e:
            print(f"Screenshot skipped: {e}")
        try:
            links = frame.locator("a").all()
            print(f"Found {len(links)} links:")
            for i, link in enumerate(links[:15]):
                try:
                    lid = link.get_attribute("id")
                    href = link.get_attribute("href") or ""
                    text = (link.inner_text() or "")[:60]
                    print(f"  [{i}] id={lid!r} | text={text!r} | href={href[:50]!r}...")
                except Exception as e:
                    print(f"  [{i}] error: {e}")
        except Exception as e:
            print(f"Links failed: {e}")

    # Pause to inspect manually
    print("\nPausing for manual inspect (close inspector or press Enter in terminal to continue)...")
    page.pause()

    browser.close()
