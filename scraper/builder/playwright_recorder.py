"""
Simple Playwright Recorder - Uses Python API

Records your interactions and converts them to our flow format.
"""

from playwright.sync_api import sync_playwright
import json
from pathlib import Path
import sys

def record_session(url, output_dir):
    """
    Launch browser and record interactions using Playwright's Python API.
    """
    
    print("="*70)
    print("🎥 SIMPLE RECORDER")
    print("="*70)
    print("\n📋 Instructions:")
    print("  1. Browser will open")
    print("  2. Perform your workflow (login, navigate, search)")
    print("  3. Get to the results/data page")
    print("  4. Press Ctrl+C in terminal when done")
    print("\n💡 All actions are automatically recorded")
    print("="*70 + "\n")
    
    recorded_actions = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        
        # Record page events
        def on_navigate(frame):
            if frame == page.main_frame:
                recorded_actions.append({
                    "type": "navigate",
                    "config": {"url": frame.url}
                })
                print(f"📍 Navigate: {frame.url}")
        
        page.on("framenavigated", on_navigate)
        
        # Inject recording script
        page.on("load", lambda: page.evaluate("""
            () => {
                // Track fills
                document.addEventListener('input', (e) => {
                    if (e.target.matches('input, textarea, select')) {
                        const selector = e.target.id ? `#${e.target.id}` : 
                                       e.target.name ? `[name="${e.target.name}"]` : 
                                       e.target.className ? `.${e.target.className.split(' ')[0]}` : 
                                       e.target.tagName.toLowerCase();
                        
                        if (!window._recordedFills) window._recordedFills = [];
                        window._recordedFills.push({
                            selector,
                            value: e.target.value,
                            timestamp: Date.now()
                        });
                    }
                }, true);
                
                // Track clicks
                document.addEventListener('click', (e) => {
                    const el = e.target;
                    const selector = el.id ? `#${el.id}` : 
                                   el.name ? `[name="${el.name}"]` : 
                                   el.className ? `.${el.className.split(' ')[0]}` : 
                                   el.tagName.toLowerCase();
                    
                    if (!window._recordedClicks) window._recordedClicks = [];
                    window._recordedClicks.push({
                        selector,
                        text: el.textContent?.trim().slice(0, 30),
                        timestamp: Date.now()
                    });
                }, true);
            }
        """))
        
        print(f"\n🌐 Opening: {url}")
        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
        except Exception as e:
            print(f"⚠️  Navigation warning: {e}")
            print("Trying with domcontentloaded instead...")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
            except Exception as e2:
                print(f"❌ Could not load page: {e2}")
                browser.close()
                return []
        
        print("\n✅ Recording started. Interact with the page...")
        print("💡 Press Ctrl+C when done\n")
        
        try:
            # Keep browser open until user closes or Ctrl+C
            page.wait_for_timeout(3600000)  # 1 hour max
        except KeyboardInterrupt:
            print("\n\n⏹️  Stopping recording...")
        except Exception as e:
            print(f"\n\n⚠️  Recording interrupted: {e}")
        
        # Get recorded events from page
        print("💾 Saving recorded actions...")
        try:
            fills = page.evaluate("() => window._recordedFills || []")
            clicks = page.evaluate("() => window._recordedClicks || []")
            
            # Merge and sort by timestamp
            all_events = []
            for fill in fills:
                all_events.append(("fill", fill))
            for click in clicks:
                all_events.append(("click", click))
            
            all_events.sort(key=lambda x: x[1].get('timestamp', 0))
            
            # Convert to flow steps
            for event_type, event_data in all_events:
                if event_type == "fill":
                    recorded_actions.append({
                        "type": "fill",
                        "config": {
                            "selector": event_data['selector'],
                            "value": event_data['value']
                        }
                    })
                    print(f"✏️  Fill: {event_data['selector']} = {event_data['value'][:30]}")
                elif event_type == "click":
                    recorded_actions.append({
                        "type": "click",
                        "config": {
                            "selector": event_data['selector']
                        }
                    })
                    print(f"👆 Click: {event_data['selector']} ({event_data.get('text', '')})")
        
        except Exception as e:
            print(f"⚠️  Could not retrieve all events: {e}")
            fills = []
            clicks = []
        
        # Close browser before processing
        try:
            browser.close()
        except:
            pass
    
    # Save flow
    flow = {
        "name": "Recorded Flow",
        "steps": recorded_actions,
        "metadata": {
            "recordedWith": "simple-recorder",
            "stepCount": len(recorded_actions)
        }
    }
    
    output_path = Path(output_dir) / "flow.json"
    with open(output_path, 'w') as f:
        json.dump(flow, f, indent=2)
    
    print(f"\n✅ Flow saved to: {output_path}")
    print(f"📊 Captured {len(recorded_actions)} steps\n")
    
    return flow

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python playwright_recorder.py <URL>")
        print("Example: python playwright_recorder.py https://example.com")
        sys.exit(1)
    
    url = sys.argv[1]
    output_dir = Path("scraper/builder/recordings")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    record_session(url, output_dir)
