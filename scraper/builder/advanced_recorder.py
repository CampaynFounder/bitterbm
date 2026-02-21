"""
Enhanced Interactive Scraper Recorder with Table & Conditional Logic

Supports:
- Basic field extraction
- Table row filtering with conditions
- Nested table checks
- Conditional actions (click if conditions met)
- PDF download rules based on table content
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


class AdvancedRecorder:
    def __init__(self, url, state=None, county=None):
        self.url = url
        self.state = state
        self.county = county
        self.extract_fields = []
        self.table_configs = []
        self.conditional_actions = []
        self.screenshots = []
        
        parsed = urlparse(url)
        self.domain = parsed.netloc.replace("www.", "") or "unknown"
        self.output_dir = Path(f"scraper/builder/sites/{self.domain}")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    def inject_overlay(self, page):
        """Inject advanced overlay with table and conditional support"""
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
                    font-size: 12px;
                    max-width: 400px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                `;
                
                overlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 15px; font-size: 16px;">🎬 Advanced Recorder</div>
                    
                    <!-- Mode Selection -->
                    <div style="margin-bottom: 10px;">
                        <select id="mode-select" style="width: 100%; padding: 8px; border-radius: 4px; border: none; font-size: 12px; font-weight: bold;">
                            <option value="extract">📍 Extract Field</option>
                            <option value="table">📊 Define Table</option>
                            <option value="condition">⚡ Add Condition</option>
                            <option value="interact">👆 Interact</option>
                        </select>
                    </div>
                    
                    <!-- Extract Field Form -->
                    <div id="extract-form" style="display: none; padding: 10px; background: rgba(245, 158, 11, 0.2); border-radius: 4px; margin-bottom: 10px;">
                        <div style="font-size: 11px; margin-bottom: 5px;">Field label:</div>
                        <input id="field-label" type="text" style="width: 100%; padding: 5px; margin-bottom: 5px; border: none; border-radius: 3px; font-size: 12px; box-sizing: border-box;" placeholder="e.g., case_number" />
                        <button id="field-submit" style="width: 48%; padding: 6px; background: #f59e0b; border: none; border-radius: 3px; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Add</button>
                        <button id="field-cancel" style="width: 48%; padding: 6px; background: #666; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px; margin-left: 4%;">Cancel</button>
                    </div>
                    
                    <!-- Table Config Form -->
                    <div id="table-form" style="display: none; padding: 10px; background: rgba(59, 130, 246, 0.2); border-radius: 4px; margin-bottom: 10px;">
                        <div style="font-size: 11px; font-weight: bold; margin-bottom: 8px;">Table Configuration</div>
                        <input id="table-selector" type="text" style="width: 100%; padding: 5px; margin-bottom: 5px; border: none; border-radius: 3px; font-size: 11px; box-sizing: border-box;" placeholder="Table selector (e.g., table#results)" />
                        <input id="row-selector" type="text" style="width: 100%; padding: 5px; margin-bottom: 5px; border: none; border-radius: 3px; font-size: 11px; box-sizing: border-box;" placeholder="Row selector (e.g., tbody tr)" />
                        
                        <div style="font-size: 10px; margin: 8px 0 3px 0;">Filter Conditions:</div>
                        <textarea id="table-filters" style="width: 100%; padding: 5px; border: none; border-radius: 3px; font-size: 10px; box-sizing: border-box; font-family: monospace;" rows="3" placeholder='[{"column": 2, "operator": "equals", "value": "Active"}]'></textarea>
                        
                        <div style="font-size: 10px; margin: 8px 0 3px 0;">Extract Columns:</div>
                        <input id="extract-columns" type="text" style="width: 100%; padding: 5px; margin-bottom: 5px; border: none; border-radius: 3px; font-size: 11px; box-sizing: border-box;" placeholder="e.g., 1,3,5 or case_number:1,date:3" />
                        
                        <button id="table-submit" style="width: 48%; padding: 6px; background: #3b82f6; border: none; border-radius: 3px; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Save</button>
                        <button id="table-cancel" style="width: 48%; padding: 6px; background: #666; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px; margin-left: 4%;">Cancel</button>
                    </div>
                    
                    <!-- Conditional Action Form -->
                    <div id="condition-form" style="display: none; padding: 10px; background: rgba(168, 85, 247, 0.2); border-radius: 4px; margin-bottom: 10px;">
                        <div style="font-size: 11px; font-weight: bold; margin-bottom: 8px;">Conditional Action</div>
                        
                        <select id="action-type" style="width: 100%; padding: 5px; margin-bottom: 5px; border: none; border-radius: 3px; font-size: 11px;">
                            <option value="click">Click Element</option>
                            <option value="extract_pdf">Extract PDF</option>
                            <option value="expand_row">Expand Row</option>
                        </select>
                        
                        <input id="action-selector" type="text" style="width: 100%; padding: 5px; margin-bottom: 5px; border: none; border-radius: 3px; font-size: 11px; box-sizing: border-box;" placeholder="Element selector" />
                        
                        <div style="font-size: 10px; margin: 8px 0 3px 0;">Conditions (JSON):</div>
                        <textarea id="action-conditions" style="width: 100%; padding: 5px; border: none; border-radius: 3px; font-size: 10px; box-sizing: border-box; font-family: monospace;" rows="4" placeholder='[{"type": "cell_equals", "column": 2, "value": "N"}]'></textarea>
                        
                        <button id="condition-submit" style="width: 48%; padding: 6px; background: #a855f7; border: none; border-radius: 3px; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Save</button>
                        <button id="condition-cancel" style="width: 48%; padding: 6px; background: #666; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px; margin-left: 4%;">Cancel</button>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div style="margin-bottom: 10px;">
                        <button id="btn-screenshot" style="width: 100%; padding: 10px; margin-bottom: 5px; background: #06b6d4; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">📸 Screenshot</button>
                        <button id="btn-finish" style="width: 100%; padding: 10px; background: #ef4444; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">✅ Finish</button>
                    </div>
                    
                    <!-- Stats -->
                    <div style="padding-top: 10px; border-top: 1px solid #444; font-size: 11px;">
                        <div>Fields: <span id="field-count" style="color: #4ade80; font-weight: bold;">0</span></div>
                        <div>Tables: <span id="table-count" style="color: #3b82f6; font-weight: bold;">0</span></div>
                        <div>Conditions: <span id="condition-count" style="color: #a855f7; font-weight: bold;">0</span></div>
                    </div>
                `;
                
                document.body.appendChild(overlay);
                
                // Initialize state
                window.scraperData = {
                    fields: [],
                    tables: [],
                    conditions: [],
                    pendingElement: null
                };
                window.shouldFinish = false;
                window.shouldScreenshot = false;
                
                const updateCounts = () => {
                    document.getElementById('field-count').textContent = window.scraperData.fields.length;
                    document.getElementById('table-count').textContent = window.scraperData.tables.length;
                    document.getElementById('condition-count').textContent = window.scraperData.conditions.length;
                };
                
                // Mode selection handler
                const modeSelect = document.getElementById('mode-select');
                const forms = {
                    extract: document.getElementById('extract-form'),
                    table: document.getElementById('table-form'),
                    condition: document.getElementById('condition-form')
                };
                
                const showForm = (mode) => {
                    Object.values(forms).forEach(f => f.style.display = 'none');
                    if (forms[mode]) forms[mode].style.display = 'block';
                };
                
                modeSelect.onchange = () => showForm(modeSelect.value);
                
                // Extract field handlers
                document.getElementById('field-submit').onclick = () => {
                    const label = document.getElementById('field-label').value.trim();
                    if (!label || !window.scraperData.pendingElement) {
                        forms.extract.style.display = 'none';
                        return;
                    }
                    
                    const el = window.scraperData.pendingElement;
                    el.label = label;
                    window.scraperData.fields.push(el);
                    
                    el.element.style.outline = '3px solid #f59e0b';
                    el.element.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                    
                    updateCounts();
                    forms.extract.style.display = 'none';
                    window.scraperData.pendingElement = null;
                };
                
                document.getElementById('field-cancel').onclick = () => {
                    forms.extract.style.display = 'none';
                    window.scraperData.pendingElement = null;
                };
                
                // Table config handlers
                document.getElementById('table-submit').onclick = () => {
                    try {
                        const tableSelector = document.getElementById('table-selector').value.trim();
                        const rowSelector = document.getElementById('row-selector').value.trim();
                        const filtersText = document.getElementById('table-filters').value.trim();
                        const extractCols = document.getElementById('extract-columns').value.trim();
                        
                        if (!tableSelector || !rowSelector) {
                            alert('Table and row selectors are required');
                            return;
                        }
                        
                        const filters = filtersText ? JSON.parse(filtersText) : [];
                        
                        window.scraperData.tables.push({
                            tableSelector,
                            rowSelector,
                            filters,
                            extractColumns: extractCols
                        });
                        
                        updateCounts();
                        forms.table.style.display = 'none';
                        
                        // Clear form
                        document.getElementById('table-selector').value = '';
                        document.getElementById('row-selector').value = '';
                        document.getElementById('table-filters').value = '';
                        document.getElementById('extract-columns').value = '';
                    } catch (e) {
                        alert('Invalid JSON in filters: ' + e.message);
                    }
                };
                
                document.getElementById('table-cancel').onclick = () => {
                    forms.table.style.display = 'none';
                };
                
                // Conditional action handlers
                document.getElementById('condition-submit').onclick = () => {
                    try {
                        const actionType = document.getElementById('action-type').value;
                        const selector = document.getElementById('action-selector').value.trim();
                        const conditionsText = document.getElementById('action-conditions').value.trim();
                        
                        if (!selector) {
                            alert('Element selector is required');
                            return;
                        }
                        
                        const conditions = conditionsText ? JSON.parse(conditionsText) : [];
                        
                        window.scraperData.conditions.push({
                            action: actionType,
                            selector,
                            conditions
                        });
                        
                        updateCounts();
                        forms.condition.style.display = 'none';
                        
                        // Clear form
                        document.getElementById('action-selector').value = '';
                        document.getElementById('action-conditions').value = '';
                    } catch (e) {
                        alert('Invalid JSON in conditions: ' + e.message);
                    }
                };
                
                document.getElementById('condition-cancel').onclick = () => {
                    forms.condition.style.display = 'none';
                };
                
                // Screenshot & Finish
                document.getElementById('btn-screenshot').onclick = () => window.shouldScreenshot = true;
                document.getElementById('btn-finish').onclick = () => window.shouldFinish = true;
                
                // Click handler for extract mode
                document.addEventListener('click', (e) => {
                    if (modeSelect.value !== 'extract') return;
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
                    
                    window.scraperData.pendingElement = {
                        selector,
                        extractType,
                        tag: el.tagName.toLowerCase(),
                        text,
                        value,
                        element: el
                    };
                    
                    document.getElementById('field-label').value = suggestedLabel;
                    forms.extract.style.display = 'block';
                    document.getElementById('field-label').focus();
                    document.getElementById('field-label').select();
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
            print("✅ Advanced overlay ready!\n")
            print("="*70)
            print("MODES:")
            print("  📍 Extract Field - Click elements to capture")
            print("  📊 Define Table - Configure table extraction with filters")
            print("  ⚡ Add Condition - Define conditional actions (click if, extract if)")
            print("  👆 Interact - Normal browsing")
            print("\nTABLE FILTERS:")
            print('  {"column": 2, "operator": "equals", "value": "Active"}')
            print('  {"column": 3, "operator": "in", "value": ["A", "B"]}')
            print('  {"column": 1, "operator": "exists"}')
            print("\nCONDITIONS:")
            print('  {"type": "cell_equals", "column": 2, "value": "N"}')
            print('  {"type": "cell_contains", "column": 3, "value": "ORDER"}')
            print("="*70 + "\n")
            
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
                        print(f"📸 Screenshot {screenshot_count}")
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
                self.screenshots.append(str(final))
            except:
                pass
            
            try:
                data = page.evaluate("() => window.scraperData || {fields: [], tables: [], conditions: []}")
                self.extract_fields = data.get('fields', [])
                self.table_configs = data.get('tables', [])
                self.conditional_actions = data.get('conditions', [])
                
                print(f"\n✅ Captured:")
                print(f"   {len(self.extract_fields)} fields")
                print(f"   {len(self.table_configs)} tables")
                print(f"   {len(self.conditional_actions)} conditions")
            except:
                pass
            
            browser.close()
    
    def generate_config(self):
        """Generate advanced config with table and conditional support"""
        steps = [
            {"type": "navigate", "config": {"url": self.url}},
            {"type": "wait", "config": {"timeout": 2000}}
        ]
        
        # Add basic field extractions
        if self.extract_fields:
            fields = {}
            for f in self.extract_fields:
                label = f.get('label', 'unknown')
                fields[label] = {
                    "selector": f['selector'],
                    "type": f.get('extractType', 'text')
                }
            steps.append({"type": "extract_fields", "config": {"fields": fields}})
        
        # Add table extractions
        for table in self.table_configs:
            steps.append({
                "type": "extract_table",
                "config": {
                    "tableSelector": table['tableSelector'],
                    "rowSelector": table['rowSelector'],
                    "filters": table.get('filters', []),
                    "extractColumns": table.get('extractColumns', '')
                }
            })
        
        # Add conditional actions
        for cond in self.conditional_actions:
            steps.append({
                "type": "conditional_action",
                "config": {
                    "action": cond['action'],
                    "selector": cond['selector'],
                    "conditions": cond.get('conditions', [])
                }
            })
        
        config = {
            "flow": {
                "name": f"{self.state or 'Unknown'} {self.county or ''} Advanced Scraper".strip(),
                "steps": steps
            },
            "siteConfig": {
                "siteId": f"{(self.state or 'unknown').lower()}-{(self.county or 'unknown').lower()}-{self.domain.replace('.', '-')}",
                "state": self.state,
                "county": self.county,
                "baseUrl": self.url,
                "metadata": {
                    "recordedAt": datetime.now().isoformat(),
                    "fieldCount": len(self.extract_fields),
                    "tableCount": len(self.table_configs),
                    "conditionCount": len(self.conditional_actions),
                    "screenshots": self.screenshots
                }
            }
        }
        
        path = self.output_dir / "config_advanced.json"
        with open(path, "w") as f:
            json.dump(config, f, indent=2)
        
        print(f"\n💾 Config: {path}")
        print(f"📁 Files: {self.output_dir}")
        return config


def main():
    parser = argparse.ArgumentParser(description="Advanced Interactive Scraper Recorder")
    parser.add_argument("--url", required=True)
    parser.add_argument("--state", help="State code")
    parser.add_argument("--county", help="County name")
    args = parser.parse_args()
    
    recorder = AdvancedRecorder(args.url, args.state, args.county)
    recorder.record_session()
    recorder.generate_config()
    print("\n✅ Done!")


if __name__ == "__main__":
    main()
