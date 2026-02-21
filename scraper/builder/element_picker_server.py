"""
Element Picker Server - Launches browser and captures element selectors

Run this server, then click "Open Element Picker" in the visual builder.
It will open a browser where you can click elements to get their selectors.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from playwright.sync_api import sync_playwright
import threading
import json

app = Flask(__name__)
CORS(app)

# Global state
picker_page = None
picker_browser = None
current_url = None

@app.route('/api/picker/launch', methods=['POST'])
def launch_picker():
    """Launch browser with element picker"""
    global picker_page, picker_browser, current_url
    
    data = request.json
    url = data.get('url', 'https://example.com')
    current_url = url
    
    def launch_browser():
        global picker_page, picker_browser
        
        playwright = sync_playwright().start()
        picker_browser = playwright.chromium.launch(headless=False)
        context = picker_browser.new_context()
        picker_page = context.new_page()
        
        # Navigate to URL
        picker_page.goto(url, wait_until="networkidle", timeout=60000)
        picker_page.wait_for_timeout(1000)
        
        # Inject element picker overlay
        picker_page.evaluate("""
            () => {
                // IMMEDIATELY block all clicks and mousedowns at the earliest possible phase
                window.addEventListener('mousedown', (e) => {
                    const overlay = document.getElementById('element-picker-overlay');
                    if (overlay && !e.target.closest('#element-picker-overlay')) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    }
                }, {capture: true, passive: false});
                
                window.addEventListener('click', (e) => {
                    const overlay = document.getElementById('element-picker-overlay');
                    if (overlay && !e.target.closest('#element-picker-overlay')) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    }
                }, {capture: true, passive: false});
                
                // Block mouseup too
                window.addEventListener('mouseup', (e) => {
                    const overlay = document.getElementById('element-picker-overlay');
                    if (overlay && !e.target.closest('#element-picker-overlay')) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                    }
                }, {capture: true, passive: false});
                
                // Block form submissions
                window.addEventListener('submit', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }, {capture: true, passive: false});
                
                // Create visual indicator
                const indicator = document.createElement('div');
                indicator.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 10px;
                    text-align: center;
                    z-index: 99999998;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    font-weight: bold;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                `;
                indicator.innerHTML = '🎯 ELEMENT PICKER ACTIVE - Click any element to select it';
                document.body.appendChild(indicator);
                
                // Create overlay
                const overlay = document.createElement('div');
                overlay.id = 'element-picker-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 60px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.95);
                    color: white;
                    padding: 20px;
                    border-radius: 12px;
                    z-index: 99999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    min-width: 250px;
                `;
                
                overlay.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 15px; font-size: 16px;">
                        🎯 Element Picker
                    </div>
                    <div style="margin-bottom: 15px; padding: 12px; background: rgba(102, 126, 234, 0.3); border-radius: 8px; font-size: 13px;">
                        Hover to preview<br>
                        Click to select
                    </div>
                    <div style="font-size: 12px; color: #aaa; margin-bottom: 10px;">
                        Selected Element:
                    </div>
                    <div id="selected-info" style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px; font-size: 12px; font-family: monospace; word-break: break-all; margin-bottom: 15px; min-height: 60px; color: #4ade80;">
                        None - click an element
                    </div>
                    <button id="copy-selector" disabled style="width: 100%; padding: 10px; background: #667eea; border: none; border-radius: 8px; color: white; font-weight: bold; cursor: not-allowed; margin-bottom: 8px; font-size: 13px;">
                        📋 Copy & Send Selector
                    </button>
                    <button id="close-picker" style="width: 100%; padding: 10px; background: #ef4444; border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 13px;">
                        ✕ Close Picker
                    </button>
                `;
                
                document.body.appendChild(overlay);
                
                window.selectedElement = null;
                window.lastHighlighted = null;
                
                // Highlight on hover
                document.addEventListener('mousemove', (e) => {
                    if (e.target.closest('#element-picker-overlay') || e.target.closest('div[style*="ELEMENT PICKER ACTIVE"]')) return;
                    
                    if (window.lastHighlighted && window.lastHighlighted !== window.selectedElement) {
                        window.lastHighlighted.style.outline = '';
                        window.lastHighlighted.style.backgroundColor = '';
                    }
                    
                    e.target.style.outline = '2px dashed #667eea';
                    e.target.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
                    window.lastHighlighted = e.target;
                }, true);
                
                // Select on mousedown (fires before click, harder to block)
                setTimeout(() => {
                    document.addEventListener('mousedown', (e) => {
                        if (e.target.closest('#element-picker-overlay')) return;
                        
                        const el = e.target;
                        
                        console.log('Element clicked:', el);
                        
                        // Clear previous selection
                        if (window.selectedElement) {
                            window.selectedElement.style.outline = '';
                            window.selectedElement.style.backgroundColor = '';
                        }
                        
                        // Highlight selected
                        el.style.outline = '3px solid #22c55e !important';
                        el.style.backgroundColor = 'rgba(34, 197, 94, 0.2) !important';
                        window.selectedElement = el;
                        
                        // Generate selector
                        let selector = '';
                        if (el.id) {
                            selector = `#${el.id}`;
                        } else if (el.name) {
                            selector = `[name="${el.name}"]`;
                        } else if (el.className && typeof el.className === 'string') {
                            const classes = el.className.split(' ').filter(c => c && !c.includes('picker'));
                            if (classes.length > 0) {
                                selector = `.${classes[0]}`;
                            }
                        }
                        
                        if (!selector) {
                            selector = el.tagName.toLowerCase();
                            
                            // Try to make it more specific
                            let parent = el.parentElement;
                            if (parent && parent.tagName !== 'BODY') {
                                let parentSelector = parent.tagName.toLowerCase();
                                if (parent.id) parentSelector = `#${parent.id}`;
                                else if (parent.className) {
                                    const pClasses = parent.className.split(' ').filter(c => c);
                                    if (pClasses.length) parentSelector = `.${pClasses[0]}`;
                                }
                                selector = `${parentSelector} > ${selector}`;
                            }
                        }
                        
                        // Get element info
                        const info = {
                            selector,
                            tag: el.tagName.toLowerCase(),
                            text: el.textContent?.trim().slice(0, 50) || '',
                            value: el.value || '',
                            href: el.href || '',
                            type: el.type || '',
                            name: el.name || '',
                            id: el.id || ''
                        };
                        
                        window.selectedInfo = info;
                        
                        console.log('Selected:', info);
                        
                        // Update UI
                        document.getElementById('selected-info').innerHTML = `
                            <div style="color: #4ade80; font-weight: bold; margin-bottom: 5px; font-size: 11px;">${selector}</div>
                            <div style="color: #fff; margin-bottom: 3px; font-size: 11px;">Tag: ${el.tagName}</div>
                            <div style="color: #aaa; font-size: 10px;">${info.text || info.value || '(empty)'}</div>
                        `;
                        
                        const copyBtn = document.getElementById('copy-selector');
                        copyBtn.disabled = false;
                        copyBtn.style.cursor = 'pointer';
                        copyBtn.style.background = '#22c55e';
                        
                    }, {capture: true, passive: false});
                }, 100);
                
                // Copy selector
                document.getElementById('copy-selector').onclick = () => {
                    if (window.selectedInfo) {
                        navigator.clipboard.writeText(window.selectedInfo.selector);
                        
                        // Send to parent window via postMessage
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'ELEMENT_SELECTED',
                                data: window.selectedInfo
                            }, '*');
                        }
                        
                        // Visual feedback
                        const btn = document.getElementById('copy-selector');
                        const originalText = btn.innerHTML;
                        btn.innerHTML = '✅ Sent to Builder!';
                        btn.style.background = '#10b981';
                        setTimeout(() => {
                            btn.innerHTML = originalText;
                            btn.style.background = '#22c55e';
                        }, 2000);
                    }
                };
                
                // Close picker
                document.getElementById('close-picker').onclick = () => {
                    window.close();
                };
            }
        """)
    
    # Launch in thread so we don't block
    thread = threading.Thread(target=launch_browser)
    thread.daemon = True
    thread.start()
    
    return jsonify({'status': 'launching'})

@app.route('/api/picker/close', methods=['POST'])
def close_picker():
    """Close the picker browser"""
    global picker_page, picker_browser
    
    if picker_browser:
        picker_browser.close()
        picker_browser = None
        picker_page = None
    
    return jsonify({'status': 'closed'})

if __name__ == '__main__':
    print("="*70)
    print("🎯 Element Picker Server")
    print("="*70)
    print("\n  Running on: http://localhost:5555")
    print("  Open the Visual Builder and click 'Open Element Picker'\n")
    print("="*70 + "\n")
    
    app.run(host='0.0.0.0', port=5555, debug=True, use_reloader=False)
