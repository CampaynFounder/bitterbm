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
                    max-width: 320px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                `;
                overlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">🎬 Scraper Recorder</div>
                    <div style="margin-bottom: 15px;">
                        <div id="mode-indicator">Mode: <span style="color: #4ade80;">INTERACT</span></div>
                        <div style="font-size: 12px; color: #aaa; margin-top: 5px;" id="mode-help">Use the page normally</div>
                    </div>
                    <div style="border-top: 1px solid #444; padding-top: 10px; margin-top: 10px; margin-bottom: 10px;">
                        <button id="btn-extract" style="width: 100%; padding: 8px; margin-bottom: 5px; background: #f59e0b; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">📍 Extract Mode (E)</button>
                        <button id="btn-interact" style="width: 100%; padding: 8px; margin-bottom: 5px; background: #4ade80; border: none; border-radius: 4px; color: black; font-weight: bold; cursor: pointer;">👆 Interact Mode (I)</button>
                        <button id="btn-clear" style="width: 100%; padding: 8px; margin-bottom: 5px; background: #8b5cf6; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">🧹 Clear Modals</button>
                        <button id="btn-screenshot" style="width: 100%; padding: 8px; margin-bottom: 5px; background: #06b6d4; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">📸 Screenshot (S)</button>
                        <button id="btn-finish" style="width: 100%; padding: 8px; background: #ef4444; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">✅ Finish (Q)</button>
                    </div>
                    <div id="extracted-count" style="padding-top: 10px; border-top: 1px solid #444; font-size: 12px;">
                        Fields marked: <span style="color: #4ade80;">0</span>
                    </div>
                `;
                document.body.appendChild(overlay);
                
                // Track mode
                window.scraperMode = 'interact';
                window.extractedElements = [];
                window.shouldFinish = false;
                window.shouldScreenshot = false;
                
                // Helper to update UI
                const setMode = (mode, color, text) => {
                    window.scraperMode = mode;
                    document.getElementById('mode-indicator').innerHTML = `Mode: <span style="color: ${color};">${text}</span>`;
                    document.getElementById('mode-help').textContent = mode === 'extract' ? 'Click elements to mark for extraction' : 'Use the page normally';
                };
                
                // Button handlers
                document.getElementById('btn-extract').addEventListener('click', (e) => {
                    e.stopPropagation();
                    setMode('extract', '#f59e0b', 'EXTRACT');
                    console.log('Mode: EXTRACT');
                });
                
                document.getElementById('btn-interact').addEventListener('click', (e) => {
                    e.stopPropagation();
                    setMode('interact', '#4ade80', 'INTERACT');
                    console.log('Mode: INTERACT');
                });
                
                document.getElementById('btn-clear').addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Force remove all modals and backdrops
                    const modal = document.getElementById('scraper-label-modal');
                    if (modal) {
                        modal.remove();
                        console.log('Cleared modal');
                    }
                    // Also remove any orphaned modals
                    document.querySelectorAll('[id^="scraper-label-modal"]').forEach(m => m.remove());
                });
                
                document.getElementById('btn-screenshot').addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.shouldScreenshot = true;
                    console.log('Screenshot requested');
                });
                
                document.getElementById('btn-finish').addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.shouldFinish = true;
                    console.log('Finish requested');
                });
                
                // Key handlers (backup method)
                document.addEventListener('keydown', (e) => {
                    console.log('Key pressed:', e.key);
                    if (e.key.toLowerCase() === 'e') {
                        setMode('extract', '#f59e0b', 'EXTRACT');
                    } else if (e.key.toLowerCase() === 'i') {
                        setMode('interact', '#4ade80', 'INTERACT');
                    } else if (e.key.toLowerCase() === 's') {
                        window.shouldScreenshot = true;
                    } else if (e.key.toLowerCase() === 'q') {
                        window.shouldFinish = true;
                    }
                }, true);
                
                // Click handler for extract mode
                document.addEventListener('click', (e) => {
                    console.log('Click detected, mode:', window.scraperMode);
                    if (window.scraperMode === 'extract') {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const el = e.target;
                        
                        // Skip if clicking overlay buttons
                        if (el.id && el.id.startsWith('btn-')) return;
                        if (el.closest('#scraper-overlay')) return;
                        
                        console.log('Extracting from element:', el);
                        
                        // Generate selector
                        let selector = '';
                        if (el.id) selector = `#${el.id}`;
                        else if (el.name) selector = `[name="${el.name}"]`;
                        else if (el.className && typeof el.className === 'string') {
                            const classes = el.className.split(' ').filter(c => c);
                            if (classes.length) selector = `.${classes[0]}`;
                        }
                        if (!selector) selector = el.tagName.toLowerCase();
                        
                        console.log('Generated selector:', selector);
                        
                        // Get text content
                        const text = el.textContent?.trim().slice(0, 100) || '';
                        const value = el.value || el.href || '';
                        
                        console.log('Element text:', text, 'value:', value);
                        
                        // Create custom input modal
                        const modal = document.createElement('div');
                        modal.id = 'scraper-label-modal';
                        modal.style.cssText = `
                            position: fixed;
                            top: 0;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background: rgba(0, 0, 0, 0.8);
                            z-index: 9999999;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        `;
                        
                        const suggestedLabel = (el.id || el.name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        const preview = (text || value || selector).slice(0, 50);
                        
                        modal.innerHTML = `
                            <div style="background: white; padding: 30px; border-radius: 12px; max-width: 500px; width: 90%;">
                                <h3 style="margin: 0 0 15px 0; color: #333;">Label this field</h3>
                                <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 13px; color: #666;">
                                    Preview: ${preview}
                                </div>
                                <div style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 5px; color: #666; font-size: 13px;">Field name (e.g., case_number, party_name, judge):</label>
                                    <input 
                                        id="field-label-input" 
                                        type="text" 
                                        value="${suggestedLabel}"
                                        style="width: 100%; padding: 10px; border: 2px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;"
                                    />
                                </div>
                                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                                    <button id="modal-cancel" style="padding: 10px 20px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
                                    <button id="modal-submit" style="padding: 10px 20px; border: none; background: #f59e0b; color: white; border-radius: 4px; cursor: pointer; font-weight: bold;">Add Field</button>
                                </div>
                            </div>
                        `;
                        
                        document.body.appendChild(modal);
                        
                        const input = document.getElementById('field-label-input');
                        input.focus();
                        input.select();
                        
                        const submitHandler = () => {
                            const label = input.value.trim();
                            console.log('User entered label:', label);
                            
                            // Force remove modal immediately
                            const modalEl = document.getElementById('scraper-label-modal');
                            if (modalEl) {
                                modalEl.style.display = 'none';
                                modalEl.remove();
                            }
                            
                            if (!label) {
                                console.log('No label provided');
                                return;
                            }
                            
                            // Determine extraction type
                            let extractType = 'text';
                            if (el.tagName === 'A') extractType = 'href';
                            else if (el.tagName === 'IMG') extractType = 'src';
                            else if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') extractType = 'value';
                            
                            // Add to extracted
                            const fieldData = {
                                label: label,
                                selector,
                                extractType,
                                tag: el.tagName.toLowerCase(),
                                text,
                                value,
                                id: el.id || '',
                                name: el.name || '',
                                classes: el.className || ''
                            };
                            
                            window.extractedElements.push(fieldData);
                            console.log('Added field:', fieldData);
                            console.log('Total fields:', window.extractedElements.length);
                            
                            // Visual feedback
                            el.style.outline = '3px solid #f59e0b';
                            el.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                            
                            // Add label badge
                            const badge = document.createElement('div');
                            badge.className = 'scraper-badge';
                            badge.style.cssText = `
                                position: absolute;
                                background: #f59e0b;
                                color: white;
                                padding: 4px 8px;
                                border-radius: 4px;
                                font-size: 11px;
                                font-weight: bold;
                                z-index: 999998;
                                pointer-events: none;
                            `;
                            badge.textContent = label;
                            const rect = el.getBoundingClientRect();
                            badge.style.top = (rect.top + window.scrollY - 25) + 'px';
                            badge.style.left = (rect.left + window.scrollX) + 'px';
                            document.body.appendChild(badge);
                            
                            // Update counter
                            const counterSpan = document.querySelector('#extracted-count span');
                            if (counterSpan) {
                                counterSpan.textContent = window.extractedElements.length;
                            }
                        };
                        
                        document.getElementById('modal-submit').addEventListener('click', submitHandler);
                        document.getElementById('modal-cancel').addEventListener('click', () => {
                            console.log('User cancelled');
                            const modalEl = document.getElementById('scraper-label-modal');
                            if (modalEl) {
                                modalEl.style.display = 'none';
                                modalEl.remove();
                            }
                        });
                        
                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                submitHandler();
                            } else if (e.key === 'Escape') {
                                const modalEl = document.getElementById('scraper-label-modal');
                                if (modalEl) {
                                    modalEl.style.display = 'none';
                                    modalEl.remove();
                                }
                            }
                        });
                    }
                }, true);
                
                console.log('Scraper overlay injected successfully');
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
            print("💉 Injecting overlay...")
            self.inject_overlay(page)
            
            # Verify overlay exists
            overlay_check = page.evaluate("() => !!document.getElementById('scraper-overlay')")
            if overlay_check:
                print("✅ Overlay injected successfully - check top-right corner of browser")
            else:
                print("❌ WARNING: Overlay failed to inject!")
            
            # Test that globals are set
            mode_check = page.evaluate("() => window.scraperMode")
            print(f"🔧 Initial mode: {mode_check}")
            
            print("\n" + "="*60)
            print("🎬 INTERACTIVE RECORDING MODE")
            print("="*60)
            print("\n📋 Step-by-step:")
            print("  1. Look at the TOP-RIGHT of the browser window")
            print("  2. You should see a black box with buttons")
            print("  3. Click the ORANGE '📍 Extract Mode' button")
            print("  4. The mode should change to 'EXTRACT' (orange)")
            print("  5. NOW click any element on the page")
            print("  6. A popup will ask for a label - type something like 'test'")
            print("  7. Click '📸 Screenshot' button when ready")
            print("  8. Click '✅ Finish' button to complete")
            print("\n  ⚠️  If you don't see the overlay, the page may have CSP restrictions")
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
                # Close any open modals first
                page.evaluate("""
                    () => {
                        const modal = document.getElementById('scraper-label-modal');
                        if (modal) modal.remove();
                    }
                """)
                
                final_screenshot = self.output_dir / "final_screenshot.png"
                page.screenshot(path=final_screenshot, full_page=True)
                print(f"📸 Final screenshot: {final_screenshot}")
                self.screenshots.append(str(final_screenshot))
            except Exception as e:
                print(f"⚠️  Could not take final screenshot: {e}")
            
            # Get extracted elements
            try:
                self.extract_fields = page.evaluate("() => window.extractedElements || []")
                print(f"\n✅ Recorded {len(self.extract_fields)} fields to extract")
                
                # Show what was captured
                if self.extract_fields:
                    print("\n📋 Captured fields:")
                    for i, field in enumerate(self.extract_fields, 1):
                        label = field.get('label', 'unknown')
                        selector = field.get('selector', 'unknown')
                        print(f"  {i}. {label} → {selector}")
                else:
                    print("\n⚠️  No fields were captured!")
                    print("💡 Did you click the '📍 Extract Mode' button before clicking elements?")
                    
            except Exception as e:
                print(f"⚠️  Could not retrieve extracted elements: {e}")
                self.extract_fields = []
            
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
