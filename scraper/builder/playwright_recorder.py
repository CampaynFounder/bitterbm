"""
Playwright Codegen Wrapper - Uses Playwright's built-in recorder

This is MUCH more reliable than trying to inject our own JavaScript.
Playwright's recorder is battle-tested and works on all sites.
"""

import subprocess
import sys
import json
from pathlib import Path

def record_session(url, output_dir):
    """
    Launch Playwright's built-in codegen recorder.
    It records all your interactions and generates Python code.
    """
    
    print("="*70)
    print("🎥 PLAYWRIGHT RECORDER")
    print("="*70)
    print("\n📋 Instructions:")
    print("  1. A browser will open with Playwright Inspector")
    print("  2. Perform your workflow (login, navigate, search)")
    print("  3. Click elements, fill forms, etc.")
    print("  4. Playwright records EVERYTHING automatically")
    print("  5. Close the browser when done")
    print("\n💡 The generated code will be converted to our flow format")
    print("="*70 + "\n")
    
    output_file = Path(output_dir) / "recorded_script.py"
    
    # Launch Playwright codegen
    cmd = [
        "playwright",
        "codegen",
        url,
        "--target", "python",
        "--output", str(output_file)
    ]
    
    print(f"🚀 Launching recorder for: {url}\n")
    
    try:
        subprocess.run(cmd, check=True)
        print(f"\n✅ Recording saved to: {output_file}")
        
        # Parse the generated Python code and convert to our format
        convert_to_flow(output_file)
        
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Error: {e}")
        print("\n💡 Make sure Playwright is installed:")
        print("   playwright install")
    except FileNotFoundError:
        print("\n❌ Playwright not found in PATH")
        print("\n💡 Install it with:")
        print("   pip install playwright")
        print("   playwright install")

def convert_to_flow(script_path):
    """
    Parse the generated Playwright Python code and convert it to our flow format.
    This extracts the high-level actions (click, fill, etc.) into JSON.
    """
    
    with open(script_path, 'r') as f:
        code = f.read()
    
    # Simple parsing - extract common patterns
    steps = []
    
    for line in code.split('\n'):
        line = line.strip()
        
        # page.goto(...)
        if 'page.goto(' in line:
            url = line.split('"')[1] if '"' in line else line.split("'")[1]
            steps.append({
                "type": "navigate",
                "config": {"url": url}
            })
        
        # page.fill(selector, value)
        elif 'page.fill(' in line:
            parts = line.split('"')
            if len(parts) >= 4:
                selector = parts[1]
                value = parts[3]
                steps.append({
                    "type": "fill",
                    "config": {"selector": selector, "value": value}
                })
        
        # page.click(selector)
        elif 'page.click(' in line:
            parts = line.split('"')
            if len(parts) >= 2:
                selector = parts[1]
                steps.append({
                    "type": "click",
                    "config": {"selector": selector}
                })
        
        # page.select_option(selector, value)
        elif 'page.select_option(' in line:
            parts = line.split('"')
            if len(parts) >= 4:
                selector = parts[1]
                value = parts[3]
                steps.append({
                    "type": "select",
                    "config": {"selector": selector, "value": value}
                })
        
        # page.press(selector, key)
        elif 'page.press(' in line:
            parts = line.split('"')
            if len(parts) >= 4:
                selector = parts[1]
                key = parts[3]
                steps.append({
                    "type": "press_key",
                    "config": {"selector": selector, "key": key}
                })
    
    # Save as JSON flow
    flow = {
        "name": "Recorded Flow",
        "steps": steps,
        "metadata": {
            "recordedWith": "playwright-codegen",
            "stepCount": len(steps)
        }
    }
    
    output_path = script_path.parent / "flow.json"
    with open(output_path, 'w') as f:
        json.dump(flow, f, indent=2)
    
    print(f"\n✅ Flow saved to: {output_path}")
    print(f"📊 Captured {len(steps)} steps\n")
    
    # Print summary
    print("="*70)
    print("RECORDED STEPS:")
    print("="*70)
    for i, step in enumerate(steps, 1):
        config = step.get('config', {})
        if step['type'] == 'navigate':
            print(f"  {i}. Navigate to {config.get('url', 'unknown')}")
        elif step['type'] == 'fill':
            print(f"  {i}. Fill '{config.get('selector', 'unknown')}' = '{config.get('value', '')}'")
        elif step['type'] == 'click':
            print(f"  {i}. Click '{config.get('selector', 'unknown')}'")
        elif step['type'] == 'select':
            print(f"  {i}. Select '{config.get('value', '')}' in '{config.get('selector', 'unknown')}'")
        else:
            print(f"  {i}. {step['type']}")
    print("="*70)
    
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
