"""
Visual Scraper Builder - AI-powered selector generation from screenshots and descriptions

Usage:
  python scraper/builder/visual_scraper_builder.py --url "https://example.com" --describe "case number, judge, PDF links"
  
With auth (pause for manual login):
  python scraper/builder/visual_scraper_builder.py --url "https://example.com" --auth-pause 30 --describe "..."
  
With state/county context:
  python scraper/builder/visual_scraper_builder.py --url "..." --describe "..." --state GA --county Cobb
"""

import argparse
import base64
import json
import re
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Install playwright: pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)


def analyze_page(url, auth_pause_seconds=0):
    """Capture page structure, screenshot, and element metadata"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False if auth_pause_seconds else True)
        page = browser.new_page()
        
        print(f"🌐 Navigating to {url}...")
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        
        if auth_pause_seconds:
            print(f"⏸️  Paused for {auth_pause_seconds}s - log in manually if needed")
            page.wait_for_timeout(auth_pause_seconds * 1000)
        
        # Capture screenshot
        screenshot_path = Path("scraper/builder/page_screenshot.png")
        screenshot_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=screenshot_path, full_page=False)  # Viewport only for speed
        print(f"📸 Screenshot saved: {screenshot_path}")
        
        # Extract page structure
        print("🔍 Analyzing page elements...")
        structure = page.evaluate("""
            () => {
                const elements = [];
                
                function generateSelector(el) {
                    if (el.id) return `#${el.id}`;
                    if (el.name) return `[name="${el.name}"]`;
                    if (el.className && typeof el.className === 'string') {
                        const classes = el.className.split(' ').filter(c => c && !c.match(/^(active|selected|hidden|focus)/));
                        if (classes.length === 1) return `.${classes[0]}`;
                        if (classes.length > 1) return `.${classes.slice(0, 2).join('.')}`;
                    }
                    const tag = el.tagName.toLowerCase();
                    const parent = el.parentElement;
                    if (!parent) return tag;
                    const siblings = [...parent.children].filter(c => c.tagName === el.tagName);
                    const index = siblings.indexOf(el);
                    return `${tag}:nth-of-type(${index + 1})`;
                }
                
                // Forms and inputs
                document.querySelectorAll('form, input:not([type="hidden"]), select, textarea, button[type="submit"]').forEach(el => {
                    elements.push({
                        type: 'form_element',
                        tag: el.tagName.toLowerCase(),
                        inputType: el.type || '',
                        id: el.id || '',
                        name: el.name || '',
                        classes: el.className || '',
                        text: el.textContent?.trim().slice(0, 100) || '',
                        placeholder: el.placeholder || '',
                        value: el.value || '',
                        selector: generateSelector(el)
                    });
                });
                
                // Tables
                document.querySelectorAll('table').forEach((table, i) => {
                    const headers = [...table.querySelectorAll('th')].map(th => th.textContent.trim());
                    const firstRow = table.querySelector('tbody tr');
                    const sampleCells = firstRow ? [...firstRow.querySelectorAll('td')].slice(0, 5).map(td => td.textContent.trim().slice(0, 50)) : [];
                    elements.push({
                        type: 'table',
                        index: i,
                        id: table.id || '',
                        classes: table.className || '',
                        headers: headers,
                        rowCount: table.querySelectorAll('tbody tr').length,
                        sampleCells: sampleCells,
                        selector: generateSelector(table)
                    });
                });
                
                // Links (especially PDF/doc links)
                document.querySelectorAll('a').forEach(link => {
                    const href = link.href || '';
                    const text = link.textContent?.trim() || '';
                    const isPdf = href.toLowerCase().includes('.pdf') || text.toLowerCase().includes('pdf') || text.toLowerCase().includes('view');
                    if (isPdf || href.includes('document') || href.includes('file')) {
                        elements.push({
                            type: 'document_link',
                            text: text.slice(0, 100),
                            href: href,
                            selector: generateSelector(link),
                            isPdf: href.toLowerCase().includes('.pdf')
                        });
                    }
                });
                
                // Iframes
                document.querySelectorAll('iframe').forEach(iframe => {
                    elements.push({
                        type: 'iframe',
                        id: iframe.id || '',
                        name: iframe.name || '',
                        src: iframe.src || '',
                        selector: generateSelector(iframe)
                    });
                });
                
                // Buttons and clickable elements
                document.querySelectorAll('button:not([type="submit"]), [role="button"], .btn, input[type="button"]').forEach(btn => {
                    elements.push({
                        type: 'button',
                        text: btn.textContent?.trim().slice(0, 50) || '',
                        id: btn.id || '',
                        classes: btn.className || '',
                        selector: generateSelector(btn)
                    });
                });
                
                return elements;
            }
        """)
        
        # Get cleaned HTML sample
        html_sample = page.content()[:50000]
        
        browser.close()
        
        return {
            "url": url,
            "screenshot": str(screenshot_path),
            "structure": structure,
            "html_sample": html_sample
        }


def generate_scraper_with_ai(page_data, user_goals, state=None, county=None):
    """Use Claude to suggest selectors based on visual analysis"""
    try:
        import anthropic
    except ImportError:
        print("⚠️  anthropic not installed. Install with: pip install anthropic", file=sys.stderr)
        return generate_scraper_fallback(page_data, user_goals, state, county)
    
    try:
        client = anthropic.Anthropic()
    except Exception as e:
        print(f"⚠️  Claude API not configured: {e}", file=sys.stderr)
        return generate_scraper_fallback(page_data, user_goals, state, county)
    
    # Read screenshot
    with open(page_data["screenshot"], "rb") as f:
        screenshot_b64 = base64.b64encode(f.read()).decode()
    
    context = ""
    if state or county:
        context = f"\nGEOGRAPHIC CONTEXT: State={state or 'N/A'}, County={county or 'N/A'}"
    
    prompt = f"""Analyze this court/public records webpage and generate a Playwright scraper configuration.

