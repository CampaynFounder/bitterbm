"""
SIMPLIFIED Interactive Visual Scraper Recorder

Simpler version that uses auto-labeling instead of prompts.
Click elements to extract them - they get auto-labeled based on ID/name.
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Install playwright: pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)


class SimpleRecorder:
    def __init__(self, url, state=None, county=None):
        self.url = url
        self.state = state
        self.county = county
        self.extract_fields = []
        self.screenshots = []
        
        parsed = urlparse(url)
        self.domain = parsed.netloc.replace("www.", "") or "unknown"
        self.output_dir = Path(f"scraper/builder/sites/{self.domain}")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    def inject_overlay(self, page):
        """Inject simple overlay with auto-labeling"""
        page.evaluate("""
            () => {
                const existing = document.getElementById('scraper-overlay');
                if (existing) existing.remove();
                
                const overlay = document.createElement('div');
                overlay.id = 'scraper-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: rgba(0, 0, 0, 0.95);
                    color: white;
                    padding: 20px;
                    border-radius: 8px;
                    z-index: 99999999;
                    font-family: monospace;
                    font-size: 13px;
                    max-width: 300px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                `;
                
                overlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 15px; font-size: 16px;">🎬 Scraper Recorder</div>
                    
                    <div id="label-form" style="display: none; margin-bottom: 15px; padding: 10px; background: rgba(245, 158, 11, 0.2); border-radius: 4px;">
                        <div style="font-size: 11px; margin-bottom: 5px;">Label for this field:</div>
                        <input id="label-input" type="text" style="width: 100%; padding: 5px; margin-bottom: 5px; border: none; border-radius: 3px; font-size: 12px; box-sizing: border-box;" />
                        <button id="label-submit" style="width: 48%; padding: 5px; background: #f59e0b; border: none; border-radius: 3px; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Add</button>
                        <button id="label-cancel" style="width: 48%; padding: 5px; background: #666; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px; margin-left: 4%;">Skip</button>
                    </div>
                    
                    <div id="mode-indicator" style="margin-bottom: 10px; padding: 8px; background: rgba(74, 222, 128, 0.2); border-radius: 4px;">
                        Mode: <span style="color: #4ade80; font-weight: bold;">INTERACT</span>
                    </div>
                    
                    <button id="btn-extract" style="width: 100%; padding: 10px; margin-bottom: 5px; background: #f59e0b; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">📍 Extract Mode</button>
                    <button id="btn-interact" style="width: 100%; padding: 10px; margin-bottom: 5px; background: #4ade80; border: none; border-radius: 4px; color: black; font-weight: bold; cursor: pointer;">👆 Interact Mode</button>
                    <button id="btn-screenshot" style="width: 100%; padding: 10px; margin-bottom: 5px; background: #06b6d4; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">📸 Screenshot</button>
                    <button id="btn-finish" style="width: 100%; padding: 10px; background: #ef4444; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">✅ Finish</button>
                    
                    <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #444; font-size: 12px;">
                        Fields: <span id="field-count" style="color: #4ade80; font-weight: bold;">0</span>
                    </div>
                `;
                
                document.body.appendChild(overlay);
                
                window.scraperMode = 'interact';
                window.extractedElements = [];
                window.shouldFinish = false;
                window.shouldScreenshot = false;
                window.pendingElement = null;
                
                const setMode = (mode, color, text) => {
                    window.scraperMode = mode;
                    const indicator = document.getElementById('mode-indicator');
                    indicator.innerHTML = `Mode: <span style="color: ${color}; font-weight: bold;">${text}</span>`;
                    indicator.style.background = `rgba(${mode === 'extract' ? '245, 158, 11' : '74, 222, 128'}, 0.2)`;
                };
                
                document.getElementById('btn-extract').onclick = () => setMode('extract', '#f59e0b', 'EXTRACT');
                document.getElementById('btn-interact').onclick = () => setMode('interact', '#4ade80', 'INTERACT');
                document.getElementById('btn-screenshot').onclick = () => window.shouldScreenshot = true;
                document.getElementById('btn-finish').onclick = () => window.shouldFinish = true;
                
                const labelForm = document.getElementById('label-form');
                const labelInput = document.getElementById('label-input');
                
                const showLabelForm = (suggestedLabel) => {
                    labelInput.value = suggestedLabel;
                    labelForm.style.display = 'block';
                    labelInput.focus();
                    labelInput.select();
                };
                
                const hideLabelForm = () => {
                    labelForm.style.display = 'none';
                    window.pendingElement = null;
                };
                
                const addField = () => {
                    const label = labelInput.value.trim();
                    if (!label || !window.pendingElement) {
                        hideLabelForm();
                        return;
                    }
                    
                    const el = window.pendingElement;
                    window.extractedElements.push(el);
                    
                    el.element.style.outline = '3px solid #f59e0b';
                    el.element.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                    
                    document.getElementById('field-count').textContent = window.extractedElements.length;
                    hideLabelForm();
                };
                
                document.getElementById('label-submit').onclick = addField;
                document.getElementById('label-cancel').onclick = hideLabelForm;
                labelInput.onkeydown = (e) => {
                    if (e.key === 'Enter') addField();
                    else if (e.key === 'Escape') hideLabelForm();
                };
                
                document.addEventListener('click', (e) => {
                    if (window.scraperMode !== 'extract') return;
                    if (e.target.closest('#scraper-overlay')) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const el = e.target;
                    let selector = '';
                    if (el.id) selector = `#${el.id}`;
                    else if (el.name) selector = `[name="${el.name}"]`;
                    else if (el.className && typeof el.className === 'string') {
                        const classes = el.className.split(' ').filter(c => c);
                        if (classes.length) selector = `.${classes[0]}`;
                    }
                    if (!selector) selector = el.tagName.toLowerCase();
                    
                    const text = el.textContent?.trim().slice(0, 100) || '';
                    const value = el.value || el.href || '';
                    
                    let extractType = 'text';
                    if (el.tagName === 'A') extractType = 'href';
                    else if (el.tagName === 'IMG') extractType = 'src';
                    else if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') extractType = 'value';
                    
                    const suggestedLabel = (el.id || el.name || text.split(' ')[0] || 'field').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    
                    window.pendingElement = {
                        label: suggestedLabel,
                        selector,
                        extractType,
                        tag: el.tagName.toLowerCase(),
                        text,
                        value,
                        element: el
                    };
                    
                    showLabelForm(suggestedLabel);
                }, true);
            }
        """)
    
    def record_session(self):
        """Open browser and record"""
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)
            page = browser.new_page()
            
            print(f"🌐 Opening {self.url}...")
            page.goto(self.url, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2000)
            
            self.inject_overlay(page)
            print("✅ Overlay ready!\n")
            print("="*60)
            print("INSTRUCTIONS:")
            print("  1. Click '📍 Extract Mode' button")
            print("  2. Click elements to mark them")
            print("  3. Type label in overlay input → press Enter")
            print("  4. Click '📸 Screenshot' when ready")
            print("  5. Click '✅ Finish' to complete")
            print("="*60 + "\n")
            
            screenshot_count = 0
            
            while True:
                page.wait_for_timeout(500)
                
                try:
                    overlay_exists = page.evaluate("() => !!document.getElementById('scraper-overlay')")
                    if not overlay_exists:
                        self.inject_overlay(page)
                    
                    if page.evaluate("() => window.shouldScreenshot"):
                        screenshot_count += 1
                        path = self.output_dir / f"screenshot_{screenshot_count}.png"
                        page.screenshot(path=path)
                        print(f"📸 Screenshot {screenshot_count} saved")
                        page.evaluate("() => window.shouldScreenshot = false")
                        self.screenshots.append(str(path))
                    
                    if page.evaluate("() => window.shouldFinish"):
                        break
                except Exception as e:
                    print(f"⚠️  {e}")
                    page.wait_for_timeout(1000)
            
            try:
                final = self.output_dir / "final_screenshot.png"
                page.screenshot(path=final, full_page=True)
                print(f"📸 Final screenshot")
                self.screenshots.append(str(final))
            except:
                pass
            
            try:
                self.extract_fields = page.evaluate("() => window.extractedElements || []")
                print(f"\n✅ Captured {len(self.extract_fields)} fields")
                for i, f in enumerate(self.extract_fields, 1):
                    print(f"  {i}. {f.get('label')} → {f.get('selector')}")
            except:
                self.extract_fields = []
            
            browser.close()
    
    def generate_config(self):
        """Generate config"""
        fields = {}
        for f in self.extract_fields:
            label = f.get('label', 'unknown')
            fields[label] = {
                "selector": f['selector'],
                "type": f.get('extractType', 'text'),
                "element": f['tag']
            }
        
        steps = [
            {"type": "navigate", "config": {"url": self.url}},
            {"type": "wait", "config": {"timeout": 2000}}
        ]
        
        if fields:
            steps.append({
                "type": "extract_data",
                "config": {"fields": fields}
            })
        
        config = {
            "flow": {"name": f"{self.state or 'Unknown'} {self.county or ''} Scraper".strip(), "steps": steps},
            "siteConfig": {
                "siteId": f"{(self.state or 'unknown').lower()}-{(self.county or 'unknown').lower()}-{self.domain.replace('.', '-')}",
                "state": self.state,
                "county": self.county,
                "baseUrl": self.url,
                "metadata": {
                    "recordedAt": datetime.now().isoformat(),
                    "extractionFields": list(fields.keys()),
                    "screenshots": self.screenshots
                },
                "extractedFields": self.extract_fields
            }
        }
        
        path = self.output_dir / "config.json"
        with open(path, "w") as f:
            json.dump(config, f, indent=2)
        
        print(f"\n💾 Config: {path}")
        print(f"📁 Files: {self.output_dir}")
        return config


def main():
    parser = argparse.ArgumentParser(description="Simple Interactive Scraper Recorder")
    parser.add_argument("--url", required=True)
    parser.add_argument("--state", help="State code")
    parser.add_argument("--county", help="County name")
    args = parser.parse_args()
    
    recorder = SimpleRecorder(args.url, args.state, args.county)
    recorder.record_session()
    recorder.generate_config()
    print("\n✅ Done!")


if __name__ == "__main__":
    main()
