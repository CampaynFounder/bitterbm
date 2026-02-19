"""
analyzer/session_recorder.py

Launches a headed Playwright browser, injects the DOM observer,
and records all user interactions until they press ENTER to finalize.
Outputs a raw session JSON for the compiler to process.
"""

import asyncio
import json
import time
import sys
from pathlib import Path
from playwright.async_api import async_playwright, Page, Browser


OBSERVER_JS = (Path(__file__).parent / "observer.js").read_text()

INSTRUCTIONS = """
╔══════════════════════════════════════════════════════════════════════╗
║              DOM ANALYZER — INTERACTION RECORDER                     ║
╠══════════════════════════════════════════════════════════════════════╣
║  • Navigate and interact with the page normally                      ║
║  • Click rows to expand sub-tables                                   ║
║  • Fill forms, select dates, check boxes                             ║
║  • Open PDFs or navigate to detail pages                             ║
║  • The observer records everything automatically                     ║
║                                                                      ║
║  Commands (type in this terminal):                                   ║
║    [ENTER]  →  Save session snapshot                                 ║
║    s        →  Show current event count                              ║
║    q        →  Quit and generate schema                              ║
╚══════════════════════════════════════════════════════════════════════╝
"""


class SessionRecorder:
    def __init__(self, url: str, output_path: str = "session.json"):
        self.url         = url
        self.output_path = output_path
        self.snapshots   = []   # multiple snapshots across navigation
        self.page: Page  = None

    async def start(self):
        print(INSTRUCTIONS)
        print(f"  🌐  Opening: {self.url}\n")

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                headless=False,
                args=["--start-maximized"],
            )
            context = await browser.new_context(
                viewport=None,  # Use full window
                record_video_dir=None,
            )

            self.page = await context.new_page()

            # Inject observer on every navigation
            await self.page.add_init_script(OBSERVER_JS)

            self.page.on("framenavigated", self._on_navigation)
            self.page.on("load", self._on_load)

            await self.page.goto(self.url, wait_until="domcontentloaded")

            # Inject into current page immediately
            await self._inject_observer()

            # Run the interactive command loop
            await self._command_loop(browser)

    async def _inject_observer(self):
        try:
            await self.page.evaluate(OBSERVER_JS)
        except Exception as e:
            print(f"  [WARN] Observer injection failed: {e}")

    async def _on_navigation(self, frame):
        if frame == self.page.main_frame:
            print(f"  📍 Navigated to: {frame.url}")

    async def _on_load(self, page):
        await asyncio.sleep(0.5)  # Let page settle
        await self._inject_observer()
        print(f"  ✅ Page loaded — observer active")

    async def _take_snapshot(self, label: str = ""):
        try:
            session = await self.page.evaluate("window.__ANALYZER__.getSession()")
            expand_patterns = await self.page.evaluate(
                "window.__ANALYZER__.findExpandPatterns()"
            )
            snapshot = {
                "label":           label or f"snapshot_{len(self.snapshots)}",
                "timestamp":       time.time(),
                "url":             self.page.url,
                "session":         session,
                "expandPatterns":  expand_patterns,
            }
            self.snapshots.append(snapshot)
            print(f"  💾 Snapshot saved: {len(session.get('events', []))} events recorded")
            return snapshot
        except Exception as e:
            print(f"  [ERROR] Snapshot failed: {e}")
            return None

    async def _command_loop(self, browser: Browser):
        loop = asyncio.get_event_loop()

        while True:
            # Non-blocking stdin read
            cmd = await loop.run_in_executor(
                None,
                lambda: input("\n  > ").strip().lower()
            )

            if cmd == "q":
                await self._take_snapshot("final")
                await browser.close()
                self._save_output()
                print(f"\n  ✅ Session saved to: {self.output_path}")
                break

            elif cmd == "s":
                try:
                    session = await self.page.evaluate("window.__ANALYZER__.getSession()")
                    events  = session.get("events", [])
                    print(f"  📊 Events recorded: {len(events)}")
                    for e in events[-5:]:
                        print(f"      [{e['type']}] {e.get('selector', '')} — {e.get('text','')[:40]}")
                except:
                    print("  [WARN] Could not read session state")

            elif cmd == "":
                label = input("  Label this snapshot (optional): ").strip()
                await self._take_snapshot(label or f"snap_{len(self.snapshots)}")

            else:
                print("  Commands: [ENTER]=snapshot  s=status  q=quit+generate")

    def _save_output(self):
        output = {
            "meta": {
                "url":       self.url,
                "recorded":  time.time(),
                "snapshots": len(self.snapshots),
            },
            "snapshots": self.snapshots,
        }
        with open(self.output_path, "w") as f:
            json.dump(output, f, indent=2)


async def main():
    if len(sys.argv) < 2:
        print("Usage: python session_recorder.py <url> [output.json]")
        sys.exit(1)

    url    = sys.argv[1]
    output = sys.argv[2] if len(sys.argv) > 2 else "session.json"

    recorder = SessionRecorder(url, output)
    await recorder.start()


if __name__ == "__main__":
    asyncio.run(main())
