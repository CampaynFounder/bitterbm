"""
Cobb County Court Scraper
Based on recorded Playwright actions, enhanced with loop and condition logic
"""

import re
from playwright.sync_api import Playwright, sync_playwright
import json
from pathlib import Path


def scrape_cobb_county_civil(playwright: Playwright, search_params: dict) -> list:
    """
    Scrape Cobb County civil cases with conditions and loops
    
    Args:
        search_params: {
            "party_name": "jo%n%",
            "date_from": "01/01/2020",
            "date_to": "12/31/2024",
            "case_types": ["Superior Civil"],
            "conditions": [
                {"column": 5, "operator": "equals", "value": "53"},
                {"column": 6, "operator": "equals", "value": "Other Domestic Relations"}
            ]
        }
    
    Returns:
        List of case data matching conditions
    """
    
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context()
    page = context.new_page()
    
    results = []
    
    # Navigate to site
    print("🌐 Navigating to Cobb County Court site...")
    page.goto("https://superiorcourtclerk.cobbcounty.gov/WebCaseManagement/mainpage.aspx")
    
    # Get iframe context (important!)
    iframe = page.locator("iframe").content_frame
    
    # Navigate to Civil Search
    print("📋 Opening Civil Search...")
    iframe.get_by_role("link", name="Civil Search").click()
    
    # Fill search form
    print(f"🔍 Searching for: {search_params.get('party_name', '')}")
    iframe.locator("#tbSearch4").fill(search_params.get("party_name", ""))
    iframe.locator("#tbFiledFrom").fill(search_params.get("date_from", ""))
    iframe.locator("#tbFiledTo").fill(search_params.get("date_to", ""))
    
    # Select case types
    for case_type in search_params.get("case_types", []):
        iframe.get_by_role("checkbox", name=case_type).check()
    
    # Click search
    iframe.get_by_role("button", name="Search").click()
    page.wait_for_timeout(2000)  # Wait for results
    
    # Loop through result rows
    print("\n🔄 Processing results...")
    
    # Get all result rows (adjust selector based on actual table structure)
    rows = iframe.locator("table tbody tr").all()
    
    print(f"Found {len(rows)} total rows")
    
    for i, row in enumerate(rows, 1):
        try:
            # Extract all cells
            cells = row.locator("td").all()
            if len(cells) < 8:
                continue  # Skip header or empty rows
            
            # Get cell values (adjust indices based on actual columns)
            case_number = cells[0].inner_text().strip()
            parties = cells[1].inner_text().strip()
            case_type_code = cells[4].inner_text().strip()  # Column 5 (0-indexed = 4)
            case_type_desc = cells[5].inner_text().strip()  # Column 6 (0-indexed = 5)
            judge = cells[7].inner_text().strip() if len(cells) > 7 else ""
            
            print(f"\n📄 Row {i}: Case {case_number}")
            print(f"   Type: {case_type_code} - {case_type_desc}")
            
            # Apply conditions (AND logic)
            conditions = search_params.get("conditions", [])
            meets_conditions = True
            
            for condition in conditions:
                col_index = condition["column"] - 1  # Convert to 0-indexed
                operator = condition["operator"]
                expected_value = condition["value"]
                
                if col_index >= len(cells):
                    meets_conditions = False
                    break
                
                actual_value = cells[col_index].inner_text().strip()
                
                if operator == "equals":
                    if actual_value != expected_value:
                        meets_conditions = False
                        print(f"   ❌ Condition failed: Column {condition['column']} = '{actual_value}' (expected '{expected_value}')")
                        break
                elif operator == "contains":
                    if expected_value not in actual_value:
                        meets_conditions = False
                        break
                elif operator == "in":
                    if actual_value not in expected_value:
                        meets_conditions = False
                        break
            
            if not meets_conditions:
                print(f"   ⏭️  Skipping (doesn't meet conditions)")
                continue
            
            print(f"   ✅ Meets all conditions!")
            
            # Click to view details (expand row)
            expand_icon = row.locator("img[src*='add.png']").first
            if expand_icon.count() > 0:
                expand_icon.click()
                page.wait_for_timeout(1000)
            
            # Extract case details
            case_data = {
                "case_number": case_number,
                "parties": parties,
                "case_type_code": case_type_code,
                "case_type_desc": case_type_desc,
                "judge": judge,
                "events": []
            }
            
            # Check for nested events table
            # Look for sibling row with nested table
            try:
                # Find events table (adjust selector based on actual structure)
                events_table = iframe.locator(f"#EventGrid, table[id*='Event']").first
                if events_table.count() > 0:
                    event_rows = events_table.locator("tbody tr").all()
                    
                    for event_row in event_rows:
                        event_cells = event_row.locator("td").all()
                        if len(event_cells) >= 3:
                            event_type = event_cells[2].inner_text().strip()
                            
                            # Check for specific event types
                            if "ORDER FINAL" in event_type or "PARENTING PLAN" in event_type:
                                # Check for PDF link in column 4
                                pdf_link = event_cells[3].locator("a").first
                                if pdf_link.count() > 0:
                                    pdf_href = pdf_link.get_attribute("href")
                                    case_data["events"].append({
                                        "type": event_type,
                                        "pdf_link": pdf_href
                                    })
                                    
                                    print(f"   📄 Found event: {event_type}")
                                    
                                    # Download/screenshot PDF if needed
                                    if pdf_href:
                                        print(f"   🔗 PDF: {pdf_href}")
                                        # Optional: Open PDF and take screenshots
                                        # handle_pdf(page, pdf_href, case_number, event_type)
            except Exception as e:
                print(f"   ⚠️  Could not process events: {e}")
            
            results.append(case_data)
            
        except Exception as e:
            print(f"   ❌ Error processing row {i}: {e}")
            continue
    
    # Close browser
    context.close()
    browser.close()
    
    return results


def handle_pdf(page, pdf_url, case_number, event_type):
    """Optional: Open PDF and take screenshots of each page"""
    with page.expect_popup() as page1_info:
        # Click PDF link
        pass
    
    pdf_page = page1_info.value
    pdf_iframe = pdf_page.locator("iframe[title=\"webviewer\"]").content_frame
    
    # Get total pages
    # Take screenshots of each page
    page_num = 1
    while True:
        # Screenshot current page
        pdf_page.screenshot(path=f"output/{case_number}_{event_type}_page_{page_num}.png")
        
        # Try to go to next page
        next_btn = pdf_iframe.get_by_title("Next Page")
        if next_btn.count() == 0 or not next_btn.is_enabled():
            break
        
        next_btn.click()
        page_num += 1
    
    pdf_page.close()


def main():
    # Example search parameters
    search_params = {
        "party_name": "john",  # Use wildcards: jo%n%
        "date_from": "01/01/2020",
        "date_to": "12/31/2024",
        "case_types": ["Superior Civil"],
        "conditions": [
            {"column": 5, "operator": "equals", "value": "53"},
            {"column": 6, "operator": "equals", "value": "Other Domestic Relations"}
        ]
    }
    
    with sync_playwright() as playwright:
        results = scrape_cobb_county_civil(playwright, search_params)
        
        # Save results
        output_dir = Path("output")
        output_dir.mkdir(exist_ok=True)
        
        output_file = output_dir / "cobb_county_results.json"
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2)
        
        print(f"\n✅ Complete! Found {len(results)} matching cases")
        print(f"📁 Results saved to: {output_file}")


if __name__ == "__main__":
    main()
