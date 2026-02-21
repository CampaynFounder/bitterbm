"""
Session-Based Scraper Recorder

Records your entire navigation path, then lets you add conditional logic.

Workflow:
1. Start Recording → Interact with site (login, navigate, search)
2. Mark extraction points (click elements to extract)
3. Stop Recording → Review & add conditions
4. Export config
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


class SessionRecorder:
    def __init__(self, url, state=None, county=None):
        self.url = url
        self.state = state
        self.county = county
        self.recording = False
        self.actions = []
        self.extraction_points = []
        self.loops = []
        self.conditions = []
        self.screenshots = []
        
        parsed = urlparse(url)
        self.domain = parsed.netloc.replace("www.", "") or "unknown"
        self.output_dir = Path(f"scraper/builder/sites/{self.domain}")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
    def inject_recorder_overlay(self, page):
        """Inject recording overlay"""
        page.evaluate("""
            () => {
                if (document.getElementById('recorder-overlay')) return;
                
                const overlay = document.createElement('div');
                overlay.id = 'recorder-overlay';
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
                    max-width: 350px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                `;
                
                overlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 15px; font-size: 16px;">
                        🎥 Session Recorder
                    </div>
                    
                    <div id="status-display" style="padding: 10px; background: rgba(239, 68, 68, 0.3); border-radius: 4px; margin-bottom: 15px;">
                        <div style="font-weight: bold; color: #ef4444;">⏸️ PAUSED</div>
                        <div style="font-size: 11px; margin-top: 3px;">Click Start to begin</div>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <button id="btn-record" style="width: 100%; padding: 10px; background: #22c55e; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; margin-bottom: 5px;">
                            ▶️ Start Recording
                        </button>
                        <button id="btn-mark" disabled style="width: 100%; padding: 10px; background: #666; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: not-allowed; margin-bottom: 5px;">
                            📍 Mark Extraction
                        </button>
                        <button id="btn-loop" disabled style="width: 100%; padding: 10px; background: #666; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: not-allowed; margin-bottom: 5px;">
                            🔄 Define Loop
                        </button>
                        <button id="btn-condition" disabled style="width: 100%; padding: 10px; background: #666; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: not-allowed; margin-bottom: 5px;">
                            ⚡ Add Condition
                        </button>
                        <button id="btn-screenshot" style="width: 100%; padding: 10px; background: #06b6d4; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer; margin-bottom: 5px;">
                            📸 Screenshot
                        </button>
                        <button id="btn-stop" disabled style="width: 100%; padding: 10px; background: #666; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: not-allowed;">
                            ⏹️ Stop & Review
                        </button>
                    </div>
                    
                    <div style="border-top: 1px solid #444; padding-top: 10px; font-size: 12px;">
                        <div>Actions: <span id="action-count" style="color: #4ade80; font-weight: bold;">0</span></div>
                        <div>Extractions: <span id="extract-count" style="color: #f59e0b; font-weight: bold;">0</span></div>
                        <div>Loops: <span id="loop-count" style="color: #3b82f6; font-weight: bold;">0</span></div>
                        <div>Conditions: <span id="condition-count" style="color: #a855f7; font-weight: bold;">0</span></div>
                    </div>
                    
                    <div id="mark-form" style="display: none; margin-top: 15px; padding: 10px; background: rgba(245, 158, 11, 0.2); border-radius: 4px;">
                        <div style="font-size: 11px; margin-bottom: 5px;">Label this extraction:</div>
                        <input id="extract-label" type="text" style="width: 100%; padding: 5px; margin-bottom: 5px; border: none; border-radius: 3px; font-size: 12px; box-sizing: border-box;" />
                        <button id="extract-save" style="width: 48%; padding: 6px; background: #f59e0b; border: none; border-radius: 3px; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Save</button>
                        <button id="extract-cancel" style="width: 48%; padding: 6px; background: #666; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px; margin-left: 4%;">Cancel</button>
                    </div>
                    
                    <div id="loop-form" style="display: none; margin-top: 15px; padding: 10px; background: rgba(59, 130, 246, 0.2); border-radius: 4px;">
                        <div style="font-size: 11px; font-weight: bold; margin-bottom: 8px;">🔄 Loop Configuration</div>
                        <div style="font-size: 10px; margin-bottom: 5px;">Click on table or list to loop through:</div>
                        <input id="loop-selector" readonly type="text" style="width: 100%; padding: 5px; margin-bottom: 5px; background: #333; color: #fff; border: none; border-radius: 3px; font-size: 11px; box-sizing: border-box;" placeholder="Click a table or list..." />
                        <div style="font-size: 10px; margin-bottom: 5px;">Row selector:</div>
                        <input id="loop-row-selector" type="text" value="tbody tr" style="width: 100%; padding: 5px; margin-bottom: 8px; border: none; border-radius: 3px; font-size: 11px; box-sizing: border-box;" />
                        <button id="loop-save" style="width: 48%; padding: 6px; background: #3b82f6; border: none; border-radius: 3px; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Save Loop</button>
                        <button id="loop-cancel" style="width: 48%; padding: 6px; background: #666; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px; margin-left: 4%;">Cancel</button>
                    </div>
                    
                    <div id="condition-form" style="display: none; margin-top: 15px; padding: 10px; background: rgba(168, 85, 247, 0.2); border-radius: 4px; max-height: 200px; overflow-y: auto;">
                        <div style="font-size: 11px; font-weight: bold; margin-bottom: 8px;">⚡ Extraction Condition</div>
                        <div style="font-size: 10px; margin-bottom: 5px;">Add filter (AND logic):</div>
                        <div style="display: flex; gap: 3px; margin-bottom: 5px;">
                            <input id="cond-col" type="number" min="1" placeholder="Col" style="width: 20%; padding: 5px; border: none; border-radius: 3px; font-size: 11px;" />
                            <select id="cond-op" style="width: 30%; padding: 5px; border: none; border-radius: 3px; font-size: 11px;">
                                <option value="equals">Equals</option>
                                <option value="contains">Contains</option>
                                <option value="in">In</option>
                                <option value="all_in">All In</option>
                                <option value="exists">Exists</option>
                                <option value="not_exists">Not Exists</option>
                            </select>
                            <input id="cond-val" type="text" placeholder="Value" style="width: 40%; padding: 5px; border: none; border-radius: 3px; font-size: 11px;" />
                            <button id="add-cond" style="width: 10%; padding: 5px; background: #22c55e; border: none; border-radius: 3px; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">+</button>
                        </div>
                        <div id="cond-list" style="font-size: 10px; margin-bottom: 8px; max-height: 60px; overflow-y: auto;"></div>
                        <button id="cond-save" style="width: 48%; padding: 6px; background: #a855f7; border: none; border-radius: 3px; color: white; font-weight: bold; cursor: pointer; font-size: 11px;">Save Conditions</button>
                        <button id="cond-cancel" style="width: 48%; padding: 6px; background: #666; border: none; border-radius: 3px; color: white; cursor: pointer; font-size: 11px; margin-left: 4%;">Cancel</button>
                    </div>
                `;
                
                document.body.appendChild(overlay);
                
                // State
                window.recorderState = {
                    recording: false,
                    marking: false,
                    looping: false,
                    conditioning: false,
                    actions: [],
                    extractions: [],
                    loops: [],
                    conditions: [],
                    pendingExtraction: null,
                    currentConditions: []
                };
                window.shouldFinish = false;
                window.shouldScreenshot = false;
                
                const updateStatus = (recording) => {
                    const status = document.getElementById('status-display');
                    const btnRecord = document.getElementById('btn-record');
                    const btnMark = document.getElementById('btn-mark');
                    const btnLoop = document.getElementById('btn-loop');
                    const btnCondition = document.getElementById('btn-condition');
                    const btnStop = document.getElementById('btn-stop');
                    
                    if (recording) {
                        status.innerHTML = '<div style="font-weight: bold; color: #22c55e;">🔴 RECORDING</div><div style="font-size: 11px; margin-top: 3px;">All interactions are being captured</div>';
                        status.style.background = 'rgba(34, 197, 94, 0.3)';
                        btnRecord.disabled = true;
                        btnRecord.style.background = '#666';
                        btnRecord.style.cursor = 'not-allowed';
                        btnMark.disabled = false;
                        btnMark.style.background = '#f59e0b';
                        btnMark.style.cursor = 'pointer';
                        btnLoop.disabled = false;
                        btnLoop.style.background = '#3b82f6';
                        btnLoop.style.cursor = 'pointer';
                        btnCondition.disabled = false;
                        btnCondition.style.background = '#a855f7';
                        btnCondition.style.cursor = 'pointer';
                        btnStop.disabled = false;
                        btnStop.style.background = '#ef4444';
                        btnStop.style.cursor = 'pointer';
                    } else {
                        status.innerHTML = '<div style="font-weight: bold; color: #ef4444;">⏸️ PAUSED</div><div style="font-size: 11px; margin-top: 3px;">Click Start to begin</div>';
                        status.style.background = 'rgba(239, 68, 68, 0.3)';
                        btnRecord.disabled = false;
                        btnRecord.style.background = '#22c55e';
                        btnRecord.style.cursor = 'pointer';
                        btnMark.disabled = true;
                        btnMark.style.background = '#666';
                        btnMark.style.cursor = 'not-allowed';
                        btnLoop.disabled = true;
                        btnLoop.style.background = '#666';
                        btnLoop.style.cursor = 'not-allowed';
                        btnCondition.disabled = true;
                        btnCondition.style.background = '#666';
                        btnCondition.style.cursor = 'not-allowed';
                    }
                };
                
                const updateCounts = () => {
                    document.getElementById('action-count').textContent = window.recorderState.actions.length;
                    document.getElementById('extract-count').textContent = window.recorderState.extractions.length;
                    document.getElementById('loop-count').textContent = window.recorderState.loops.length;
                    document.getElementById('condition-count').textContent = window.recorderState.conditions.length;
                };
                
                // Start/Stop recording
                document.getElementById('btn-record').onclick = () => {
                    window.recorderState.recording = true;
                    updateStatus(true);
                    console.log('Recording started');
                };
                
                document.getElementById('btn-stop').onclick = () => {
                    window.recorderState.recording = false;
                    window.shouldFinish = true;
                    updateStatus(false);
                    console.log('Recording stopped');
                };
                
                document.getElementById('btn-screenshot').onclick = () => {
                    window.shouldScreenshot = true;
                };
                
                // Mark extraction
                document.getElementById('btn-mark').onclick = () => {
                    window.recorderState.marking = true;
                    alert('Click on an element to mark it for extraction');
                };
                
                document.getElementById('extract-save').onclick = () => {
                    const label = document.getElementById('extract-label').value.trim();
                    if (label && window.recorderState.pendingExtraction) {
                        window.recorderState.pendingExtraction.label = label;
                        window.recorderState.extractions.push(window.recorderState.pendingExtraction);
                        
                        window.recorderState.pendingExtraction.element.style.outline = '3px solid #f59e0b';
                        window.recorderState.pendingExtraction.element.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
                        
                        updateCounts();
                    }
                    document.getElementById('mark-form').style.display = 'none';
                    window.recorderState.marking = false;
                    window.recorderState.pendingExtraction = null;
                };
                
                document.getElementById('extract-cancel').onclick = () => {
                    document.getElementById('mark-form').style.display = 'none';
                    window.recorderState.marking = false;
                    window.recorderState.pendingExtraction = null;
                };
                
                // Loop definition
                document.getElementById('btn-loop').onclick = () => {
                    window.recorderState.looping = true;
                    document.getElementById('loop-form').style.display = 'block';
                    alert('Click on a table or list element to define the loop');
                };
                
                document.getElementById('loop-save').onclick = () => {
                    const loopSelector = document.getElementById('loop-selector').value.trim();
                    const rowSelector = document.getElementById('loop-row-selector').value.trim();
                    
                    if (!loopSelector) {
                        alert('Please click on a table first');
                        return;
                    }
                    
                    window.recorderState.loops.push({
                        loopSelector,
                        rowSelector
                    });
                    
                    updateCounts();
                    document.getElementById('loop-form').style.display = 'none';
                    window.recorderState.looping = false;
                    alert('Loop saved! Each row will be processed with your extraction logic.');
                };
                
                document.getElementById('loop-cancel').onclick = () => {
                    document.getElementById('loop-form').style.display = 'none';
                    window.recorderState.looping = false;
                };
                
                // Condition definition
                document.getElementById('btn-condition').onclick = () => {
                    window.recorderState.conditioning = true;
                    window.recorderState.currentConditions = [];
                    document.getElementById('condition-form').style.display = 'block';
                    updateCondList();
                };
                
                const updateCondList = () => {
                    const list = document.getElementById('cond-list');
                    if (window.recorderState.currentConditions.length === 0) {
                        list.innerHTML = '<div style="color: #999;">No conditions yet (all records will be extracted)</div>';
                    } else {
                        list.innerHTML = window.recorderState.currentConditions.map((c, i) => 
                            `<div style="background: #333; padding: 3px 5px; border-radius: 2px; margin-bottom: 2px;">
                                Col ${c.column} ${c.operator} "${c.value}"
                                <span onclick="window.recorderState.currentConditions.splice(${i}, 1); updateCondList();" style="cursor: pointer; color: #ef4444; float: right;">✕</span>
                            </div>`
                        ).join('');
                    }
                };
                
                document.getElementById('add-cond').onclick = () => {
                    const column = parseInt(document.getElementById('cond-col').value);
                    const operator = document.getElementById('cond-op').value;
                    const value = document.getElementById('cond-val').value.trim();
                    
                    if ((operator !== 'exists' && operator !== 'not_exists') && (!column || !value)) {
                        alert('Column and value are required');
                        return;
                    }
                    
                    window.recorderState.currentConditions.push({column, operator, value});
                    updateCondList();
                    
                    document.getElementById('cond-col').value = '';
                    document.getElementById('cond-val').value = '';
                };
                
                document.getElementById('cond-save').onclick = () => {
                    window.recorderState.conditions.push({
                        filters: [...window.recorderState.currentConditions],
                        logic: 'AND'
                    });
                    
                    updateCounts();
                    document.getElementById('condition-form').style.display = 'none';
                    window.recorderState.conditioning = false;
                    alert('Conditions saved! Only matching records will be extracted.');
                };
                
                document.getElementById('cond-cancel').onclick = () => {
                    document.getElementById('condition-form').style.display = 'none';
                    window.recorderState.conditioning = false;
                };
                
                // Capture all interactions
                const captureAction = (type, details) => {
                    if (!window.recorderState.recording) return;
                    
                    window.recorderState.actions.push({
                        type,
                        timestamp: Date.now(),
                        ...details
                    });
                    updateCounts();
                    console.log('Captured:', type, details);
                };
                
                // Click events
                document.addEventListener('click', (e) => {
                    if (e.target.closest('#recorder-overlay')) return;
                    
                    // Loop mode - click table to select
                    if (window.recorderState.looping) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const table = e.target.closest('table');
                        if (table) {
                            let selector = '';
                            if (table.id) selector = `table#${table.id}`;
                            else if (table.className) selector = `table.${table.className.split(' ')[0]}`;
                            else selector = 'table';
                            
                            document.getElementById('loop-selector').value = selector;
                            table.style.outline = '3px solid #3b82f6';
                            setTimeout(() => table.style.outline = '', 2000);
                        }
                        return;
                    }
                    
                    // Marking mode
                    if (window.recorderState.marking) {
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
                        
                        let extractType = 'text';
                        if (el.tagName === 'A') extractType = 'href';
                        else if (el.tagName === 'IMG') extractType = 'src';
                        else if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') extractType = 'value';
                        
                        window.recorderState.pendingExtraction = {
                            selector,
                            extractType,
                            text: el.textContent?.trim().slice(0, 50) || '',
                            element: el
                        };
                        
                        const suggestedLabel = (el.id || el.name || 'field').replace(/[^a-z0-9]/gi, '_').toLowerCase();
                        document.getElementById('extract-label').value = suggestedLabel;
                        document.getElementById('mark-form').style.display = 'block';
                        document.getElementById('extract-label').focus();
                        
                        return;
                    }
                    
                    // Recording mode
                    if (window.recorderState.recording) {
                        const el = e.target;
                        let selector = '';
                        if (el.id) selector = `#${el.id}`;
                        else if (el.name) selector = `[name="${el.name}"]`;
                        else if (el.className && typeof el.className === 'string') {
                            const classes = el.className.split(' ').filter(c => c);
                            if (classes.length) selector = `.${classes[0]}`;
                        }
                        if (!selector) selector = el.tagName.toLowerCase();
                        
                        captureAction('click', {
                            selector,
                            text: el.textContent?.trim().slice(0, 50) || '',
                            href: el.href || null
                        });
                    }
                }, true);
                
                // Input events
                document.addEventListener('input', (e) => {
                    if (!window.recorderState.recording) return;
                    if (e.target.closest('#recorder-overlay')) return;
                    
                    const el = e.target;
                    let selector = '';
                    if (el.id) selector = `#${el.id}`;
                    else if (el.name) selector = `[name="${el.name}"]`;
                    else selector = el.tagName.toLowerCase();
                    
                    captureAction('input', {
                        selector,
                        value: el.value,
                        type: el.type || 'text'
                    });
                }, true);
                
                console.log('Session recorder ready');
            }
        """)
    
    def record_session(self):
        """Open browser and record session"""
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)
            page = browser.new_page()
            
            print(f"🌐 Opening {self.url}...")
            page.goto(self.url, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(2000)
            
            self.inject_recorder_overlay(page)
            
            print("\n" + "="*70)
            print("🎥 SESSION RECORDER")
            print("="*70)
            print("\nWORKFLOW:")
            print("  1. Click '▶️ Start Recording' button")
            print("  2. Perform your workflow (login, navigate, search)")
            print("  3. Click '📍 Mark Extraction' to mark fields to capture")
            print("  4. Click '⏹️ Stop & Review' when done")
            print("\nALL YOUR INTERACTIONS ARE CAPTURED:")
            print("  • Clicks")
            print("  • Text input")
            print("  • Navigation")
            print("  • Form submissions")
            print("="*70 + "\n")
            
            screenshot_count = 0
            
            while True:
                page.wait_for_timeout(500)
                
                try:
                    overlay_exists = page.evaluate("() => !!document.getElementById('recorder-overlay')")
                    if not overlay_exists:
                        self.inject_recorder_overlay(page)
                    
                    if page.evaluate("() => window.shouldScreenshot"):
                        screenshot_count += 1
                        path = self.output_dir / f"session_{screenshot_count}.png"
                        page.screenshot(path=path)
                        print(f"📸 Screenshot {screenshot_count}")
                        page.evaluate("() => window.shouldScreenshot = false")
                        self.screenshots.append(str(path))
                    
                    if page.evaluate("() => window.shouldFinish"):
                        break
                except Exception as e:
                    print(f"⚠️  {e}")
                    page.wait_for_timeout(1000)
            
            # Get recorded data
            try:
                data = page.evaluate("() => window.recorderState || {actions: [], extractions: [], loops: [], conditions: []}")
                self.actions = data.get('actions', [])
                self.extraction_points = data.get('extractions', [])
                self.loops = data.get('loops', [])
                self.conditions = data.get('conditions', [])
                
                print(f"\n✅ Session recorded:")
                print(f"   {len(self.actions)} actions")
                print(f"   {len(self.extraction_points)} extraction points")
                print(f"   {len(self.loops)} loops defined")
                print(f"   {len(self.conditions)} condition sets")
            except:
                pass
            
            browser.close()
    
    def generate_config(self):
        """Generate playback config with loops and conditions"""
        steps = []
        
        # Convert recorded actions to playback steps
        for action in self.actions:
            if action['type'] == 'click':
                steps.append({
                    "type": "click",
                    "selector": action['selector'],
                    "description": f"Click: {action.get('text', '')[:50]}"
                })
            elif action['type'] == 'input':
                steps.append({
                    "type": "fill",
                    "selector": action['selector'],
                    "value": action.get('value', ''),
                    "description": f"Fill: {action['selector']}"
                })
        
        # Add loop configuration
        if self.loops:
            loop_config = self.loops[0]  # Use first loop
            loop_step = {
                "type": "loop_table",
                "tableSelector": loop_config['loopSelector'],
                "rowSelector": loop_config.get('rowSelector', 'tbody tr'),
                "description": "Iterate through each row"
            }
            
            # Add filters if conditions exist
            if self.conditions:
                loop_step['filters'] = self.conditions[0].get('filters', [])
            
            # Add extractions to perform on each row
            loop_step['extractInRow'] = []
            for extraction in self.extraction_points:
                loop_step['extractInRow'].append({
                    "label": extraction.get('label', 'unknown'),
                    "selector": extraction['selector'],
                    "type": extraction.get('extractType', 'text')
                })
            
            steps.append(loop_step)
        else:
            # No loop - just add extraction steps
            for extraction in self.extraction_points:
                steps.append({
                    "type": "extract",
                    "label": extraction.get('label', 'unknown'),
                    "selector": extraction['selector'],
                    "extractType": extraction.get('extractType', 'text')
                })
        
        config = {
            "session": {
                "name": f"{self.state or 'Unknown'} {self.county or ''} Session".strip(),
                "recordedAt": datetime.now().isoformat(),
                "steps": steps
            },
            "metadata": {
                "siteId": f"{(self.state or 'unknown').lower()}-{(self.county or 'unknown').lower()}-{self.domain.replace('.', '-')}",
                "state": self.state,
                "county": self.county,
                "baseUrl": self.url,
                "actionCount": len(self.actions),
                "extractionCount": len(self.extraction_points),
                "loopCount": len(self.loops),
                "conditionCount": len(self.conditions),
                "screenshots": self.screenshots
            }
        }
        
        path = self.output_dir / "session_recording.json"
        with open(path, "w") as f:
            json.dump(config, f, indent=2)
        
        print(f"\n💾 Session saved: {path}")
        print(f"📁 Files: {self.output_dir}")
        
        print("\n" + "="*70)
        print("GENERATED CONFIG:")
        if self.loops:
            print(f"  • Loop through: {self.loops[0]['loopSelector']}")
            if self.conditions:
                print(f"  • Filter conditions: {len(self.conditions[0].get('filters', []))} filters (AND logic)")
            print(f"  • Extract {len(self.extraction_points)} fields per row")
        else:
            print("  • Single extraction (no loop)")
        print("="*70)
        
        return config


def main():
    parser = argparse.ArgumentParser(description="Session-Based Scraper Recorder")
    parser.add_argument("--url", required=True)
    parser.add_argument("--state", help="State code")
    parser.add_argument("--county", help="County name")
    args = parser.parse_args()
    
    recorder = SessionRecorder(args.url, args.state, args.county)
    recorder.record_session()
    recorder.generate_config()
    print("\n✅ Recording complete!")


if __name__ == "__main__":
    main()