USER GOALS: {user_goals}{context}

PAGE STRUCTURE (found elements):
{json.dumps(page_data["structure"], indent=2)}

Generate a complete scraper configuration that:
1. Navigates to the page
2. Handles any iframes if present
3. Fills search forms (if applicable)
4. Extracts the data points mentioned in USER GOALS
5. Handles PDF links and documents
6. Includes state/county in extracted data if specified

Return ONLY valid JSON in this exact format:
{{
  "flow": {{
    "name": "{{state or 'Unknown'}} {{county or ''}} Scraper",
    "steps": [
      {{"type": "navigate", "config": {{"url": "{page_data['url']}"}}}},
      {{"type": "switch_frame", "config": {{"selector": "iframe_selector_if_needed"}}}},
      {{"type": "fill_field", "config": {{"selector": "input_selector", "value": "search_value"}}}},
      {{"type": "click", "config": {{"selector": "submit_button"}}}},
      {{"type": "wait", "config": {{"selector": "results_table"}}}},
      {{"type": "extract_field", "config": {{"fieldId": "case_number", "selector": "..."}}}}
    ]
  }},
  "siteConfig": {{
    "siteId": "{{state or 'unknown'}}-{{county or 'unknown'}}-courts",
    "baseUrl": "{page_data['url']}",
    "resultTable": {{
      "tableSelector": "table_css_selector",
      "rowSelector": "tbody tr",
      "primaryId": {{"source": "column", "columnIndex": 0}},
      "extractColumns": [
        {{"columnIndex": 0, "outputKey": "case_number"}},
        {{"columnIndex": 1, "outputKey": "parties"}}
      ]
    }}
  }}
}}

