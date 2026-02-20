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
║    q        →  Quit and save session.json                            ║
║                                                                      ║
║  In browser: Ctrl+Shift+C = capture mode; click element to tag for DB.║
║  If a PDF opens in a new tab: keep the original tab open.            ║
╚══════════════════════════════════════════════════════════════════════╝
"""


def _normalize_url(url: str) -> str:
    """Strip whitespace and surrounding quotes so pasted URLs work (backward/forward compatible)."""
    u = url.strip()
    quote_chars = ('"', "'", "\u201c", "\u201d", "\u2018", "\u2019")
    changed = True
    while changed and len(u) > 1:
        changed = False
        for q in quote_chars:
            if u.startswith(q) and u.endswith(q):
                u = u[1:-1].strip()
                changed = True
                break
    return u


class SessionRecorder:
    def __init__(self, url: str, output_path: str = "session.json"):
        self.url             = _normalize_url(url)
        self.output_path     = output_path
        self.snapshots       = []   # multiple snapshots across navigation
        self.persisted_events = []  # events recovered from sessionStorage after reload/postback
        self.page: Page      = None

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

            # Run observer in every frame (main + iframes) when each frame loads
            await context.add_init_script(OBSERVER_JS)

            self.page = await context.new_page()

            # Also ensure observer in main frame on each navigation (belt-and-suspenders)
            await self.page.add_init_script(OBSERVER_JS)

            self.page.on("framenavigated", self._on_frame_navigated)
            self.page.on("load", self._on_load)

            await self.page.goto(self.url, wait_until="domcontentloaded")

            # Inject into current page immediately
            await self._inject_observer()

            # Run the interactive command loop
            await self._command_loop(browser)

    async def _collect_persisted_events(self):
        """Read events backed up to sessionStorage before a reload/postback and merge into persisted_events."""
        try:
            raw = await self.page.evaluate("""
                (function() {
                    var raw = sessionStorage.getItem('__analyzer_events_backup');
                    if (raw) {
                        sessionStorage.removeItem('__analyzer_events_backup');
                        return raw;
                    }
                    return null;
                })();
            """)
            if raw:
                self.persisted_events.extend(json.loads(raw))
        except Exception:
            pass

    async def _inject_observer(self):
        """Inject observer into main frame and all iframes so capture mode works in tables inside iframes."""
        for frame in self.page.frames:
            try:
                await frame.evaluate(OBSERVER_JS)
            except Exception as e:
                pass  # Some frames (e.g. cross-origin) may not allow injection

    async def _inject_observer_main_only(self):
        try:
            await self.page.evaluate(OBSERVER_JS)
        except Exception as e:
            print(f"  [WARN] Observer injection failed: {e}")

    async def _on_frame_navigated(self, frame):
        """Re-inject observer into all frames when any frame navigates (catches late-loading iframes)."""
        if frame == self.page.main_frame:
            print(f"  📍 Navigated to: {frame.url}")
        await self._inject_observer()

    async def _on_load(self, page):
        await asyncio.sleep(0.5)  # Let page settle
        await self._inject_observer()
        await asyncio.sleep(0.3)  # Let iframes finish loading
        await self._inject_observer()
        print(f"  ✅ Page loaded — observer active (main + iframes)")

    async def _take_snapshot(self, label: str = "", quiet: bool = False):
        try:
            await self._collect_persisted_events()
            # Collect session from main frame and all iframes (capture hints may be in an iframe)
            sessions = []
            expand_patterns = []
            for frame in self.page.frames:
                try:
                    has_analyzer = await frame.evaluate("typeof window.__ANALYZER__ !== 'undefined'")
                    if not has_analyzer:
                        continue
                    s = await frame.evaluate("window.__ANALYZER__.getSession()")
                    if not isinstance(s, dict):
                        continue
                    sessions.append(s)
                    ep = await frame.evaluate("window.__ANALYZER__.findExpandPatterns()")
                    if ep:
                        expand_patterns.extend(ep)
                except Exception:
                    continue
            if not sessions:
                raise RuntimeError("No frame had __ANALYZER__")
            session = sessions[0]
            for s in sessions[1:]:
                session.setdefault("events", []).extend(s.get("events", []))
                session.setdefault("captureHints", []).extend(s.get("captureHints", []))
            # Prepend events from before any reload/postback
            session.setdefault("events", [])[:0] = self.persisted_events
            session["events"].sort(key=lambda e: e.get("timestamp") or 0)
            if not expand_patterns:
                expand_patterns = await self.page.evaluate("window.__ANALYZER__.findExpandPatterns()")
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
            if not quiet:
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
                final = await self._take_snapshot("final", quiet=True)
                if final is None and self.snapshots:
                    print("  (Using earlier snapshot(s) — original tab may have been closed.)")
                await browser.close()
                self._save_output()
                n = len(self.snapshots)
                print(f"\n  ✅ Session saved to: {self.output_path} ({n} snapshot(s))")
                break

            elif cmd == "s":
                try:
                    await self._collect_persisted_events()
                    events = list(self.persisted_events)
                    for frame in self.page.frames:
                        try:
                            has_analyzer = await frame.evaluate("typeof window.__ANALYZER__ !== 'undefined'")
                            if not has_analyzer:
                                continue
                            s = await frame.evaluate("window.__ANALYZER__.getSession()")
                            if isinstance(s, dict):
                                events.extend(s.get("events", []))
                        except Exception:
                            continue
                    events.sort(key=lambda e: e.get("timestamp") or 0)
                    # Collect capture hints from all frames for display
                    hints = []
                    for frame in self.page.frames:
                        try:
                            if not await frame.evaluate("typeof window.__ANALYZER__ !== 'undefined'"):
                                continue
                            s = await frame.evaluate("window.__ANALYZER__.getSession()")
                            if isinstance(s, dict):
                                hints.extend(s.get("captureHints", []))
                        except Exception:
                            pass
                    print(f"  📊 Events recorded: {len(events)} (all frames) | Tagged: {len(hints)}")
                    for e in events[-8:]:
                        sel = e.get("selector", "")
                        text = (e.get("text") or e.get("value") or "")[:40]
                        print(f"      [{e.get('type', '?')}] {sel} — {text}")
                    if hints:
                        for h in hints[-5:]:
                            print(f"      🎯 [{h.get('role','?')}] {h.get('fieldName','')} — {h.get('selector','')[:50]}")
                except Exception as err:
                    print(f"  [WARN] Could not read session state: {err}")

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

    url    = _normalize_url(sys.argv[1])
    output = sys.argv[2] if len(sys.argv) > 2 else "session.json"

    recorder = SessionRecorder(url, output)
    await recorder.start()


if __name__ == "__main__":
    asyncio.run(main())
