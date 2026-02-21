"""
Interactive Visual Scraper Recorder

This tool opens a browser and lets you:
1. Interact with the page (fill forms, click buttons)
2. Click elements to mark them for extraction
3. Generate a complete Playwright config from your actions

Usage:
  python scraper/builder/interactive_recorder.py --url "https://example.com" --state GA --county Cobb
  
Then:
  - Interact with the page (fill search forms, click, etc.)
  - Press 'E' to enter "Extract Mode" - click elements to capture
  - Press 'S' to take screenshot
  - Press 'Q' when done - generates config
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


class InteractiveRecorder:
    def __init__(self, url, state=None, county=None):
        self.url = url
        self.state = state
        self.county = county
        self.actions = []
        self.extract_fields = []
        self.screenshots = []
        
        parsed = urlparse(url)
        self.domain = parsed.netloc.replace("www.", "") or "unknown"
        self.output_dir = Path(f"scraper/builder/sites/{self.domain}")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    def inject_overlay(self, page):
        """Inject interactive overlay UI into the page"""
        page.evaluate("""
            () => {
                // Remove existing overlay if any
                const existing = document.getElementById('scraper-overlay');
                if (existing) existing.remove();
                
                // Create overlay
                const overlay = document.createElement('div');
                overlay.id = 'scraper-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 20px;
                    border-radius: 8px;
                    z-index: 999999;
                    font-family: monospace;
                    font-size: 14px;
                    max-width: 300px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                `;
                overlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">🎬 Scraper Recorder</div>
                    <div style="margin-bottom: 15px;">
                        <div id="mode-indicator">Mode: <span style="color: #4ade80;">INTERACT</span></div>
                        <div style="font-size: 12px; color: #aaa; margin-top: 5px;">Use the page normally</div>
                    </div>
                    <div style="border-top: 1px solid #444; padding-top: 10px; margin-top: 10px;">
                        <div style="margin-bottom: 5px;"><strong>Controls:</strong></div>
                        <div style="font-size: 12px; line-height: 1.6;">
                            <div><kbd style="background: #333; padding: 2px 6px; border-radius: 3px;">E</kbd> - Extract Mode (click to mark fields)</div>
                            <div><kbd style="background: #333; padding: 2px 6px; border-radius: 3px;">I</kbd> - Interact Mode (normal browsing)</div>
                            <div><kbd style="background: #333; padding: 2px 6px; border-radius: 3px;">S</kbd> - Take Screenshot</div>
                            <div><kbd style="background: #333; padding: 2px 6px; border-radius: 3px;">Q</kbd> - Finish & Generate Config</div>
                        </div>
                    </div>
                    <div id="extracted-count" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444; font-size: 12px;">
                        Fields marked: <span style="color: #4ade80;">0</span>
                    </div>
                `;
                document.body.appendChild(overlay);
                
                // Track mode
                window.scraperMode = 'interact';
                window.extractedElements = [];
                window.shouldFinish = false;
                window.shouldScreenshot = false;
                
                // Key handlers
                document.addEventListener('keydown', (e) => {
                    if (e.key.toLowerCase() === 'e') {
                        window.scraperMode = 'extract';
                        document.getElementById('mode-indicator').innerHTML = 
                            'Mode: <span style="color: #f59e0b;">EXTRACT</span>';
                        document.querySelector('#mode-indicator + div').textContent = 
                            'Click elements to mark for extraction';
                    } else if (e.key.toLowerCase() === 'i') {
                        window.scraperMode = 'interact';
                        document.getElementById('mode-indicator').innerHTML = 
                            'Mode: <span style="color: #4ade80;">INTERACT</span>';
                        document.querySelector('#mode-indicator + div').textContent = 
                            'Use the page normally';
                    } else if (e.key.toLowerCase() === 's') {
                        window.shouldScreenshot = true;
                        document.getElementById('mode-indicator').innerHTML = 
                            'Mode: <span style="color: #06b6d4;">📸 SCREENSHOT</span>';
                        setTimeout(() => {
                            if (window.scraperMode === 'interact') {
                                document.getElementById('mode-indicator').innerHTML = 
                                    'Mode: <span style="color: #4ade80;">INTERACT</span>';
                            }
                        }, 1000);
                    } else if (e.key.toLowerCase() === 'q') {
                        window.shouldFinish = true;
                    }
                });
                
                // Click handler for extract mode
                document.addEventListener('click', (e) => {
                    if (window.scraperMode === 'extract') {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const el = e.target;
                        
                        // Generate selector
                        let selector = '';
                        if (el.id) selector = `#${el.id}`;
                        else if (el.name) selector = `[name="${el.name}"]`;
                        else if (el.className) {
                            const classes = el.className.split(' ').filter(c => c);
                            if (classes.length) selector = `.${classes[0]}`;
                        }
                        if (!selector) selector = el.tagName.toLowerCase();
                        
                        // Get text content
                        const text = el.textContent?.trim().slice(0, 100) || '';
                        const value = el.value || el.href || '';
                        
                        // Prompt for field label
                        const label = prompt(
                            'What data does this element contain?\\n\\n' +
                            'Examples:\\n' +
                            '  • case_number\\n' +
                            '  • party_name\\n' +
                            '  • date_filed\\n' +
                            '  • judge\\n' +
                            '  • status\\n' +
                            '  • pdf_link\\n\\n' +
                            'Element preview: ' + (text || value || selector).slice(0, 50),
                            (el.id || el.name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase()
                        );
                        
                        if (!label) {
                            // User cancelled
                            return;
                        }
                        
                        // Determine extraction type
                        let extractType = 'text';
                        if (el.tagName === 'A') extractType = 'href';
                        else if (el.tagName === 'IMG') extractType = 'src';
                        else if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') extractType = 'value';
                        
                        // Add to extracted
                        window.extractedElements.push({
                            label: label.trim(),
                            selector,
                            extractType,
                            tag: el.tagName.toLowerCase(),
                            text,
                            value,
                            id: el.id || '',
                            name: el.name || '',
                            classes: el.className || ''
                        });
                        
                        // Visual feedback
                        el.style.outline = '3px solid #f59e0b';
                        el.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                        
                        // Add label badge
                        const badge = document.createElement('div');
                        badge.style.cssText = `
                            position: absolute;
                            background: #f59e0b;
                            color: white;
                            padding: 2px 6px;
                            border-radius: 3px;
                            font-size: 11px;
                            font-weight: bold;
                            z-index: 999999;
                            pointer-events: none;
                        `;
                        badge.textContent = label.trim();
                        const rect = el.getBoundingClientRect();
                        badge.style.top = (rect.top + window.scrollY - 20) + 'px';
                        badge.style.left = (rect.left + window.scrollX) + 'px';
                        document.body.appendChild(badge);
                        
                        // Update counter
                        document.querySelector('#extracted-count span').textContent = 
                            window.extractedElements.length;
                    }
                }, true);
            }
        """)
    
    def record_session(self):
        """Open browser and record user interactions"""
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)
            context = browser.new_context()
            page = context.new_page()
            
            print(f"🌐 Opening {self.url}...")
            page.goto(self.url, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2000)
            
            # Inject overlay
            self.inject_overlay(page)
            
            print("\n" + "="*60)
            print("🎬 INTERACTIVE RECORDING MODE")
            print("="*60)
            print("\n📋 Instructions:")
            print("  1. Interact with the page (fill forms, click buttons)")
            print("  2. Press 'E' to enter Extract Mode")
            print("  3. Click on elements you want to capture")
            print("  4. Press 'S' to take a screenshot")
            print("  5. Press 'Q' when finished")
            print("\n" + "="*60 + "\n")
            
            screenshot_count = 0
            
            # Poll for finish signal
            while True:
                page.wait_for_timeout(500)
                
                try:
                    # Re-inject overlay if page navigated
                    overlay_exists = page.evaluate("() => !!document.getElementById('scraper-overlay')")
                    if not overlay_exists:
                        print("⚠️  Page changed, re-injecting overlay...")
                        self.inject_overlay(page)
                    
                    # Check for screenshot request
                    should_screenshot = page.evaluate("() => window.shouldScreenshot")
                    if should_screenshot:
                        screenshot_count += 1
                        screenshot_path = self.output_dir / f"screenshot_{screenshot_count}.png"
                        page.screenshot(path=screenshot_path)
                        print(f"📸 Screenshot saved: {screenshot_path}")
                        page.evaluate("() => window.shouldScreenshot = false")
                        self.screenshots.append(str(screenshot_path))
                    
                    # Check for finish signal
                    should_finish = page.evaluate("() => window.shouldFinish")
                    if should_finish:
                        break
                except Exception as e:
                    # Context destroyed, likely navigation - re-inject on next loop
                    print(f"⚠️  Context error (page may have navigated): {e}")
                    page.wait_for_timeout(1000)
            
            # Take final screenshot
            try:
                final_screenshot = self.output_dir / "final_screenshot.png"
                page.screenshot(path=final_screenshot, full_page=True)
                print(f"📸 Final screenshot: {final_screenshot}")
                self.screenshots.append(str(final_screenshot))
            except Exception as e:
                print(f"⚠️  Could not take final screenshot: {e}")
            
            # Get extracted elements
            try:
                self.extract_fields = page.evaluate("() => window.extractedElements || []")
            except Exception as e:
                print(f"⚠️  Could not retrieve extracted elements: {e}")
                self.extract_fields = []
            
            print(f"\n✅ Recorded {len(self.extract_fields)} fields to extract")
            
            browser.close()
    
    def prompt_for_metadata(self):
        """Prompt user for metadata labels after recording"""
        print("\n" + "="*60)
        print("📝 FIELD LABELING")
        print("="*60)
        print(f"\nYou marked {len(self.extract_fields)} fields.")
        print("\nFor each field, enter what data it represents:")
        print("Examples: case_number, party_name, date_filed, judge, pdf_link\n")
        
        labeled_fields = []
        for i, field in enumerate(self.extract_fields):
            preview = field.get('text') or field.get('value') or field['selector']
            preview = preview[:50]
            
            existing_label = field.get('label', '')
            if existing_label:
                print(f"\n[{i+1}/{len(self.extract_fields)}] Field: {field['selector']}")
                print(f"  Preview: {preview}")
                print(f"  Current label: {existing_label}")
                use_existing = input(f"  Keep this label? (Y/n): ").strip().lower()
                if use_existing != 'n':
                    labeled_fields.append(field)
                    continue
            
            print(f"\n[{i+1}/{len(self.extract_fields)}] Field: {field['selector']}")
            print(f"  Preview: {preview}")
            label = input(f"  Label (or 'skip' to ignore): ").strip()
            
            if label and label.lower() != 'skip':
                field['label'] = label
                labeled_fields.append(field)
            else:
                print("  ⏭️  Skipped")
        
        self.extract_fields = labeled_fields
        print(f"\n✅ Labeled {len(labeled_fields)} fields")
    
    def generate_config(self):
        """Generate Playwright config from recorded session"""
        # Build extraction config
        extraction_fields = {}
        for field in self.extract_fields:
            label = field.get('label', field.get('id') or field.get('name') or 'unknown')
            extraction_fields[label] = {
                "selector": field['selector'],
                "type": field.get('extractType', 'text'),
                "element": field['tag']
            }
        
        # Build steps (simplified for now - user will enhance in UI)
        steps = [
            {
                "type": "navigate",
                "config": {"url": self.url}
            },
            {
                "type": "wait",
                "config": {"timeout": 2000}
            }
        ]
        
        # Add extraction step
        if extraction_fields:
            steps.append({
                "type": "extract_data",
                "label": "Extract case data",
                "config": {
                    "fields": extraction_fields
                }
            })
        
        config = {
            "flow": {
                "name": f"{self.state or 'Unknown'} {self.county or ''} Scraper".strip(),
                "steps": steps
            },
            "siteConfig": {
                "siteId": f"{(self.state or 'unknown').lower()}-{(self.county or 'unknown').lower()}-{self.domain.replace('.', '-')}",
                "state": self.state,
                "county": self.county,
                "baseUrl": self.url,
                "description": f"Interactive recording from {datetime.now().isoformat()}",
                "metadata": {
                    "recordedAt": datetime.now().isoformat(),
                    "extractionFields": list(extraction_fields.keys()),
                    "screenshots": self.screenshots
                },
                "extractedFields": self.extract_fields
            }
        }
        
        # Save config
        config_path = self.output_dir / "config.json"
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
        
        print(f"\n💾 Config saved: {config_path}")
        print(f"📁 All files in: {self.output_dir}")
        
        # Print summary
        print("\n" + "="*60)
        print("📊 EXTRACTION SUMMARY")
        print("="*60)
        for label, info in extraction_fields.items():
            print(f"  • {label}: {info['selector']} ({info['type']})")
        
        return config


def main():
    parser = argparse.ArgumentParser(description="Interactive Visual Scraper Recorder")
    parser.add_argument("--url", required=True, help="URL to record")
    parser.add_argument("--state", help="State code (e.g. GA)")
    parser.add_argument("--county", help="County name (e.g. Cobb)")
    args = parser.parse_args()
    
    recorder = InteractiveRecorder(args.url, args.state, args.county)
    recorder.record_session()
    recorder.prompt_for_metadata()
    recorder.generate_config()
    
    print("\n✅ Recording complete!")
    print("🚀 Next: Use the Scraper Builder UI to refine and save to database")


if __name__ == "__main__":
    main()