CRITICAL:
- Use ONLY stable selectors from the structure (prefer id, name, unique class)
- For tables: identify which column has case numbers, which has names, etc.
- For PDFs: use the document_link selectors found
- Include iframe handling if type='iframe' elements exist
- Return ONLY the JSON, no markdown formatting"""
    
    try:
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4000,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": screenshot_b64
                        }
                    },
                    {"type": "text", "text": prompt}
                ]
            }]
        )
        
        return response.content[0].text
    except Exception as e:
        print(f"⚠️  Claude API error: {e}", file=sys.stderr)
        return generate_scraper_fallback(page_data, user_goals, state, county)


def generate_scraper_fallback(page_data, user_goals, state=None, county=None):
    """Fallback: Generate basic scraper template without AI"""
    structure = page_data["structure"]
    
    # Find key elements
    tables = [e for e in structure if e["type"] == "table"]
    forms = [e for e in structure if e["type"] == "form_element" and e["tag"] == "form"]
    inputs = [e for e in structure if e["type"] == "form_element" and e["tag"] == "input"]
    buttons = [e for e in structure if e["type"] == "form_element" and e["tag"] == "button"]
    pdfs = [e for e in structure if e["type"] == "document_link" and e.get("isPdf")]
    iframes = [e for e in structure if e["type"] == "iframe"]
    
    steps = [
        {"type": "navigate", "config": {"url": page_data["url"]}}
    ]
    
    if iframes:
        steps.append({"type": "switch_frame", "config": {"selector": iframes[0]["selector"]}})
    
    if inputs:
        steps.append({"type": "fill_field", "config": {"selector": inputs[0]["selector"], "value": "{{search_value}}"}})
    
    if buttons:
        steps.append({"type": "click", "config": {"selector": buttons[0]["selector"]}})
    
    if tables:
        steps.append({"type": "wait", "config": {"selector": tables[0]["selector"]}})
    
    config = {
        "flow": {
            "name": f"{state or 'Unknown'} {county or ''} Scraper".strip(),
            "steps": steps
        },
        "siteConfig": {
            "siteId": f"{state or 'unknown'}-{county or 'unknown'}-courts".lower(),
            "baseUrl": page_data["url"],
            "resultTable": {
                "tableSelector": tables[0]["selector"] if tables else "table",
                "rowSelector": "tbody tr",
                "primaryId": {"source": "column", "columnIndex": 0},
                "extractColumns": [
                    {"columnIndex": i, "outputKey": f"column_{i}"} for i in range(min(3, len(tables[0].get("headers", [])) if tables else 3))
                ]
            } if tables else {}
        }
    }
    
    return json.dumps(config, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Visual Scraper Builder - AI-powered")
    parser.add_argument("--url", required=True, help="URL to analyze")
    parser.add_argument("--describe", required=True, help="What to scrape: 'case number, judge, PDF links'")
    parser.add_argument("--auth-pause", type=int, default=0, help="Seconds to pause for manual login")
    parser.add_argument("--state", help="State code (e.g. GA)")
    parser.add_argument("--county", help="County name (e.g. Cobb)")
    parser.add_argument("--output", default="scraper/builder/generated_scraper.json", help="Output file")
    args = parser.parse_args()
    
    print("=" * 60)
    print("Visual Scraper Builder")
    print("=" * 60)
    
    # Step 1: Analyze page
    page_data = analyze_page(args.url, args.auth_pause)
    
    print(f"\n📊 Found {len(page_data['structure'])} elements:")
    element_counts = {}
    for elem in page_data['structure']:
        element_counts[elem['type']] = element_counts.get(elem['type'], 0) + 1
    for elem_type, count in element_counts.items():
        print(f"  - {count} {elem_type}(s)")
    
    # Step 2: Generate scraper with AI
    print(f"\n🤖 Generating scraper configuration...")
    print(f"   Goal: {args.describe}")
    if args.state or args.county:
        print(f"   Context: {args.state or ''} {args.county or ''}")
    
    scraper_text = generate_scraper_with_ai(page_data, args.describe, args.state, args.county)
    
    # Step 3: Save output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        # Try to extract and validate JSON
        json_match = re.search(r'\{.*\}', scraper_text, re.DOTALL)
        if json_match:
            config = json.loads(json_match.group())
            with open(output_path, "w") as f:
                json.dump(config, f, indent=2)
            print(f"\n✅ Generated scraper configuration")
        else:
            # Save raw response
            with open(output_path, "w") as f:
                f.write(scraper_text)
            print(f"\n⚠️  Could not parse JSON, saved raw response")
    except json.JSONDecodeError as e:
        print(f"\n⚠️  JSON parse error: {e}")
        with open(output_path.with_suffix('.txt'), "w") as f:
            f.write(scraper_text)
        output_path = output_path.with_suffix('.txt')
    
    print(f"💾 Saved to: {output_path}")
    print(f"📸 Screenshot: {page_data['screenshot']}")
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
